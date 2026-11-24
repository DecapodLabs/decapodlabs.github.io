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

  function hasCompatibleFlow(candidate) {
    return Boolean(
      candidate &&
      candidate.CONTRACT_VERSION === 1 &&
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

  const coherence = hasCompatibleFlow(flow)
    ? flow.checkPageCoherence({
        document: typeof document !== "undefined" ? document : null,
        requiredIds: ["repo-count", "seat-count", "cloud-pay-cta", "preview-checkout"]
      })
    : { ok: false, reason: "incompatible_cloud_flow" };
  if (!coherence.ok) {
    skewBlocked = true;
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

  function scrubPricingLocation() {
    if (typeof location === "undefined" || typeof history === "undefined" || !history.replaceState) return;
    if (hasCompatibleFlow(flow)) {
      flow.scrubSensitiveLocation(location, history);
      return;
    }
    const search = new URLSearchParams(location.search || "");
    const sensitive = ["repo", "return_to", "redirect_to", "code", "login_nonce", "access_token", "refresh_token", "provider_token", "token", "invitation_id", "invitation_secret"];
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

    if (repoBannerState === "valid" && validatedRepoSlug) {
      banner.classList.remove("is-invalid");
      slugEl.textContent = "Target repository intent: " + validatedRepoSlug;
      noteEl.textContent = skewBlocked
        ? "Client asset version skew detected. Reload the page to refresh Cloud checkout."
        : (liveSaleEnabled
            ? "Organization and repository authority will be verified after managed sign-in."
            : "Queued as unverified intent only. Cloud checkout opens after launch verification.");
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
    if (repoBannerState === "invalid") {
      banner.classList.add("is-invalid");
      slugEl.textContent = "Invalid repository parameter ignored";
      noteEl.textContent = "Use owner/repo formatting or select your repository after signing in.";
      banner.hidden = false;
      return;
    }
    banner.hidden = true;
  }

  function processUrlRepoIntent() {
    if (typeof location === "undefined") return;
    if (skewBlocked || !hasCompatibleFlow(flow)) {
      scrubPricingLocation();
      renderRepoBanner();
      return;
    }

    const search = new URLSearchParams(location.search || "");
    const hash = location.hash || "";
    const hostileTokens = flow.hasHostileFragmentTokens(hash) ||
      search.has("access_token") || search.has("refresh_token") || search.has("provider_token");

    flow.parseSafeReturnParam(search, siteOrigin());

    if (hostileTokens) {
      validatedRepoSlug = null;
      repoBannerState = "hostile";
      try {
        if (typeof sessionStorage !== "undefined") {
          sessionStorage.removeItem("decapod:pending-repo-intent");
        }
      } catch (_) {}
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
    const enabled = Boolean(!skewBlocked && hasCompatibleFlow(flow) && liveSaleEnabled && activeProfile);

    if (cloudBtn) {
      cloudBtn.disabled = !enabled;
      cloudBtn.classList.toggle("plan-link-disabled", !enabled);
      cloudBtn.classList.toggle("plan-link-ready", enabled);
      setButtonLabel(cloudBtn, enabled ? "Continue to Cloud signup" : "Cloud checkout opening soon");
    }
    if (previewBtn) {
      previewBtn.disabled = !enabled;
      previewBtn.classList.toggle("preview-checkout-ready", enabled);
      setButtonLabel(previewBtn, enabled ? "Continue to Cloud signup" : "Cloud checkout opening soon");
    }
  }

  async function handlePayClick() {
    if (skewBlocked || !hasCompatibleFlow(flow) || !liveSaleEnabled || !activeProfile) return;
    if (!flow.isTrustedAuthUrl(activeProfile.authBaseUrl)) return;

    const origin = siteOrigin();
    const signupUrl = flow.buildSignupHandoffUrl({
      origin: origin,
      repo: validatedRepoSlug,
      billing: annual ? "year" : "month"
    });

    const existing = readExistingSession(activeProfile.projectOrigin);
    if (existing) {
      location.assign(signupUrl);
      return;
    }

    const verifier = flow.randomSecret();
    const nonce = flow.randomSecret();
    const challenge = await flow.sha256Base64Url(verifier);
    const returnUrl = new URL(origin + "/signup");
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

  for (const option of document.querySelectorAll("[data-billing]")) {
    option.addEventListener("click", () => {
      annual = option.dataset.billing === "year";
      showAnnualDetails = annual;
      render();
    });
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
        liveSaleEnabled = false;
        activeProfile = null;
        syncPayButtons();
        renderRepoBanner();
      }
    });
    coherenceChannel.announceReady();
    if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
      window.addEventListener("pagehide", () => {
        if (coherenceChannel) coherenceChannel.close();
      });
    }
  }

  processUrlRepoIntent();
  syncPayButtons();
  render();

  if (!skewBlocked && hasCompatibleFlow(flow) && typeof fetch === "function") {
    flow.discoverRuntimeConfig(fetch).then(profile => {
      if (!profile || skewBlocked) return;
      activeProfile = profile;
      liveSaleEnabled = profile.liveSaleEnabled === true;
      syncPayButtons();
      renderRepoBanner();
    }).catch(() => {});
  }
})();
