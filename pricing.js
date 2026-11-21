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

  const tier = (count, points) => points.reduce(
    (amount, [minimum, discount]) => count >= minimum ? discount : amount, 0
  );
  const change = (id, value, property = "textContent") => {
    const node = byId(id);
    if (node) node[property] = value;
  };

  function siteOrigin() {
    if (flow && typeof location !== "undefined" && flow.isAllowedSiteOrigin(location.origin)) {
      return location.origin;
    }
    return flow ? flow.CANONICAL_SITE_ORIGIN : "https://decapodlabs.ai";
  }

  function readExistingSession(projectOrigin) {
    if (!flow || typeof sessionStorage === "undefined" || !projectOrigin) return null;
    try {
      const raw = sessionStorage.getItem("decapod-portal:" + projectOrigin + ":session");
      if (!raw || raw.length > 24576) return null;
      const parsed = JSON.parse(raw);
      return flow.validateSessionRecord(parsed, projectOrigin) ? parsed : null;
    } catch (_) {
      return null;
    }
  }

  function applyRepoIntentFromUrl() {
    const banner = byId("pricing-repo-banner");
    const slugEl = byId("pricing-repo-slug");
    const noteEl = byId("pricing-repo-note");
    if (!flow || typeof location === "undefined") return;

    const search = new URLSearchParams(location.search || "");
    const returnCheck = flow.parseSafeReturnParam(search, siteOrigin());
    if (returnCheck.status === "rejected" && typeof history !== "undefined" && history.replaceState) {
      search.delete("return_to");
      search.delete("redirect_to");
      const nextSearch = search.toString();
      history.replaceState(null, "", location.pathname + (nextSearch ? "?" + nextSearch : ""));
    }

    const parsed = flow.parseRepoSearch(search);
    if (parsed.status === "valid") {
      validatedRepoSlug = parsed.slug;
      try {
        if (typeof sessionStorage !== "undefined") {
          sessionStorage.setItem("decapod:pending-repo-intent", parsed.slug);
        }
      } catch (_) {}
      if (banner && slugEl && noteEl) {
        banner.classList.remove("is-invalid");
        slugEl.textContent = "Target repository intent: " + parsed.slug;
        noteEl.textContent = liveSaleEnabled
          ? "Organization and repository authority will be verified after managed sign-in."
          : "Queued as unverified intent only. Cloud checkout opens after launch verification.";
        banner.hidden = false;
      }
      return;
    }

    validatedRepoSlug = null;
    try {
      if (typeof sessionStorage !== "undefined") {
        sessionStorage.removeItem("decapod:pending-repo-intent");
      }
    } catch (_) {}
    if (parsed.status === "invalid" && banner && slugEl && noteEl) {
      banner.classList.add("is-invalid");
      slugEl.textContent = "Invalid repository parameter ignored";
      noteEl.textContent = "Use owner/repo formatting or select your repository after signing in.";
      banner.hidden = false;
    } else if (banner) {
      banner.hidden = true;
    }
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
    const enabled = Boolean(liveSaleEnabled && activeProfile);

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
    if (!liveSaleEnabled || !activeProfile || !flow) return;

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

  applyRepoIntentFromUrl();
  syncPayButtons();
  render();

  if (flow && typeof fetch === "function") {
    flow.discoverRuntimeConfig(fetch).then(profile => {
      if (!profile) return;
      activeProfile = profile;
      liveSaleEnabled = profile.liveSaleEnabled === true;
      syncPayButtons();
      applyRepoIntentFromUrl();
    }).catch(() => {});
  }
})();
