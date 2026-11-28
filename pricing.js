(() => {
  "use strict";

  const byId = id => (typeof document !== "undefined" ? document.getElementById(id) : null);
  const repositories = byId("repo-count");
  const contributors = byId("seat-count");
  const repositoriesNumber = byId("repo-count-number");
  const contributorsNumber = byId("seat-count-number");
  const flow = typeof DecapodCloudFlow !== "undefined" ? DecapodCloudFlow : null;
  if (!repositories || !contributors) return;

  const PRICING_ASSET_RELEASE = "20261128-ia";
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

  // Live purchasing eligibility for general buyers is server-enforced; allowlisted
  // pilot organizations can enter via the normal Pricing flow when discovered.
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
    (amount, [minimum, discount]) => (count >= minimum ? discount : amount),
    0
  );
  const change = (id, value, property = "textContent") => {
    const node = byId(id);
    if (node) node[property] = value;
  };
  const formatUsd = cents => new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: Number(cents) % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2
  }).format(Number(cents || 0) / 100);

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

  function persistPricingIntent(repos, seats) {
    if (typeof sessionStorage === "undefined") return;
    try {
      if (validatedRepoSlug) {
        sessionStorage.setItem("decapod:pending-repo-intent", validatedRepoSlug);
      }
      sessionStorage.setItem("decapod:pending-checkout-intent", JSON.stringify({
        repo: validatedRepoSlug || null,
        originRepo: validatedRepoSlug || null,
        reposCount: repos,
        seats: seats,
        billing: annual ? "year" : "month",
        source: "pricing"
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
    const sensitive = [
      "repo", "repos", "seats", "billing", "source", "return_to", "redirect_to",
      "code", "login_nonce", "access_token", "refresh_token", "provider_token",
      "token", "invitation_id", "invitation_secret", "error", "error_description", "pricing_error"
    ];
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
      slugEl.textContent = "A newer release of Decapod Cloud is available";
      noteEl.textContent = "Reload this page before continuing to Cloud setup.";
      banner.hidden = false;
      return;
    }
    if (repoBannerState === "hostile") {
      banner.classList.add("is-invalid");
      slugEl.textContent = "Unexpected URL token parameter ignored";
      noteEl.textContent = "Sign in cleanly via GitHub during checkout setup.";
      banner.hidden = false;
      return;
    }
    if (crossTabMismatch) {
      banner.classList.add("is-invalid");
      if (crossTabMismatch.reason === "checkout_in_progress") {
        slugEl.textContent = "Checkout is active in another tab (" + crossTabMismatch.otherRepo + ")";
        noteEl.textContent = "Finish or cancel in that tab to avoid duplicate charges.";
      } else if (crossTabMismatch.reason === "billing_mismatch") {
        slugEl.textContent = "Billing cadence differs in another tab (" + (validatedRepoSlug || crossTabMismatch.otherRepo) + ")";
        noteEl.textContent = "Match selections across tabs or reload before continuing.";
      } else {
        slugEl.textContent = "Repository selection differs in another tab (" + crossTabMismatch.otherRepo + ")";
        noteEl.textContent = "Reconcile selections across tabs or reload before continuing.";
      }
      banner.hidden = false;
      return;
    }
    if (repoBannerState === "invalid") {
      banner.classList.add("is-invalid");
      slugEl.textContent = "Repository parameter ignored";
      noteEl.textContent = "Use owner/repo formatting or choose your repositories after signing in.";
      banner.hidden = false;
      return;
    }
    if (recoveryNotice) {
      banner.classList.remove("is-invalid");
      slugEl.textContent = "Updated pricing estimate";
      noteEl.textContent = recoveryNotice;
      banner.hidden = false;
      return;
    }
    if (discoveryUnavailable && !activeProfile) {
      banner.classList.remove("is-invalid");
      const refSuffix = discoveryCorrelationId ? " Ref: " + discoveryCorrelationId : "";
      if (discoveryStatus === "rate_limited") {
        slugEl.textContent = "Decapod Cloud status is temporarily rate-limited";
        noteEl.textContent = (discoveryRetryAfterSec ? "Wait " + discoveryRetryAfterSec + "s and reload." : "Reload shortly.") + refSuffix;
      } else {
        slugEl.textContent = "Could not connect to Decapod Cloud";
        noteEl.textContent = "Check your connection or reload to continue." + refSuffix;
      }
      banner.hidden = false;
      return;
    }
    if (repoBannerState === "valid" && validatedRepoSlug) {
      banner.classList.remove("is-invalid");
      slugEl.textContent = "Starting repository: " + validatedRepoSlug;
      noteEl.textContent = "Preserved into GitHub sign-in where you can verify additional repositories.";
      banner.hidden = false;
      return;
    }
    banner.hidden = true;
  }

  function processUrlRepoIntent() {
    if (typeof location === "undefined") return;
    const rawSearch = location.search || "";
    const rawHash = location.hash || "";
    const priorMeta = readPricingMeta();
    if (priorMeta && ((priorMeta.asset_release && priorMeta.asset_release !== PRICING_ASSET_RELEASE) ||
        (flow && priorMeta.contract_version && priorMeta.contract_version !== flow.CONTRACT_VERSION))) {
      clearStalePricingState(priorMeta.project_origin);
    }

    if (!hasCompatibleFlow(flow)) {
      scrubPricingLocation();
      renderRepoBanner();
      return;
    }

    const searchParams = new URLSearchParams(rawSearch);
    const errParam = String(searchParams.get("pricing_error") || "").trim().toLowerCase();
    if (errParam && ALLOWLISTED_RECOVERY_ERRORS.includes(errParam)) {
      recoveryNotice = "Your previous quote expired or changed. Review the current terms before continuing.";
    }

    const billingCheck = flow.parseBillingParam ? flow.parseBillingParam(searchParams) : { status: "absent" };
    if (billingCheck.status === "valid") {
      annual = billingCheck.billing === "year";
      showAnnualDetails = annual;
    }
    const clampInt = (raw, min, max, fallback) => {
      const parsed = Math.floor(Number(raw));
      if (!Number.isSafeInteger(parsed)) return fallback;
      return Math.max(min, Math.min(max, parsed));
    };

    const repoCountCheck = flow.parseRepoCountParam ? flow.parseRepoCountParam(searchParams) : { status: "absent" };
    if (repoCountCheck.status === "valid" && repositories) {
      const nextRepos = String(clampInt(repoCountCheck.repos, 1, 10, 1));
      repositories.value = nextRepos;
      if (repositoriesNumber) repositoriesNumber.value = nextRepos;
    }
    const seatCheck = flow.parseSeatParam ? flow.parseSeatParam(searchParams) : { status: "absent" };
    if (seatCheck.status === "valid" && contributors) {
      const nextSeats = String(clampInt(seatCheck.seats, 1, 25, 1));
      contributors.value = nextSeats;
      if (contributorsNumber) contributorsNumber.value = nextSeats;
    }

    if (flow.hasHostileFragmentTokens(rawHash) ||
        searchParams.has("access_token") ||
        searchParams.has("refresh_token") ||
        searchParams.has("provider_token")) {
      validatedRepoSlug = null;
      repoBannerState = "hostile";
      scrubPricingLocation();
      renderRepoBanner();
      return;
    }

    const ret = flow.parseSafeReturnParam(rawSearch, siteOrigin());
    if (ret.status === "rejected") {
      repoBannerState = "invalid";
    }

    const parsed = flow.parseRepoSearch(rawSearch);
    if (parsed.status === "valid") {
      validatedRepoSlug = parsed.slug;
      repoBannerState = "valid";
      persistPricingIntent(Number(repositories.value) || 1, Number(contributors.value) || 1);
    } else if (parsed.status === "invalid") {
      validatedRepoSlug = null;
      repoBannerState = "invalid";
    } else if (repoBannerState === "none") {
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
    arrow.textContent = "→";
    button.replaceChildren(document.createTextNode(text + " "), arrow);
  }

  function syncPayButtons() {
    const cloudBtn = byId("cloud-pay-cta");
    const previewBtn = byId("preview-checkout");
    const closingBtn = byId("closing-cloud-cta");
    const availabilityNote = byId("pricing-availability-note");
    const enabled = Boolean(
      !skewBlocked &&
      !payInFlight &&
      !crossTabMismatch &&
      hasCompatibleFlow(flow) &&
      activeProfile
    );

    if (cloudBtn) {
      cloudBtn.disabled = !enabled;
      setButtonLabel(cloudBtn, payInFlight ? "Continuing to Cloud…" : "Sign in with GitHub");
    }
    if (previewBtn) {
      previewBtn.disabled = !enabled;
      setButtonLabel(previewBtn, payInFlight ? "Continuing to Cloud…" : "Continue to Decapod Cloud");
    }
    if (closingBtn) {
      closingBtn.disabled = !enabled;
      setButtonLabel(closingBtn, payInFlight ? "Continuing to Cloud…" : "Get Decapod Cloud");
    }
    if (availabilityNote) {
      if (skewBlocked) {
        availabilityNote.textContent = "Reload this page to use the latest release.";
      } else if (!activeProfile) {
        availabilityNote.textContent = discoveryUnavailable
          ? "Could not reach Decapod Cloud discovery. Reload shortly."
          : "Verifying live Decapod Cloud checkout status…";
      } else if (liveSaleEnabled) {
        availabilityNote.textContent = "Sign in with GitHub to verify repositories, confirm your final quote, and complete Stripe Checkout.";
      } else {
        availabilityNote.textContent = "Sign in with GitHub to verify organization eligibility and activate Decapod Cloud.";
      }
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
        recoveryNotice = "Pricing schedule updated on the server. Fresh verification occurs automatically before Checkout.";
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
    if (payInFlight || skewBlocked || crossTabMismatch || !hasCompatibleFlow(flow) || !activeProfile) return;
    payInFlight = true;
    syncPayButtons();
    try {
      const now = Math.floor(Date.now() / 1000);
      if (!activeProfile.discoveredAt || (now - activeProfile.discoveredAt) > 300) {
        const refreshed = await refreshRuntimeDiscovery();
        if (!refreshed || skewBlocked || crossTabMismatch) {
          if (!skewBlocked) {
            recoveryNotice = "Could not verify Decapod Cloud status. Reload and try again.";
            renderRepoBanner();
          }
          return;
        }
      }
      if (!flow.isTrustedAuthUrl(activeProfile.authBaseUrl)) return;

      const repoCount = Math.max(1, Math.min(10, Number(repositories.value) || 1));
      const seatPerRepo = Math.max(1, Math.min(25, Number(contributors.value) || 1));
      const cadence = annual ? "year" : "month";
      persistPricingIntent(repoCount, seatPerRepo);

      const origin = siteOrigin();
      const signupUrl = flow.buildSignupHandoffUrl({
        origin: origin,
        repo: validatedRepoSlug,
        repos: repoCount,
        billing: cadence,
        seats: seatPerRepo,
        source: "pricing"
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
    const repos = Math.max(1, Math.min(10, Math.floor(Number(repositories.value)) || 1));
    const perRepo = Math.max(1, Math.min(25, Math.floor(Number(contributors.value)) || 1));
    repositories.value = String(repos);
    contributors.value = String(perRepo);
    if (repositoriesNumber && repositoriesNumber.value !== String(repos)) {
      repositoriesNumber.value = String(repos);
    }
    if (contributorsNumber && contributorsNumber.value !== String(perRepo)) {
      contributorsNumber.value = String(perRepo);
    }
    const totalAssignments = repos * perRepo;
    const repoDiscount = tier(repos, steps.repos);
    // Conservative illustrative floor assuming equal distinct humans per repo.
    const peopleDiscountFloor = tier(perRepo, steps.people);
    const volumeFloor = repoDiscount + peopleDiscountFloor;
    const effectiveDiscount = annual ? Math.min(20, 8 + volumeFloor) : volumeFloor;
    const unitCents = annual
      ? Math.round(60000 * (100 - effectiveDiscount) / 100)
      : Math.round(5000 * (100 - effectiveDiscount) / 100);
    const totalCents = totalAssignments * unitCents;

    change("repo-count-value", String(repos), "value");
    change("seat-count-value", String(perRepo), "value");
    change("assignment-count", String(totalAssignments));
    change("assignment-formula", repos + " " + (repos === 1 ? "repository" : "repositories") +
      " × " + perRepo + " " + (perRepo === 1 ? "contributor" : "contributors") +
      (repos === 1 ? "" : " each"));
    change("repo-discount", "+" + repoDiscount + "%");
    change("contributor-discount", "+" + peopleDiscountFloor + "%");
    change("combined-discount", volumeFloor + "%");
    change("annual-volume", volumeFloor + "%");
    change("annual-discount", Math.min(20, 8 + volumeFloor) + "%");
    change("estimate-total", formatUsd(totalCents));
    change("estimate-cadence", annual ? "/ year (billed upfront)" : "/ month");
    change("estimate-unit-rate", formatUsd(unitCents) + (annual ? " / seat / yr" : " / seat / mo"));
    change("estimate-list-rate", annual ? "$552 / seat / yr (8% off $600)" : "$50 / seat / month");

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
    persistPricingIntent(repos, perRepo);
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

  const syncFromNumericInput = (numInput, rangeInput, min, max) => {
    if (!numInput || !rangeInput) return;
    numInput.addEventListener("input", () => {
      const raw = String(numInput.value || "").trim();
      if (raw === "") return;
      const parsed = Math.floor(Number(raw));
      if (!Number.isSafeInteger(parsed)) return;
      const clamped = Math.max(min, Math.min(max, parsed));
      rangeInput.value = String(clamped);
      render();
    });
    numInput.addEventListener("blur", () => {
      const parsed = Math.floor(Number(numInput.value));
      const clamped = Number.isSafeInteger(parsed) ? Math.max(min, Math.min(max, parsed)) : min;
      numInput.value = String(clamped);
      rangeInput.value = String(clamped);
      render();
    });
  };
  syncFromNumericInput(repositoriesNumber, repositories, 1, 10);
  syncFromNumericInput(contributorsNumber, contributors, 1, 25);

  const cloudBtn = byId("cloud-pay-cta");
  const previewBtn = byId("preview-checkout");
  const closingBtn = byId("closing-cloud-cta");
  if (cloudBtn) cloudBtn.addEventListener("click", () => { handlePayClick().catch(() => {}); });
  if (previewBtn) previewBtn.addEventListener("click", () => { handlePayClick().catch(() => {}); });
  if (closingBtn) closingBtn.addEventListener("click", () => { handlePayClick().catch(() => {}); });

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
  render();
  syncPayButtons();
  refreshRuntimeDiscovery().catch(() => {});
})();
