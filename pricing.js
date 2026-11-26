(() => {
  "use strict";
  // Marketing preview only: paid assignments and distinct-human volume tiers
  // are server-verified at purchase. The second slider shows the minimum
  // distinct people implied by equal-sized repository assignment counts.
  const byId = id => document.getElementById(id);
  const repositories = byId("repo-count");
  const contributors = byId("seat-count");
  const flow = typeof DecapodCloudFlow !== "undefined" ? DecapodCloudFlow : null;
  if (!repositories || !contributors) return;

  const PRICING_ASSET_RELEASE = "20261125-commercial";
  const PRICING_META_KEY = "decapod:pricing-meta";
  const ALLOWLISTED_RECOVERY_ERRORS = Object.freeze([
    "stale_quote",
    "quote_expired",
    "quote_mismatch",
    "pricing_mismatch",
    "pricing_version_changed",
    "checkout_expired"
  ]);

  function hasCompatibleFlow(candidate) {
    return Boolean(
      candidate &&
      candidate.CONTRACT_VERSION === 1 &&
      candidate.ASSET_RELEASE === PRICING_ASSET_RELEASE &&
      typeof candidate.isAllowedSiteOrigin === "function" &&
      typeof candidate.parseRepoSearch === "function" &&
      typeof candidate.parseRepoSlug === "function" &&
      typeof candidate.parseSafeReturnParam === "function" &&
      typeof candidate.hasHostileFragmentTokens === "function" &&
      typeof candidate.validateSessionRecord === "function" &&
      typeof candidate.buildSignupHandoffUrl === "function" &&
      typeof candidate.buildAuthAuthorizeUrl === "function" &&
      typeof candidate.isTrustedAuthUrl === "function" &&
      typeof candidate.discoverRuntimeConfig === "function" &&
      typeof candidate.checkPageCoherence === "function" &&
      typeof candidate.scrubSensitiveLocation === "function" &&
      typeof candidate.createCoherenceChannel === "function" &&
      typeof candidate.randomSecret === "function" &&
      typeof candidate.sha256Base64Url === "function"
    );
  }

  const steps = Object.freeze({
    repos: [[3, 2], [6, 4], [10, 6]],
    people: [[5, 2], [10, 4], [20, 6]]
  });
  let annual = false;
  let showAnnualDetails = false;

  // Live purchasing stays gated ('UNDER WRAPS') unless an explicit server profile
  // enables commercial checkout. Client state never grants purchase authority.
  let liveSaleEnabled = false;
  let activeProfile = null;
  let validatedRepoSlug = null;
  let repoBannerState = "none"; // "none" | "valid" | "invalid" | "hostile"
  let skewBlocked = false;
  let skewReason = null;
  let crossTabMismatch = null;
  let recoveryNotice = null;
  let discoveryUnavailable = false;
  let discoveryStatus = "pending";
  let discoveryCorrelationId = null;
  let discoveryRetryAfterSec = null;
  let discoveryEpoch = 0;
  let payInFlight = false;

  const coherence = hasCompatibleFlow(flow)
    ? flow.checkPageCoherence({
        document: typeof document !== "undefined" ? document : null,
        requiredIds: ["repo-count", "seat-count", "cloud-pay-cta", "preview-checkout"],
        strictRelease: true
      })
    : { ok: false, reason: "incompatible_cloud_flow" };
  if (!coherence.ok) {
    skewBlocked = true;
    skewReason = coherence.reason || "pricing_manifest_skew";
  }

  const tier = (count, points) => points.reduce(
    (amount, [minimum, discount]) => count >= minimum ? discount : amount, 0
  );
  const change = (id, value, property = "textContent") => {
    const node = byId(id);
    if (node) node[property] = value;
  };

  function siteOrigin() {
    if (hasCompatibleFlow(flow) && typeof location !== "undefined" && flow.isAllowedSiteOrigin(location.origin)) {
      return location.origin;
    }
    return flow && flow.CANONICAL_SITE_ORIGIN ? flow.CANONICAL_SITE_ORIGIN : "https://decapodlabs.ai";
  }

  function readExistingSession(projectOrigin) {
    if (!hasCompatibleFlow(flow) || typeof sessionStorage === "undefined" || !projectOrigin) return null;
    try {
      const raw = sessionStorage.getItem("decapod-portal:" + projectOrigin + ":session");
      if (!raw || raw.length > 24576) return null;
      const parsed = JSON.parse(raw);
      return flow.validateSessionRecord(parsed, projectOrigin) ? parsed : null;
    } catch (_) {
      return null;
    }
  }

  function readPricingMeta() {
    if (typeof sessionStorage === "undefined") return null;
    try {
      const raw = sessionStorage.getItem(PRICING_META_KEY);
      if (!raw || raw.length > 8192) return null;
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
    } catch (_) {
      return null;
    }
  }

  function clearStalePricingState(knownProjectOrigin) {
    if (typeof sessionStorage === "undefined") return;
    try {
      sessionStorage.removeItem(PRICING_META_KEY);
      if (knownProjectOrigin && hasCompatibleFlow(flow) && flow.isTrustedApiOrigin(knownProjectOrigin)) {
        sessionStorage.removeItem("decapod-portal:" + knownProjectOrigin + ":flow");
      }
      if (activeProfile && activeProfile.projectOrigin) {
        sessionStorage.removeItem("decapod-portal:" + activeProfile.projectOrigin + ":flow");
      }
    } catch (_) {}
  }

  function writePricingMeta(profile) {
    if (typeof sessionStorage === "undefined" || !profile) return;
    try {
      sessionStorage.setItem(PRICING_META_KEY, JSON.stringify({
        asset_release: PRICING_ASSET_RELEASE,
        contract_version: flow.CONTRACT_VERSION,
        pricing_version: profile.pricingVersion || null,
        project_origin: profile.projectOrigin,
        updated_at: Math.floor(Date.now() / 1000)
      }));
    } catch (_) {}
  }

  function scrubPricingLocation() {
    if (typeof location === "undefined" || typeof history === "undefined" || !history.replaceState) return;
    if (hasCompatibleFlow(flow)) {
      flow.scrubSensitiveLocation(location, history, { extraKeys: ["pricing_error"] });
      return;
    }
    const search = new URLSearchParams(location.search || "");
    const sensitive = ["repo", "return_to", "redirect_to", "code", "login_nonce", "access_token", "refresh_token", "provider_token", "token", "invitation_id", "invitation_secret", "error", "error_description", "pricing_error"];
    let changed = false;
    for (const k of sensitive) {
      if (search.has(k)) {
        search.delete(k);
        changed = true;
      }
    }
    const hash = location.hash || "";
    const hostileHash = /access_token|refresh_token|provider_token/i.test(hash);
    if (changed || hostileHash) {
      const nextSearch = search.toString();
      history.replaceState(null, "", (location.pathname || "/pricing") + (nextSearch ? "?" + nextSearch : "") + (hostileHash ? "" : hash));
    }
  }

  function renderRepoBanner() {
    const banner = byId("pricing-repo-banner");
    const slugEl = byId("pricing-repo-slug");
    const noteEl = byId("pricing-repo-note");
    if (!banner || !slugEl || !noteEl) return;

    if (skewBlocked) {
      banner.classList.add("is-invalid");
      slugEl.textContent = "Stale pricing version or asset skew detected";
      noteEl.textContent = "Reload the page to load the current pricing manifest before continuing to Cloud checkout.";
      banner.hidden = false;
      return;
    }
    if (repoBannerState === "hostile") {
      banner.classList.add("is-invalid");
      slugEl.textContent = "Hostile URL token parameter ignored";
      noteEl.textContent = "Authentication tokens cannot be supplied via URL query or fragment parameters.";
      banner.hidden = false;
      return;
    }
    if (crossTabMismatch) {
      banner.classList.add("is-invalid");
      if (crossTabMismatch.reason === "checkout_in_progress") {
        slugEl.textContent = "Checkout already active in another tab (" + crossTabMismatch.otherRepo + ")";
        noteEl.textContent = "Complete or cancel Checkout in your other tab, or reload after settlement to avoid duplicate charges.";
      } else if (crossTabMismatch.reason === "billing_mismatch") {
        slugEl.textContent = "Cross-tab billing cadence mismatch for " + (validatedRepoSlug || crossTabMismatch.otherRepo);
        noteEl.textContent = "Another tab selected " + (crossTabMismatch.otherBilling === "year" ? "annual" : "monthly") + " billing. Match the selection or reload before continuing.";
      } else {
        slugEl.textContent = "Cross-tab repository intent mismatch (" + (validatedRepoSlug || "none") + " vs " + crossTabMismatch.otherRepo + ")";
        noteEl.textContent = "Another tab changed target repository intent to " + crossTabMismatch.otherRepo + ". Reload or reconcile intent before continuing.";
      }
      banner.hidden = false;
      return;
    }
    if (repoBannerState === "invalid") {
      banner.classList.add("is-invalid");
      slugEl.textContent = "Invalid repository parameter ignored";
      noteEl.textContent = "Use owner/repo formatting or select your repository after signing in.";
      banner.hidden = false;
      return;
    }
    if (recoveryNotice) {
      banner.classList.add("is-invalid");
      slugEl.textContent = validatedRepoSlug ? ("Target repository intent: " + validatedRepoSlug) : "Pricing quote or manifest refreshed";
      const refSuffix = discoveryCorrelationId ? (" (Ref: " + discoveryCorrelationId + ")") : "";
      noteEl.textContent = discoveryUnavailable
        ? (recoveryNotice + " Cloud configuration is currently unavailable; checkout remains locked." + refSuffix)
        : recoveryNotice;
      banner.hidden = false;
      return;
    }
    if (repoBannerState === "valid" && validatedRepoSlug) {
      banner.classList.remove("is-invalid");
      slugEl.textContent = "Target repository intent: " + validatedRepoSlug;
      const refSuffix = discoveryCorrelationId ? (" (Ref: " + discoveryCorrelationId + ")") : "";
      noteEl.textContent = discoveryUnavailable
        ? (discoveryStatus === "invalid"
            ? "Malformed Cloud configuration was rejected. Checkout remains disabled." + refSuffix
            : discoveryStatus === "rate_limited"
              ? "Cloud pricing verification is rate-limited (429)." +
                (discoveryRetryAfterSec ? " Retry after " + discoveryRetryAfterSec + "s." : " Wait briefly before retrying.") +
                " Checkout remains disabled." + refSuffix
              : "Cloud pricing verification is temporarily unavailable. Checkout remains disabled." + refSuffix)
        : (liveSaleEnabled
            ? "Organization and repository authority will be verified after managed sign-in."
            : "Queued as unverified intent only. Cloud checkout opens after launch verification.");
      banner.hidden = false;
      return;
    }
    if (discoveryUnavailable) {
      banner.classList.add("is-invalid");
      const refSuffix = discoveryCorrelationId ? (" Support ref: " + discoveryCorrelationId + ".") : "";
      if (discoveryStatus === "invalid") {
        slugEl.textContent = "Malformed Cloud configuration rejected";
        noteEl.textContent = "Cloud discovery returned invalid metadata. Checkout stays locked fail-closed." + refSuffix;
      } else if (discoveryStatus === "rate_limited") {
        slugEl.textContent = "Cloud verification rate-limited (429)";
        noteEl.textContent = "Too many discovery requests." +
          (discoveryRetryAfterSec ? " Retry after " + discoveryRetryAfterSec + "s." : " Please wait before retrying.") +
          " Checkout remains disabled." + refSuffix;
      } else {
        slugEl.textContent = "Cloud verification temporarily unavailable";
        noteEl.textContent = "Decapod Cloud discovery could not be reached. Local remains free and ready; Cloud checkout stays locked." + refSuffix;
      }
      banner.hidden = false;
      return;
    }
    banner.hidden = true;
  }

  function processUrlRepoIntent() {
    if (typeof location === "undefined") return;
    if (skewBlocked || !hasCompatibleFlow(flow)) {
      clearStalePricingState();
      scrubPricingLocation();
      renderRepoBanner();
      return;
    }

    const cachedMeta = readPricingMeta();
    if (cachedMeta && (
      cachedMeta.asset_release !== PRICING_ASSET_RELEASE ||
      cachedMeta.contract_version !== flow.CONTRACT_VERSION ||
      Object.prototype.hasOwnProperty.call(cachedMeta, "quote_id") ||
      Object.prototype.hasOwnProperty.call(cachedMeta, "cached_price") ||
      Object.prototype.hasOwnProperty.call(cachedMeta, "live_sale_enabled")
    )) {
      clearStalePricingState(cachedMeta.project_origin);
      recoveryNotice = "Stale cached pricing state was cleared. Re-verifying current pricing configuration from the server.";
    }

    const search = new URLSearchParams(location.search || "");
    const hash = location.hash || "";
    const hostileTokens = flow.hasHostileFragmentTokens(hash) ||
      search.has("access_token") || search.has("refresh_token") || search.has("provider_token");

    flow.parseSafeReturnParam(search, siteOrigin());

    const rawErr = search.get("pricing_error") || search.get("error");
    if (rawErr && ALLOWLISTED_RECOVERY_ERRORS.includes(rawErr)) {
      clearStalePricingState(cachedMeta && cachedMeta.project_origin);
      recoveryNotice = "Previous server quote expired or pricing changed (" + rawErr + "). Fresh server verification is required before Checkout.";
    }

    if (hostileTokens) {
      validatedRepoSlug = null;
      repoBannerState = "hostile";
      try {
        if (typeof sessionStorage !== "undefined") {
          sessionStorage.removeItem("decapod:pending-repo-intent");
        }
      } catch (_) {}
      clearStalePricingState(cachedMeta && cachedMeta.project_origin);
      scrubPricingLocation();
      renderRepoBanner();
      return;
    }

    const parsed = flow.parseRepoSearch(search);
    if (parsed.status === "valid") {
      validatedRepoSlug = parsed.slug;
      repoBannerState = "valid";
      try {
        if (typeof sessionStorage !== "undefined") {
          sessionStorage.setItem("decapod:pending-repo-intent", parsed.slug);
        }
      } catch (_) {}
    } else if (parsed.status === "invalid") {
      validatedRepoSlug = null;
      repoBannerState = "invalid";
      try {
        if (typeof sessionStorage !== "undefined") {
          sessionStorage.removeItem("decapod:pending-repo-intent");
        }
      } catch (_) {}
    } else {
      validatedRepoSlug = null;
      repoBannerState = "none";
      try {
        if (typeof sessionStorage !== "undefined") {
          const saved = sessionStorage.getItem("decapod:pending-repo-intent");
          const parsedSaved = flow.parseRepoSlug(saved);
          if (parsedSaved) {
            validatedRepoSlug = parsedSaved.slug;
            repoBannerState = "valid";
          }
        }
      } catch (_) {}
    }

    scrubPricingLocation();
    renderRepoBanner();
  }

  function setButtonLabel(button, text) {
    if (!button) return;
    const arrow = document.createElement("span");
    arrow.setAttribute("aria-hidden", "true");
    arrow.textContent = "↗";
    button.replaceChildren(document.createTextNode(text + " "), arrow);
  }

  function syncPayButtons() {
    const cloudBtn = byId("cloud-pay-cta");
    const previewBtn = byId("preview-checkout");
    const enabled = Boolean(
      !skewBlocked &&
      !payInFlight &&
      !crossTabMismatch &&
      hasCompatibleFlow(flow) &&
      liveSaleEnabled &&
      activeProfile
    );

    if (cloudBtn) {
      cloudBtn.disabled = !enabled;
      cloudBtn.classList.toggle("plan-link-disabled", !enabled);
      cloudBtn.classList.toggle("plan-link-ready", enabled);
      setButtonLabel(cloudBtn, payInFlight ? "Continuing to Cloud signup…" : (enabled ? "Continue to Cloud signup" : "Cloud checkout opening soon"));
    }
    if (previewBtn) {
      previewBtn.disabled = !enabled;
      previewBtn.classList.toggle("preview-checkout-ready", enabled);
      setButtonLabel(previewBtn, payInFlight ? "Continuing to Cloud signup…" : (enabled ? "Continue to Cloud signup" : "Cloud checkout opening soon"));
    }
  }

  async function refreshRuntimeDiscovery() {
    if (skewBlocked || !hasCompatibleFlow(flow) || typeof fetch !== "function") return null;
    const myEpoch = ++discoveryEpoch;
    try {
      const result = typeof flow.discoverRuntimeStatus === "function"
        ? await flow.discoverRuntimeStatus(fetch)
        : { status: "ok", profile: await flow.discoverRuntimeConfig(fetch), correlationId: null, retryAfterSec: null };
      if (myEpoch !== discoveryEpoch || skewBlocked) return null;
      const profile = result && result.profile ? result.profile : null;
      if (!profile) {
        activeProfile = null;
        liveSaleEnabled = false;
        discoveryStatus = result && result.status ? result.status : "unavailable";
        discoveryCorrelationId = result && result.correlationId ? result.correlationId : null;
        discoveryRetryAfterSec = result && result.retryAfterSec ? result.retryAfterSec : null;
        if (discoveryStatus === "incompatible") {
          skewBlocked = true;
          skewReason = result.reason || "api_contract_mismatch";
          clearStalePricingState();
        } else {
          discoveryUnavailable = true;
        }
        syncPayButtons();
        renderRepoBanner();
        return null;
      }
      if (activeProfile && activeProfile.pricingVersion && profile.pricingVersion &&
          activeProfile.pricingVersion !== profile.pricingVersion) {
        clearStalePricingState(profile.projectOrigin);
        recoveryNotice = "Pricing manifest version changed on the server. Fresh server quote verification is required before Checkout.";
      }
      discoveryUnavailable = false;
      discoveryStatus = "ok";
      discoveryCorrelationId = result && result.correlationId ? result.correlationId : null;
      discoveryRetryAfterSec = null;
      activeProfile = profile;
      liveSaleEnabled = profile.liveSaleEnabled === true;
      writePricingMeta(profile);
      syncPayButtons();
      renderRepoBanner();
      return profile;
    } catch (_) {
      if (myEpoch !== discoveryEpoch || skewBlocked) return null;
      activeProfile = null;
      liveSaleEnabled = false;
      discoveryUnavailable = true;
      discoveryStatus = "unavailable";
      discoveryCorrelationId = null;
      discoveryRetryAfterSec = null;
      syncPayButtons();
      renderRepoBanner();
      return null;
    }
  }

  async function handlePayClick() {
    if (payInFlight || skewBlocked || crossTabMismatch || !hasCompatibleFlow(flow) || !liveSaleEnabled || !activeProfile) return;
    payInFlight = true;
    syncPayButtons();
    try {
      const now = Math.floor(Date.now() / 1000);
      if (!activeProfile.discoveredAt || (now - activeProfile.discoveredAt) > 300) {
        const refreshed = await refreshRuntimeDiscovery();
        if (!refreshed || skewBlocked || crossTabMismatch || refreshed.liveSaleEnabled !== true) {
          if (!skewBlocked) {
            recoveryNotice = "Stale Cloud readiness could not be re-verified from the server.";
            renderRepoBanner();
          }
          return;
        }
      }
      if (!flow.isTrustedAuthUrl(activeProfile.authBaseUrl)) return;

      const origin = siteOrigin();
      const signupUrl = flow.buildSignupHandoffUrl({
        origin: origin,
        repo: validatedRepoSlug,
        billing: annual ? "year" : "month",
        seats: Number(contributors.value) || 1
      });

      const existing = readExistingSession(activeProfile.projectOrigin);
      if (existing) {
        location.assign(signupUrl);
        return;
      }

      const verifier = flow.randomSecret();
      const nonce = flow.randomSecret();
      const challenge = await flow.sha256Base64Url(verifier);
      if (skewBlocked || crossTabMismatch) return;
      const returnUrl = new URL(signupUrl);
      returnUrl.searchParams.set("login_nonce", nonce);

      try {
        if (typeof sessionStorage !== "undefined") {
          const flowNamespace = "decapod-portal:" + activeProfile.projectOrigin + ":";
          if (validatedRepoSlug) {
            sessionStorage.setItem("decapod:pending-repo-intent", validatedRepoSlug);
          }
          sessionStorage.setItem(flowNamespace + "flow", JSON.stringify({
            version: 1,
            contract_version: flow.CONTRACT_VERSION,
            asset_release: PRICING_ASSET_RELEASE,
            kind: "sign_in",
            provider: "github",
            verifier: verifier,
            nonce: nonce,
            expires: Math.floor(Date.now() / 1000) + 900,
            phase: "pending",
            project: activeProfile.projectOrigin,
            returnURL: origin + "/signup"
          }));
        }
      } catch (_) {}

      const authHref = flow.buildAuthAuthorizeUrl({
        authBaseUrl: activeProfile.authBaseUrl,
        provider: "github",
        returnTo: returnUrl.href,
        codeChallenge: challenge,
        expectedOrigin: origin
      });
      location.assign(authHref);
    } finally {
      payInFlight = false;
      syncPayButtons();
    }
  }

  function render() {
    const repos = Math.max(1, Math.min(10, Number(repositories.value) || 1));
    const perRepo = Math.max(1, Math.min(25, Number(contributors.value) || 1));
    const repoDiscount = tier(repos, steps.repos);
    // Every repository with N people implies at least N distinct humans.
    // More non-overlapping humans may increase the actual verified discount.
    const peopleDiscountFloor = tier(perRepo, steps.people);
    const volumeFloor = repoDiscount + peopleDiscountFloor;
    const annualUncapped = 8 + volumeFloor;
    const annualFloor = Math.min(20, annualUncapped);

    change("repo-count-value", String(repos), "value");
    change("seat-count-value", String(perRepo), "value");
    change("assignment-count", String(repos * perRepo));
    change("assignment-formula", repos + " " + (repos === 1 ? "repository" : "repositories") +
      " × " + perRepo + " " + (perRepo === 1 ? "contributor" : "contributors") + " each");
    change("repo-discount", "+" + repoDiscount + "%");
    change("contributor-discount", "+" + peopleDiscountFloor + "%");
    change("combined-discount", volumeFloor + "%");
    change("annual-volume", volumeFloor + "%");
    change("annual-discount", annualFloor + "%");

    const disclosure = byId("annual-savings");
    if (disclosure) disclosure.hidden = !annual || !showAnnualDetails;
    for (const option of document.querySelectorAll("[data-billing]")) {
      const selected = option.dataset.billing === (annual ? "year" : "month");
      option.classList.toggle("is-selected", selected);
      option.setAttribute("aria-pressed", String(selected));
      if (option.dataset.billing === "year") {
        option.setAttribute("aria-expanded", String(annual && showAnnualDetails));
      }
    }
    for (const [slider, value, selector] of [
      [repositories, repos, "[data-repo-threshold]"],
      [contributors, perRepo, "[data-contributor-threshold]"]
    ]) {
      const fraction = (value - Number(slider.min)) / (Number(slider.max) - Number(slider.min));
      slider.style.setProperty("--fill", (Math.max(0, Math.min(1, fraction)) * 100) + "%");
      for (const marker of document.querySelectorAll(selector)) {
        const threshold = Number(marker.dataset.repoThreshold ?? marker.dataset.contributorThreshold);
        marker.classList.toggle("is-reached", value >= threshold);
      }
    }
  }

  const dismiss = byId("annual-dismiss");
  if (dismiss) dismiss.addEventListener("click", () => {
    showAnnualDetails = false;
    render();
  });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && showAnnualDetails) {
      showAnnualDetails = false;
      render();
      const annualButton = [...document.querySelectorAll("[data-billing]")].find(
        button => button.dataset.billing === "year"
      );
      if (annualButton) annualButton.focus();
    }
  });
  repositories.addEventListener("input", render);
  contributors.addEventListener("input", render);

  const cloudBtn = byId("cloud-pay-cta");
  const previewBtn = byId("preview-checkout");
  if (cloudBtn) cloudBtn.addEventListener("click", () => { handlePayClick().catch(() => {}); });
  if (previewBtn) previewBtn.addEventListener("click", () => { handlePayClick().catch(() => {}); });

  let coherenceChannel = null;
  if (!skewBlocked && hasCompatibleFlow(flow)) {
    coherenceChannel = flow.createCoherenceChannel({
      BroadcastChannel: typeof globalThis !== "undefined" && typeof globalThis.DecapodMockBroadcastChannel === "function"
        ? globalThis.DecapodMockBroadcastChannel
        : undefined,
      onSkew: () => {
        skewBlocked = true;
        skewReason = "multi_tab_release_skew";
        liveSaleEnabled = false;
        activeProfile = null;
        payInFlight = false;
        clearStalePricingState();
        syncPayButtons();
        renderRepoBanner();
      },
      onAuthInvalidated: msg => {
        clearStalePricingState(msg && msg.projectOrigin);
      },
      onIntentSync: msg => {
        if (!msg || skewBlocked) return;
        if (msg.assetRelease && msg.assetRelease !== PRICING_ASSET_RELEASE) {
          skewBlocked = true;
          skewReason = "multi_tab_release_skew";
          liveSaleEnabled = false;
          activeProfile = null;
          payInFlight = false;
          syncPayButtons();
          renderRepoBanner();
          return;
        }
        if (validatedRepoSlug && msg.repo && msg.repo.toLowerCase() !== validatedRepoSlug.toLowerCase()) {
          crossTabMismatch = { reason: "repo_mismatch", otherRepo: msg.repo };
          syncPayButtons();
          renderRepoBanner();
          return;
        }
        if (validatedRepoSlug && msg.repo && msg.repo.toLowerCase() === validatedRepoSlug.toLowerCase() &&
            msg.billing && msg.billing !== (annual ? "year" : "month")) {
          crossTabMismatch = { reason: "billing_mismatch", otherRepo: msg.repo, otherBilling: msg.billing };
          syncPayButtons();
          renderRepoBanner();
          return;
        }
        if (validatedRepoSlug && msg.repo && msg.repo.toLowerCase() === validatedRepoSlug.toLowerCase() &&
            (!msg.billing || msg.billing === (annual ? "year" : "month")) &&
            crossTabMismatch && (crossTabMismatch.reason === "repo_mismatch" || crossTabMismatch.reason === "billing_mismatch")) {
          crossTabMismatch = null;
          syncPayButtons();
          renderRepoBanner();
        }
      },
      onCheckoutEvent: msg => {
        if (!msg || skewBlocked) return;
        if (msg.type === "checkout_started" && msg.projectId) {
          if (validatedRepoSlug && msg.projectId.toLowerCase() === validatedRepoSlug.toLowerCase()) {
            crossTabMismatch = { reason: "checkout_in_progress", otherRepo: msg.projectId };
          } else if (validatedRepoSlug) {
            crossTabMismatch = { reason: "repo_mismatch", otherRepo: msg.projectId };
          }
          syncPayButtons();
          renderRepoBanner();
        } else if ((msg.type === "checkout_returned" || msg.type === "fulfillment_status") &&
                   crossTabMismatch && crossTabMismatch.reason === "checkout_in_progress") {
          crossTabMismatch = null;
          syncPayButtons();
          renderRepoBanner();
        }
      }
    });
    coherenceChannel.announceReady();
    if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
      window.addEventListener("pagehide", () => {
        if (coherenceChannel) coherenceChannel.close();
      });
      window.addEventListener("pageshow", ev => {
        if (ev && ev.persisted) {
          payInFlight = false;
          syncPayButtons();
          refreshRuntimeDiscovery().catch(() => {});
        }
      });
    }
  }

  for (const option of document.querySelectorAll("[data-billing]")) {
    option.addEventListener("click", () => {
      annual = option.dataset.billing === "year";
      showAnnualDetails = annual;
      if (crossTabMismatch && crossTabMismatch.reason === "billing_mismatch" &&
          crossTabMismatch.otherBilling === (annual ? "year" : "month")) {
        crossTabMismatch = null;
        syncPayButtons();
        renderRepoBanner();
      }
      if (coherenceChannel && validatedRepoSlug && !skewBlocked) {
        coherenceChannel.broadcastIntentSync({
          page: "pricing",
          repo: validatedRepoSlug,
          billing: annual ? "year" : "month"
        });
      }
      render();
    });
  }

  processUrlRepoIntent();
  if (coherenceChannel && validatedRepoSlug && !skewBlocked) {
    coherenceChannel.broadcastIntentSync({
      page: "pricing",
      repo: validatedRepoSlug,
      billing: annual ? "year" : "month"
    });
  }
  syncPayButtons();
  render();

  if (!skewBlocked && hasCompatibleFlow(flow) && typeof fetch === "function") {
    refreshRuntimeDiscovery().catch(() => {});
  }
})();
