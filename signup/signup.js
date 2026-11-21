(function (root) {
  "use strict";

  var flow = root.DecapodCloudFlow;

  function createSignupController(deps) {
    var d = deps || {};
    var doc = d.document || root.document;
    var winLocation = d.location || root.location;
    var winHistory = d.history || (typeof history !== "undefined" ? history : null);
    var storage = d.sessionStorage || (typeof sessionStorage !== "undefined" ? sessionStorage : null);
    var fetchFn = d.fetch || (typeof fetch !== "undefined" ? fetch.bind(root) : null);
    var sleepFn = d.sleepFn || function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
    var navigateFn = d.navigateFn || function (url) { winLocation.assign(url); };
    var nowSec = d.nowSec || function () { return Math.floor(Date.now() / 1000); };

    var profile = d.initialProfile || null;
    var session = null;
    var currentUser = null;
    var accountSnapshot = null;
    var inMemoryProviderToken = null;
    var pendingStepupProvider = null;
    var preselectedRepo = null;
    var preferredBilling = "month";
    var checkoutReturned = false;
    var activeProjectId = null;
    var activeOrganizationId = null;
    var activeQuoteOrder = null;
    var quoteRequestId = null;
    var quotePayloadKey = null;
    var enrollRequestId = null;
    var enrollRepoSlug = null;
    var githubReposCache = [];
    var githubOrgsCache = [];
    var pollGeneration = 0;
    var busy = false;

    function byId(id) {
      return doc.getElementById(id);
    }

    function siteOrigin() {
      if (winLocation && flow.isAllowedSiteOrigin(winLocation.origin)) {
        return winLocation.origin;
      }
      return flow.CANONICAL_SITE_ORIGIN;
    }

    function namespace() {
      return "decapod-portal:" + (profile ? profile.projectOrigin : flow.FALLBACK_CLOUD_ORIGIN) + ":";
    }

    function storeGet(key, limit) {
      if (!storage) return null;
      var raw = storage.getItem(namespace() + key);
      if (raw === null) return null;
      if (raw.length > (limit || 24576)) return null;
      try {
        return JSON.parse(raw);
      } catch (_) {
        return null;
      }
    }

    function storeSet(key, value) {
      if (!storage) return;
      storage.setItem(namespace() + key, JSON.stringify(value));
    }

    function storeRemove(key) {
      if (!storage) return;
      storage.removeItem(namespace() + key);
    }

    function setStatus(text, isError) {
      var el = byId("signup-status");
      if (!el) return;
      el.textContent = text;
      el.classList.toggle("is-error", Boolean(isError));
    }

    function setBanner(kind, title, note) {
      var banner = byId("signup-repo-banner");
      var titleEl = byId("signup-repo-banner-title");
      var noteEl = byId("signup-repo-banner-note");
      if (!banner || !titleEl || !noteEl) return;
      if (!kind) {
        banner.hidden = true;
        return;
      }
      banner.classList.toggle("is-invalid", kind === "invalid");
      titleEl.textContent = title;
      noteEl.textContent = note;
      banner.hidden = false;
    }

    function hideAllProtectedPanels() {
      var ids = ["account-bar", "step-identity", "step-org-repo", "step-state", "step-checkout", "step-ready"];
      for (var i = 0; i < ids.length; i++) {
        var el = byId(ids[i]);
        if (el) el.hidden = true;
      }
    }

    function clearConfidentialUi() {
      hideAllProtectedPanels();
      var summary = byId("account-summary");
      if (summary) summary.textContent = "";
      var orgSelect = byId("org-select");
      if (orgSelect) orgSelect.replaceChildren();
      var repoSelect = byId("repo-select");
      if (repoSelect) repoSelect.replaceChildren();
      var orgBlock = byId("org-picker-block");
      if (orgBlock) orgBlock.hidden = true;
      var quoteSummary = byId("quote-summary");
      if (quoteSummary) quoteSummary.hidden = true;
      var checkoutBtn = byId("checkout-btn");
      if (checkoutBtn) checkoutBtn.disabled = true;
      activeQuoteOrder = null;
      activeProjectId = null;
      activeOrganizationId = null;
    }

    function syncAuthGateUi() {
      var signedIn = Boolean(profile && flow.validateSessionRecord(session, profile.projectOrigin, nowSec()));
      var authGate = byId("auth-gate");
      if (authGate) authGate.hidden = signedIn;
      var cancelBtn = byId("cancel-auth-btn");
      if (cancelBtn) cancelBtn.hidden = !storeGet("flow", 8192);
      if (!signedIn) {
        clearConfidentialUi();
      }
      var providers = profile ? profile.authProviders : { github: true, google: false };
      var ghBtn = byId("auth-github");
      var googleBtn = byId("auth-google");
      if (ghBtn) ghBtn.disabled = busy || !providers.github;
      if (googleBtn) {
        googleBtn.disabled = busy || !providers.google;
      }
      var noteEl = byId("auth-provider-note");
      if (noteEl) {
        var disabled = [];
        if (!providers.github) disabled.push("GitHub");
        if (!providers.google) disabled.push("Google");
        noteEl.textContent = disabled.length
          ? "Currently disabled on this deployment: " + disabled.join(", ") + "."
          : "Sign in with GitHub or Google via PKCE.";
      }
    }

    async function boundedJson(response, maxBytes) {
      var limit = maxBytes || 65536;
      if (!response.body || typeof response.body.getReader !== "function") {
        return await response.json();
      }
      var reader = response.body.getReader();
      var chunks = [];
      var total = 0;
      try {
        while (true) {
          var step = await reader.read();
          if (step.done) break;
          total += step.value.length;
          if (total > limit) throw new Error("payload_too_large");
          chunks.push(step.value);
        }
      } finally {
        if (typeof reader.cancel === "function") await reader.cancel().catch(function () {});
      }
      var buf = new Uint8Array(total);
      var offset = 0;
      for (var i = 0; i < chunks.length; i++) {
        buf.set(chunks[i], offset);
        offset += chunks[i].length;
      }
      var text = new TextDecoder("utf-8", { fatal: true }).decode(buf);
      try {
        return JSON.parse(text);
      } catch (_) {
        if (!response.ok) return { error: { code: "service_unavailable" } };
        throw new Error("invalid_response");
      }
    }

    async function apiRequest(url, body, bearer, method) {
      if (!profile) throw new Error("service_unavailable");
      var parsed = new URL(url);
      if (!flow.isTrustedApiOrigin(parsed.origin)) throw new Error("untrusted_api_origin");
      var headers = { apikey: profile.publishableKey };
      if (body !== undefined) headers["Content-Type"] = "application/json";
      if (bearer) headers.Authorization = "Bearer " + bearer;
      var response = await fetchFn(url, {
        method: method || (body === undefined ? "GET" : "POST"),
        redirect: "error",
        credentials: "omit",
        signal: typeof AbortSignal !== "undefined" && AbortSignal.timeout ? AbortSignal.timeout(15000) : undefined,
        headers: headers,
        body: body === undefined ? undefined : JSON.stringify(body)
      });
      var data = await boundedJson(response);
      if (!response.ok) {
        var errCode = data && ((data.error && data.error.code) || data.error_code || data.code) || "request_failed";
        var err = new Error(errCode);
        err.status = response.status;
        err.payload = data;
        throw err;
      }
      return data;
    }

    function requireToken() {
      if (!profile || !flow.validateSessionRecord(session, profile.projectOrigin, nowSec())) {
        throw new Error("sign_in_required");
      }
      return session.access_token;
    }

    async function edgePost(action, body) {
      var bearer = requireToken();
      return await apiRequest(profile.onboardingPrefix + "/" + action, Object.assign({ version: 1 }, body || {}), bearer, "POST");
    }

    async function fetchUser(bearer) {
      var u = await apiRequest(profile.projectOrigin + "/auth/v1/user", undefined, bearer, "GET");
      if (!u || !flow.UUID_PATTERN.test(u.id || "") || !Array.isArray(u.identities) || u.identities.length > 100) {
        throw new Error("invalid_response");
      }
      return u;
    }

    async function beginAuth(provider, kind, repoVerification) {
      if (!profile) throw new Error("service_unavailable");
      if (busy) throw new Error("auth_pending");
      if (!["github", "google"].includes(provider)) throw new Error("invalid_provider");
      if (kind === "sign_in" && profile.authProviders && profile.authProviders[provider] === false) {
        throw new Error("provider_disabled");
      }

      var verifier = flow.randomSecret();
      var nonce = flow.randomSecret();
      var challenge = await flow.sha256Base64Url(verifier);
      var origin = siteOrigin();
      var returnTarget = new URL(origin + "/signup");
      returnTarget.searchParams.set("login_nonce", nonce);

      var flowRecord = {
        version: 1,
        kind: kind,
        provider: provider,
        verifier: verifier,
        nonce: nonce,
        expires: nowSec() + 900,
        phase: "pending",
        project: profile.projectOrigin,
        returnURL: origin + "/signup"
      };

      if (kind === "link") {
        var linkBearer = requireToken();
        var userInfo = await fetchUser(linkBearer);
        flowRecord.account_id = userInfo.id;
        flowRecord.session_binding = await flow.sha256Base64Url(linkBearer);
        flowRecord.before_providers = flow.listVerifiedProviders(userInfo);
        var prep = await edgePost("account-register", {
          operation: "prepare_provider_link",
          target_provider: provider
        });
        if (prep && prep.link_intent_id && prep.stepup_secret) {
          flowRecord.link_intent_id = prep.link_intent_id;
          flowRecord.stepup_secret = prep.stepup_secret;
        }
        storeSet("flow", flowRecord);
        syncAuthGateUi();
        var linkAuthUrl = new URL("/auth/v1/user/identities/authorize", profile.projectOrigin);
        linkAuthUrl.search = new URLSearchParams({
          provider: provider,
          code_challenge: challenge,
          code_challenge_method: "s256",
          redirect_to: returnTarget.href,
          scopes: "repo",
          skip_http_redirect: "true"
        }).toString();
        var linkResp = await apiRequest(linkAuthUrl.href, undefined, linkBearer, "GET");
        var linkTarget = new URL(linkResp.url);
        if (linkTarget.origin + linkTarget.pathname !== "https://github.com/login/oauth/authorize" ||
            linkTarget.username || linkTarget.password || linkTarget.hash) {
          storeRemove("flow");
          throw new Error("invalid_response");
        }
        navigateFn(linkTarget.href);
        return;
      }

      if (repoVerification) {
        var activeBearer = requireToken();
        var current = await fetchUser(activeBearer);
        flowRecord.verification_account_id = current.id;
        storeSet("flow", flowRecord);
        syncAuthGateUi();
        var verifyUrl = new URL("/auth/v1/authorize", profile.projectOrigin);
        verifyUrl.search = new URLSearchParams({
          provider: provider,
          code_challenge: challenge,
          code_challenge_method: "s256",
          redirect_to: returnTarget.href,
          scopes: "repo"
        }).toString();
        navigateFn(verifyUrl.href);
        return;
      }

      storeSet("flow", flowRecord);
      syncAuthGateUi();
      var authUrl = flow.buildAuthAuthorizeUrl({
        authBaseUrl: profile.authBaseUrl,
        provider: provider,
        returnTo: returnTarget.href,
        codeChallenge: challenge,
        expectedOrigin: origin
      });
      navigateFn(authUrl);
    }

    function renderAccountBar() {
      var bar = byId("account-bar");
      var summary = byId("account-summary");
      if (!bar || !summary || !currentUser) return;
      var providers = flow.listVerifiedProviders(currentUser).map(function (p) {
        return p === "github" ? "GitHub" : p === "google" ? "Google" : p;
      });
      summary.textContent = "Account " + currentUser.id +
        (providers.length ? " · Linked: " + providers.join(", ") : " · No code host linked");
      bar.hidden = false;
    }

    function showIdentityPanel(mode, pendingProvider) {
      hideAllProtectedPanels();
      renderAccountBar();
      var panel = byId("step-identity");
      var heading = byId("identity-heading");
      var msg = byId("identity-message");
      var linkActions = byId("identity-link-actions");
      var qActions = byId("identity-quarantine-actions");
      if (!panel) return;
      if (mode === "quarantine") {
        pendingStepupProvider = pendingProvider || null;
        heading.textContent = "Confirm attached sign-in provider";
        msg.textContent = "An unconfirmed provider attachment (" + (pendingStepupProvider || "provider") +
          ") requires explicit confirmation or revocation before organization or billing access continues.";
        if (linkActions) linkActions.hidden = true;
        if (qActions) qActions.hidden = false;
        setStatus("Step-up verification required before accessing organizations or Checkout.", true);
      } else {
        pendingStepupProvider = null;
        heading.textContent = "Link your GitHub identity";
        msg.textContent = "You signed in with Google. Decapod Cloud requires a verified GitHub identity to confirm repository ownership before enrollment or Checkout.";
        if (linkActions) linkActions.hidden = false;
        if (qActions) qActions.hidden = true;
        setStatus("Link a verified GitHub account to select and verify your repository.", false);
      }
      panel.hidden = false;
    }

    function showFailClosedState(kind, kicker, heading, message, detail, allowRetry) {
      hideAllProtectedPanels();
      renderAccountBar();
      var card = byId("step-state");
      if (!card) return;
      byId("state-kicker").textContent = kicker;
      byId("state-heading").textContent = heading;
      byId("state-message").textContent = message;
      byId("state-detail").textContent = detail || "";
      var retryBtn = byId("state-retry-btn");
      if (retryBtn) retryBtn.hidden = !allowRetry;
      card.dataset.stateKind = kind;
      card.hidden = false;
    }

    function showReadyState(projectId, accessStatus) {
      pollGeneration++;
      hideAllProtectedPanels();
      renderAccountBar();
      var card = byId("step-ready");
      var summary = byId("ready-summary");
      if (!card || !summary) return;
      var roleLabel = accessStatus.admin ? "workspace administrator" : "assigned repository contributor";
      summary.textContent = "Repository " + (accessStatus.project_id || projectId) +
        " is active and server-authorized (" + roleLabel + ").";
      card.hidden = false;
      setStatus("Ready: backend_authorized=true for " + (accessStatus.project_id || projectId) + ".", false);
    }

    function isOrgAdmin(orgId) {
      var orgs = (accountSnapshot && Array.isArray(accountSnapshot.organizations))
        ? accountSnapshot.organizations
        : [];
      return orgs.some(function (o) { return o.id === orgId && o.admin === true; });
    }

    function findExistingProject(slug) {
      var projects = (accountSnapshot && Array.isArray(accountSnapshot.projects))
        ? accountSnapshot.projects
        : [];
      var target = slug.toLowerCase();
      return projects.find(function (p) {
        return (typeof p.name === "string" && p.name.toLowerCase() === target) ||
          (typeof p.project_id === "string" && p.project_id.toLowerCase() === target);
      }) || null;
    }

    function populateRepoDropdown(orgLogin) {
      var repoSelect = byId("repo-select");
      var repoInput = byId("repo-input");
      if (!repoSelect) return;
      repoSelect.replaceChildren();
      var filtered = githubReposCache.filter(function (r) {
        return !orgLogin || (r.owner && r.owner.login === orgLogin);
      });
      var placeholder = doc.createElement("option");
      placeholder.value = "";
      placeholder.textContent = filtered.length ? "Select a repository…" : "No admin repositories found in this owner";
      repoSelect.appendChild(placeholder);
      for (var i = 0; i < filtered.length; i++) {
        var opt = doc.createElement("option");
        opt.value = filtered[i].full_name;
        opt.textContent = filtered[i].full_name + (filtered[i].private ? " (private)" : "");
        repoSelect.appendChild(opt);
      }
      if (preselectedRepo && filtered.some(function (r) { return r.full_name.toLowerCase() === preselectedRepo.toLowerCase(); })) {
        var match = filtered.find(function (r) { return r.full_name.toLowerCase() === preselectedRepo.toLowerCase(); });
        repoSelect.value = match.full_name;
        if (repoInput) repoInput.value = match.full_name;
      }
    }

    async function loadGitHubOrgsAndRepos() {
      var orgBlock = byId("org-picker-block");
      var orgSelect = byId("org-select");
      var authBtn = byId("authorize-github-repos-btn");
      if (!inMemoryProviderToken) {
        if (orgBlock) orgBlock.hidden = true;
        if (authBtn) authBtn.hidden = false;
        return;
      }
      if (authBtn) authBtn.hidden = true;
      try {
        var headers = {
          Authorization: "Bearer " + inMemoryProviderToken,
          Accept: "application/vnd.github+json"
        };
        var userRes = await fetchFn("https://api.github.com/user", {
          method: "GET",
          redirect: "error",
          headers: headers
        });
        var orgsRes = await fetchFn("https://api.github.com/user/orgs?per_page=100", {
          method: "GET",
          redirect: "error",
          headers: headers
        });
        var reposRes = await fetchFn("https://api.github.com/user/repos?per_page=100&affiliation=owner,organization_member", {
          method: "GET",
          redirect: "error",
          headers: headers
        });
        if (!userRes.ok || !reposRes.ok) {
          if (authBtn) authBtn.hidden = false;
          return;
        }
        var ghUser = await userRes.json();
        var ghOrgs = orgsRes.ok ? await orgsRes.json() : [];
        var ghRepos = await reposRes.json();
        githubOrgsCache = [];
        if (ghUser && typeof ghUser.login === "string") {
          githubOrgsCache.push({ login: ghUser.login, label: ghUser.login + " (personal)" });
        }
        if (Array.isArray(ghOrgs)) {
          for (var i = 0; i < ghOrgs.length; i++) {
            if (ghOrgs[i] && typeof ghOrgs[i].login === "string") {
              githubOrgsCache.push({ login: ghOrgs[i].login, label: ghOrgs[i].login + " (organization)" });
            }
          }
        }
        githubReposCache = Array.isArray(ghRepos)
          ? ghRepos.filter(function (r) { return r && typeof r.full_name === "string" && r.permissions && r.permissions.admin === true; })
          : [];
        if (orgSelect && githubOrgsCache.length) {
          orgSelect.replaceChildren();
          for (var j = 0; j < githubOrgsCache.length; j++) {
            var opt = doc.createElement("option");
            opt.value = githubOrgsCache[j].login;
            opt.textContent = githubOrgsCache[j].label;
            orgSelect.appendChild(opt);
          }
          if (preselectedRepo) {
            var preOwner = preselectedRepo.split("/")[0];
            var matchingOrg = githubOrgsCache.find(function (o) { return o.login.toLowerCase() === preOwner.toLowerCase(); });
            if (matchingOrg) orgSelect.value = matchingOrg.login;
          }
          populateRepoDropdown(orgSelect.value);
          if (orgBlock) orgBlock.hidden = false;
        }
      } catch (_) {
        if (authBtn) authBtn.hidden = false;
      }
    }

    async function showOrgRepoPicker(note) {
      hideAllProtectedPanels();
      renderAccountBar();
      var panel = byId("step-org-repo");
      var input = byId("repo-input");
      var hint = byId("org-repo-hint");
      if (!panel) return;
      if (preselectedRepo && input && !input.value) {
        input.value = preselectedRepo;
      }
      if (hint) hint.textContent = note || "";
      panel.hidden = false;
      await loadGitHubOrgsAndRepos();
    }

    async function runPendingFulfillmentPoll(projectId) {
      var myGen = ++pollGeneration;
      showFailClosedState(
        "pending_fulfillment",
        "FULFILLMENT IN PROGRESS",
        "Confirming payment & repository seat",
        "Checkout redirect alone never grants access. Waiting for server-verified payment settlement and repository seat activation.",
        "Checking fulfillment status…",
        true
      );
      var outcome = await flow.createBoundedPoller({
        maxAttempts: 12,
        intervalMs: 2500,
        sleepFn: sleepFn,
        isCancelled: function () { return myGen !== pollGeneration; },
        onUpdate: function (info) {
          var detail = byId("state-detail");
          if (!detail) return;
          detail.textContent = info.phase === "checking"
            ? "Checking server fulfillment (attempt " + info.attempt + " of " + info.maxAttempts + ")…"
            : "Still waiting on settlement (attempt " + info.attempt + " of " + info.maxAttempts + ")…";
        },
        checkFn: async function () {
          return await edgePost("account-status", {
            project_id: projectId,
            operation: "access_details"
          });
        }
      });

      if (outcome.outcome === "cancelled") return;
      if (outcome.outcome === "ready") {
        showReadyState(projectId, outcome.result);
        return;
      }
      if (outcome.outcome === "admin_approval_required") {
        showFailClosedState(
          "admin_approval_required",
          "ADMIN APPROVAL REQUIRED",
          "Administrator approval required",
          "An organization administrator must approve access and assign a paid seat for this repository.",
          "Ask an existing administrator to invite or assign your account, then select Check status now.",
          true
        );
        return;
      }
      if (outcome.outcome === "organization_already_enrolled") {
        showFailClosedState(
          "organization_already_enrolled",
          "ORGANIZATION ALREADY ENROLLED",
          "Organization already enrolled",
          "This GitHub organization is already registered on Decapod Cloud. A second claiming Checkout is blocked.",
          "Request an invitation or repository seat assignment from an existing organization administrator.",
          false
        );
        return;
      }
      var detail = byId("state-detail");
      if (detail) {
        detail.textContent = "Fulfillment is still pending after " + outcome.attempts +
          " checks. Access remains locked until settlement completes. Use Check status now to retry.";
      }
    }

    async function showCheckoutPanel(orgId, projectId, repoLabel) {
      hideAllProtectedPanels();
      renderAccountBar();
      activeOrganizationId = orgId;
      activeProjectId = projectId;
      activeQuoteOrder = null;

      var card = byId("step-checkout");
      var label = byId("checkout-target-label");
      var closedBox = byId("billing-closed-notice");
      var quoteControls = byId("billing-quote-controls");
      var quoteSummary = byId("quote-summary");
      var checkoutBtn = byId("checkout-btn");
      if (!card) return;

      if (label) {
        label.textContent = "Verified repository: " + (repoLabel || projectId) + " · Organization " + orgId;
      }
      if (quoteSummary) quoteSummary.hidden = true;
      if (checkoutBtn) checkoutBtn.disabled = true;

      var cadenceSelect = byId("billing-cadence");
      if (cadenceSelect && (preferredBilling === "month" || preferredBilling === "year")) {
        cadenceSelect.value = preferredBilling;
      }

      try {
        var bStatus = await edgePost("billing-manage", {
          action: "status",
          organization_id: orgId
        });
        if (closedBox) closedBox.hidden = true;
        if (quoteControls) quoteControls.hidden = false;
        card.hidden = false;
        setStatus("Organization and repository verified. Request an authoritative server quote to continue.", false);
        if (bStatus && bStatus.pending_order && bStatus.pending_order.quote_id) {
          renderQuoteSummary(bStatus.pending_order, repoLabel || projectId);
        }
      } catch (error) {
        var code = error && error.message ? error.message : "";
        if (code === "billing_not_configured" || code === "live_sale_disabled") {
          if (closedBox) closedBox.hidden = false;
          if (quoteControls) quoteControls.hidden = true;
          card.hidden = false;
          setStatus("Cloud purchasing is currently Under Wraps / disabled on the server.", false);
          return;
        }
        throw error;
      }
    }

    function renderQuoteSummary(quoted, repoLabel) {
      activeQuoteOrder = quoted;
      var summary = byId("quote-summary");
      var amountEl = byId("quote-amount");
      var detailsEl = byId("quote-details");
      var commitEl = byId("quote-commitment");
      var checkoutBtn = byId("checkout-btn");
      if (!summary || !amountEl || !detailsEl || !commitEl || !checkoutBtn) return;

      var fmt = function (cents) {
        return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
      };
      amountEl.textContent = Number.isSafeInteger(quoted.amount) ? fmt(quoted.amount) : "Quoted";
      var unitNote = Number.isSafeInteger(quoted.unit_cents)
        ? " (" + fmt(quoted.unit_cents) + "/seat" +
          (Number.isSafeInteger(quoted.total_discount_pct) ? ", " + quoted.total_discount_pct + "% discount" : "") + ")"
        : "";
      detailsEl.textContent = (repoLabel || activeProjectId) + " · " + quoted.quantity +
        " seat(s)" + unitNote + ". Applicable taxes calculated at Stripe Checkout. Paid overages remain OFF.";
      commitEl.textContent = quoted.cadence === "year"
        ? "Annual commitment billed upfront for 12 months. Monthly resource allowances still reset monthly."
        : "Monthly recurring subscription. Changes or cancellations take effect at renewal.";
      summary.hidden = false;
      checkoutBtn.disabled = !quoted.quote_id || quoted.status === "scheduled";
    }

    async function inspectProjectAccess(orgId, projectId, repoLabel) {
      activeOrganizationId = orgId;
      activeProjectId = projectId;
      var access = await edgePost("account-status", {
        project_id: projectId,
        operation: "access_details"
      });
      var state = flow.classifyAccessState(access);
      if (state === "ready") {
        showReadyState(projectId, access);
        return;
      }
      if (state === "pending_fulfillment" || checkoutReturned) {
        await runPendingFulfillmentPoll(projectId);
        return;
      }
      if (state === "organization_already_enrolled") {
        showFailClosedState(
          "organization_already_enrolled",
          "ORGANIZATION ALREADY ENROLLED",
          "Organization already enrolled",
          "This GitHub organization is already enrolled on Decapod Cloud under another owner. Duplicate claiming Checkout is prevented.",
          "Ask an existing organization administrator to invite this account and assign a repository seat.",
          false
        );
        return;
      }
      if (state === "admin_approval_required") {
        showFailClosedState(
          "admin_approval_required",
          "ADMIN APPROVAL REQUIRED",
          "Administrator approval required",
          "An administrator of this organization must approve your access and assign a seat for " + (repoLabel || projectId) + ".",
          "Once an admin assigns your seat, click Check status now.",
          true
        );
        return;
      }
      if (state === "entitlement_required") {
        if (!isOrgAdmin(access.organization_id || orgId)) {
          showFailClosedState(
            "admin_approval_required",
            "ADMIN APPROVAL REQUIRED",
            "Administrator approval required",
            "Your account is not an administrator of this organization. Only an organization administrator can purchase or assign repository seats.",
            "Ask your organization administrator to purchase or assign a seat, then click Check status now.",
            true
          );
          return;
        }
        await showCheckoutPanel(access.organization_id || orgId, projectId, repoLabel);
        return;
      }
      await showOrgRepoPicker("Complete repository verification to continue.");
    }

    async function handleVerifyAndEnrollRepo() {
      var input = byId("repo-input");
      var hint = byId("org-repo-hint");
      var rawSlug = input ? input.value : "";
      var parsed = flow.parseRepoSlug(rawSlug);
      if (!parsed) {
        if (hint) hint.textContent = "Enter a valid repository as owner/repo (letters, digits, ., _, - only).";
        return;
      }
      preselectedRepo = parsed.slug;
      storeSet("pending-repo", parsed.slug);

      var existing = findExistingProject(parsed.slug);
      if (existing) {
        await inspectProjectAccess(existing.organization_id || existing.organization, existing.project_id, parsed.slug);
        return;
      }

      if (!inMemoryProviderToken) {
        if (hint) {
          hint.textContent = "GitHub repository verification requires an active GitHub OAuth session with repository permissions. Click Authorize GitHub repository lookup.";
        }
        var authBtn = byId("authorize-github-repos-btn");
        if (authBtn) authBtn.hidden = false;
        return;
      }

      if (enrollRepoSlug !== parsed.slug || !enrollRequestId) {
        enrollRepoSlug = parsed.slug;
        enrollRequestId = typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : flow.randomSecret();
      }

      try {
        if (hint) hint.textContent = "Verifying GitHub organization and repository permissions…";
        var existingProjects = (accountSnapshot && Array.isArray(accountSnapshot.projects))
          ? accountSnapshot.projects
          : [];
        var ownerPrefix = parsed.owner.toLowerCase() + "/";
        var sameOwnerProject = existingProjects.find(function (p) {
          var pName = typeof p.name === "string" ? p.name.toLowerCase() : "";
          var pId = typeof p.project_id === "string" ? p.project_id.toLowerCase() : "";
          return (pName.startsWith(ownerPrefix) || pId.startsWith(ownerPrefix)) &&
            isOrgAdmin(p.organization_id || p.organization);
        });
        var enrollBody = {
          request_id: enrollRequestId,
          provider: "github",
          repository: parsed.slug,
          provider_token: inMemoryProviderToken
        };
        if (sameOwnerProject) {
          enrollBody.organization_id = sameOwnerProject.organization_id || sameOwnerProject.organization;
        }
        var enrolled = await edgePost("repository-enroll", enrollBody);
        if (enrolled.status !== "repository_enrolled" || typeof enrolled.project_id !== "string") {
          throw new Error(enrolled.status || "repository_verification_required");
        }
        enrollRequestId = null;
        enrollRepoSlug = null;
        await loadAuthenticatedAccount();
        await inspectProjectAccess(enrolled.organization_id, enrolled.project_id, parsed.slug);
      } catch (error) {
        var code = error && error.message ? error.message : "repository_verification_required";
        if (code === "organization_already_enrolled") {
          showFailClosedState(
            "organization_already_enrolled",
            "ORGANIZATION ALREADY ENROLLED",
            "Organization already enrolled",
            "The GitHub organization for " + parsed.slug + " is already claimed by an existing Decapod Cloud organization.",
            "Contact an existing administrator for an invitation and repository assignment instead of creating a duplicate subscription.",
            false
          );
          return;
        }
        if (code === "repository_already_enrolled") {
          showFailClosedState(
            "repository_already_enrolled",
            "REPOSITORY ALREADY ENROLLED",
            "Repository already enrolled",
            parsed.slug + " is already registered with another Decapod Cloud organization.",
            "Ask that organization's administrator for access or choose another repository.",
            false
          );
          return;
        }
        if (code === "admin_approval_required" || code === "admin_required") {
          showFailClosedState(
            "admin_approval_required",
            "ADMIN APPROVAL REQUIRED",
            "Administrator approval required",
            "Only an existing organization administrator can enroll repositories for this organization.",
            "Ask your administrator to enroll " + parsed.slug + " and assign your seat.",
            false
          );
          return;
        }
        if (code === "repository_verification_required") {
          if (hint) {
            hint.textContent = "GitHub admin verification failed for " + parsed.slug +
              ". Ensure you administer this repository and click Authorize GitHub repository lookup.";
          }
          var authBtn2 = byId("authorize-github-repos-btn");
          if (authBtn2) authBtn2.hidden = false;
          return;
        }
        if (code === "repository_identity_mismatch") {
          if (hint) hint.textContent = "Use the same GitHub account that is linked to this signed-in Decapod account.";
          return;
        }
        if (hint) hint.textContent = "Repository verification failed (" + code + ").";
      }
    }

    async function handleQuoteClick() {
      if (!activeOrganizationId || !activeProjectId) return;
      var cadenceEl = byId("billing-cadence");
      var seatEl = byId("seat-quantity");
      var cadence = cadenceEl && cadenceEl.value === "year" ? "year" : "month";
      var capacity = Math.floor(Number(seatEl ? seatEl.value : 1));
      if (!Number.isSafeInteger(capacity) || capacity < 1 || capacity > 1000) {
        setStatus("Enter a seat count between 1 and 1000.", true);
        return;
      }
      var payload = {
        organization_id: activeOrganizationId,
        cadence: cadence,
        allocations: [{ project_id: activeProjectId, capacity: capacity }]
      };
      var canonical = JSON.stringify(payload);
      if (quotePayloadKey !== canonical || !quoteRequestId) {
        quotePayloadKey = canonical;
        quoteRequestId = typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : flow.randomSecret();
      }
      try {
        setStatus("Requesting authoritative quote from server…", false);
        var quoted = await edgePost("billing-quote", Object.assign({ request_id: quoteRequestId }, payload));
        renderQuoteSummary(quoted, preselectedRepo || activeProjectId);
        setStatus("Server quote ready. Review exact amount and terms before opening Stripe Checkout.", false);
      } catch (error) {
        var code = error && error.message ? error.message : "billing_quote_unavailable";
        if (code === "billing_not_configured" || code === "live_sale_disabled") {
          await showCheckoutPanel(activeOrganizationId, activeProjectId, preselectedRepo || activeProjectId);
          return;
        }
        setStatus("Quote failed (" + code + ").", true);
      }
    }

    var checkoutInFlight = false;
    async function handleCheckoutClick() {
      if (checkoutInFlight) return;
      if (!activeOrganizationId || !activeQuoteOrder || !activeQuoteOrder.quote_id) {
        setStatus("Request a valid server quote before proceeding to Checkout.", true);
        return;
      }
      checkoutInFlight = true;
      var checkoutBtn = byId("checkout-btn");
      if (checkoutBtn) checkoutBtn.disabled = true;
      try {
        setStatus("Creating server-bound Checkout session…", false);
        var result = await edgePost("billing-checkout", {
          organization_id: activeOrganizationId,
          order_id: activeQuoteOrder.order_id,
          quote_id: activeQuoteOrder.quote_id
        });
        if (result.checkout_url) {
          if (!flow.isAllowedCheckoutUrl(result.checkout_url)) {
            throw new Error("invalid_response");
          }
          navigateFn(result.checkout_url);
          return;
        }
        if (result.status === "payment_pending") {
          await runPendingFulfillmentPoll(activeProjectId);
          return;
        }
        await inspectProjectAccess(activeOrganizationId, activeProjectId, preselectedRepo || activeProjectId);
      } catch (error) {
        setStatus("Checkout could not be started (" + (error && error.message ? error.message : "error") + ").", true);
        if (checkoutBtn && activeQuoteOrder && activeQuoteOrder.quote_id) checkoutBtn.disabled = false;
      } finally {
        checkoutInFlight = false;
      }
    }

    async function loadAuthenticatedAccount() {
      var bearer = requireToken();
      currentUser = await fetchUser(bearer);
      var result = await edgePost("account-register", { operation: "account" });
      if (result.account_id !== currentUser.id) {
        throw new Error("auth_account_changed");
      }
      accountSnapshot = result;

      var currentProviders = flow.listVerifiedProviders(currentUser);
      var unconfirmedLocal = Array.isArray(result.confirmed_providers)
        ? currentProviders.filter(function (p) { return !result.confirmed_providers.includes(p); })
        : [];
      if (result.status === "provider_link_stepup_required" || result.identity_state === "stepup_required" || unconfirmedLocal.length > 0) {
        var pendingList = (Array.isArray(result.pending_providers) ? result.pending_providers : []).concat(unconfirmedLocal);
        showIdentityPanel("quarantine", pendingList[0] || null);
        return;
      }
      if (result.status === "code_host_link_required" || !flow.hasVerifiedProvider(currentUser, "github")) {
        showIdentityPanel("link_github");
        return;
      }

      var invite = storeGet("invitation", 4096);
      if (invite && flow.UUID_PATTERN.test(invite.id || "") && typeof invite.secret === "string") {
        try {
          var accepted = await edgePost("account-register", {
            operation: "accept_invite",
            invitation_id: invite.id,
            invitation_secret: invite.secret
          });
          if (accepted.status === "invitation_accepted") {
            storeRemove("invitation");
            result = await edgePost("account-register", { operation: "account" });
            accountSnapshot = result;
          }
        } catch (_) {}
      }

      if (preselectedRepo) {
        var existing = findExistingProject(preselectedRepo);
        if (existing) {
          await inspectProjectAccess(existing.organization_id || existing.organization, existing.project_id, preselectedRepo);
          return;
        }
      }
      await showOrgRepoPicker(
        preselectedRepo
          ? "Verify GitHub administration for " + preselectedRepo + " to continue."
          : "Select an organization and repository to enroll or check access."
      );
    }

    async function processIncomingUrlAndSession() {
      var currentUrl = new URL(winLocation.href);
      var query = new URLSearchParams(currentUrl.search || "");
      var rawHash = currentUrl.hash || "";
      var fragment = new URLSearchParams(rawHash.startsWith("#") ? rawHash.slice(1) : rawHash);

      var repoCheck = flow.parseRepoSearch(query);
      if (repoCheck.status === "valid") {
        preselectedRepo = repoCheck.slug;
        try {
          if (storage) storage.setItem("decapod:pending-repo-intent", repoCheck.slug);
        } catch (_) {}
        setBanner("valid", "Repository intent: " + repoCheck.slug, "Unverified intent until GitHub ownership is checked after sign-in.");
      } else if (repoCheck.status === "invalid") {
        preselectedRepo = null;
        try {
          if (storage) storage.removeItem("decapod:pending-repo-intent");
        } catch (_) {}
        setBanner("invalid", "Invalid repository parameter ignored", "Select an authorized repository after signing in.");
      } else {
        try {
          var savedRepo = storage ? storage.getItem("decapod:pending-repo-intent") : null;
          var parsedSaved = flow.parseRepoSlug(savedRepo);
          if (parsedSaved) {
            preselectedRepo = parsedSaved.slug;
            setBanner("valid", "Repository intent: " + parsedSaved.slug, "Unverified intent until GitHub ownership is checked.");
          }
        } catch (_) {}
      }

      var returnCheck = flow.parseSafeReturnParam(query, siteOrigin());
      if (returnCheck.status === "rejected") {
        setStatus("Hostile or external return URL rejected.", true);
      }

      var billingParam = query.get("billing");
      if (billingParam === "month" || billingParam === "year") {
        preferredBilling = billingParam;
      }
      checkoutReturned = query.get("checkout") === "returned";

      var code = query.get("code");
      var loginNonce = query.get("login_nonce");
      var codeList = query.getAll("code");
      var nonceList = query.getAll("login_nonce");
      var oauthError = query.get("error") || fragment.get("error");
      var invId = query.get("invitation_id");
      var invSecret = fragment.get("invitation_secret");
      var hostileFragment = flow.hasHostileFragmentTokens(rawHash);

      // Scrub all URL query and fragment parameters immediately before network calls.
      if ((currentUrl.search || currentUrl.hash) && winHistory && typeof winHistory.replaceState === "function") {
        winHistory.replaceState(null, "", "/signup");
      }

      if (!profile) {
        profile = await flow.discoverRuntimeConfig(fetchFn);
      }
      if (!profile) {
        syncAuthGateUi();
        setStatus("Cloud authentication configuration is currently unavailable.", true);
        return;
      }

      if (invId && invSecret && flow.UUID_PATTERN.test(invId) && flow.PKCE_HASH_PATTERN.test(invSecret)) {
        storeSet("invitation", { id: invId, secret: invSecret });
      }

      var storedSession = storeGet("session");
      session = flow.validateSessionRecord(storedSession, profile.projectOrigin, nowSec()) ? storedSession : null;
      if (!session && storedSession) storeRemove("session");

      if (hostileFragment) {
        session = null;
        storeRemove("session");
        syncAuthGateUi();
        setStatus("Rejected URL fragment tokens. Sign in through the managed PKCE button below.", true);
        return;
      }

      if (query.has("code") || query.has("error") || fragment.has("error")) {
        var pendingFlow = storeGet("flow", 8192);
        var validFlow = pendingFlow &&
          pendingFlow.version === 1 &&
          pendingFlow.project === profile.projectOrigin &&
          pendingFlow.phase === "pending" &&
          Number.isSafeInteger(pendingFlow.expires) &&
          pendingFlow.expires > nowSec() &&
          flow.PKCE_HASH_PATTERN.test(pendingFlow.verifier || "") &&
          flow.PKCE_HASH_PATTERN.test(pendingFlow.nonce || "") &&
          nonceList.length === 1 &&
          pendingFlow.nonce === loginNonce;

        if (validFlow && pendingFlow.kind === "link") {
          var linkBinding = session ? await flow.sha256Base64Url(session.access_token) : null;
          if (!session || !flow.UUID_PATTERN.test(pendingFlow.account_id || "") || pendingFlow.session_binding !== linkBinding) {
            validFlow = false;
          }
        }

        if (!validFlow) {
          storeRemove("flow");
          syncAuthGateUi();
          setStatus("Sign-in callback expired or failed state validation. Please sign in again.", true);
          return;
        }

        if (oauthError) {
          storeRemove("flow");
          syncAuthGateUi();
          setStatus("Sign-in canceled or declined.", false);
          if (session) await loadAuthenticatedAccount();
          return;
        }

        if (codeList.length !== 1 || typeof code !== "string" || !code || code.length > 2048) {
          storeRemove("flow");
          syncAuthGateUi();
          setStatus("Invalid authorization callback code.", true);
          return;
        }

        pendingFlow.phase = "exchanging";
        storeSet("flow", pendingFlow);
        var exchanged = await apiRequest(
          profile.projectOrigin + "/auth/v1/token?grant_type=pkce",
          { auth_code: code, code_verifier: pendingFlow.verifier },
          undefined,
          "POST"
        );
        if (typeof exchanged.access_token !== "string" || !exchanged.access_token ||
            exchanged.access_token.length > 16384 || /\s/.test(exchanged.access_token) ||
            !Number.isSafeInteger(exchanged.expires_in) || exchanged.expires_in <= 15) {
          storeRemove("flow");
          throw new Error("invalid_response");
        }
        var confirmed = await fetchUser(exchanged.access_token);
        if ((pendingFlow.kind === "link" && confirmed.id !== pendingFlow.account_id) ||
            (pendingFlow.verification_account_id && confirmed.id !== pendingFlow.verification_account_id)) {
          storeRemove("flow");
          throw new Error("auth_account_changed");
        }
        if (pendingFlow.kind === "link" && Array.isArray(pendingFlow.before_providers)) {
          var afterProviders = flow.listVerifiedProviders(confirmed);
          if (afterProviders.some(function (p) {
            return p !== pendingFlow.provider && !pendingFlow.before_providers.includes(p);
          })) {
            storeRemove("flow");
            throw new Error("unexpected_provider_attach");
          }
        }
        session = {
          access_token: exchanged.access_token,
          expires_at: nowSec() + exchanged.expires_in,
          origin: profile.projectOrigin
        };
        storeSet("session", session);
        storeRemove("flow");
        if (typeof exchanged.provider_token === "string" && exchanged.provider_token) {
          inMemoryProviderToken = exchanged.provider_token;
        }
        if (pendingFlow.kind === "link" && pendingFlow.link_intent_id && pendingFlow.stepup_secret) {
          await edgePost("account-register", {
            operation: "confirm_provider_link",
            link_intent_id: pendingFlow.link_intent_id,
            stepup_secret: pendingFlow.stepup_secret
          });
        }
      }

      syncAuthGateUi();
      if (!session) {
        setStatus("Sign in with GitHub or Google to verify your organization and repository.", false);
        return;
      }
      await loadAuthenticatedAccount();
    }

    function bindEvents() {
      var ghBtn = byId("auth-github");
      if (ghBtn) ghBtn.onclick = function () { beginAuth("github", "sign_in", false).catch(function (e) { setStatus("Sign-in error: " + e.message, true); }); };
      var googleBtn = byId("auth-google");
      if (googleBtn) googleBtn.onclick = function () { beginAuth("google", "sign_in", false).catch(function (e) { setStatus("Sign-in error: " + e.message, true); }); };
      var cancelBtn = byId("cancel-auth-btn");
      if (cancelBtn) cancelBtn.onclick = function () { storeRemove("flow"); syncAuthGateUi(); setStatus("Pending sign-in canceled.", false); };
      var signOutBtn = byId("sign-out-btn");
      if (signOutBtn) {
        signOutBtn.onclick = function () {
          pollGeneration++;
          storeRemove("flow");
          storeRemove("session");
          session = null;
          currentUser = null;
          accountSnapshot = null;
          inMemoryProviderToken = null;
          syncAuthGateUi();
          setStatus("Signed out. Authenticate to continue.", false);
        };
      }
      var refreshBtn = byId("refresh-account-btn");
      if (refreshBtn) refreshBtn.onclick = function () { loadAuthenticatedAccount().catch(function (e) { setStatus("Refresh failed: " + e.message, true); }); };
      var linkGhBtn = byId("link-github-btn");
      if (linkGhBtn) linkGhBtn.onclick = function () { beginAuth("github", "link", true).catch(function (e) { setStatus("GitHub linking failed: " + e.message, true); }); };
      var confirmProvBtn = byId("confirm-provider-btn");
      if (confirmProvBtn) {
        confirmProvBtn.onclick = function () {
          if (!pendingStepupProvider) return;
          edgePost("account-register", {
            operation: "resolve_provider_quarantine",
            provider: pendingStepupProvider,
            decision: "confirm"
          }).then(function () { return loadAuthenticatedAccount(); })
            .catch(function (e) { setStatus("Provider confirmation failed: " + e.message, true); });
        };
      }
      var revokeProvBtn = byId("revoke-provider-btn");
      if (revokeProvBtn) {
        revokeProvBtn.onclick = function () {
          if (!pendingStepupProvider) return;
          edgePost("account-register", {
            operation: "resolve_provider_quarantine",
            provider: pendingStepupProvider,
            decision: "revoke"
          }).then(function () { return loadAuthenticatedAccount(); })
            .catch(function (e) { setStatus("Provider revocation failed: " + e.message, true); });
        };
      }
      var orgSelect = byId("org-select");
      if (orgSelect) orgSelect.onchange = function () { populateRepoDropdown(orgSelect.value); };
      var repoSelect = byId("repo-select");
      if (repoSelect) {
        repoSelect.onchange = function () {
          var input = byId("repo-input");
          if (input && repoSelect.value) input.value = repoSelect.value;
        };
      }
      var verifyRepoBtn = byId("verify-repo-btn");
      if (verifyRepoBtn) verifyRepoBtn.onclick = function () { handleVerifyAndEnrollRepo().catch(function (e) { setStatus("Verification error: " + e.message, true); }); };
      var authReposBtn = byId("authorize-github-repos-btn");
      if (authReposBtn) authReposBtn.onclick = function () { beginAuth("github", "sign_in", true).catch(function (e) { setStatus("GitHub authorization error: " + e.message, true); }); };
      var stateRetryBtn = byId("state-retry-btn");
      if (stateRetryBtn) {
        stateRetryBtn.onclick = function () {
          if (activeProjectId) {
            inspectProjectAccess(activeOrganizationId, activeProjectId, preselectedRepo || activeProjectId)
              .catch(function (e) { setStatus("Status check failed: " + e.message, true); });
          }
        };
      }
      var changeRepoBtn = byId("state-change-repo-btn");
      if (changeRepoBtn) changeRepoBtn.onclick = function () { pollGeneration++; showOrgRepoPicker("").catch(function () {}); };
      var checkoutBackBtn = byId("checkout-back-btn");
      if (checkoutBackBtn) checkoutBackBtn.onclick = function () { showOrgRepoPicker("").catch(function () {}); };
      var quoteBtn = byId("quote-btn");
      if (quoteBtn) quoteBtn.onclick = function () { handleQuoteClick().catch(function () {}); };
      var checkoutBtn = byId("checkout-btn");
      if (checkoutBtn) checkoutBtn.onclick = function () { handleCheckoutClick().catch(function () {}); };
      var readyAnotherBtn = byId("ready-another-btn");
      if (readyAnotherBtn) readyAnotherBtn.onclick = function () { showOrgRepoPicker("").catch(function () {}); };
    }

    async function init() {
      bindEvents();
      syncAuthGateUi();
      try {
        await processIncomingUrlAndSession();
      } catch (error) {
        syncAuthGateUi();
        setStatus("Authentication could not be completed (" + (error && error.message ? error.message : "error") + ").", true);
      }
    }

    return {
      init: init,
      beginAuth: beginAuth,
      verifyRepo: handleVerifyAndEnrollRepo,
      requestQuote: handleQuoteClick,
      startCheckout: handleCheckoutClick,
      pollFulfillment: runPendingFulfillmentPoll,
      getState: function () {
        return {
          authenticated: Boolean(profile && flow.validateSessionRecord(session, profile.projectOrigin, nowSec())),
          preselectedRepo: preselectedRepo,
          activeProjectId: activeProjectId,
          activeOrganizationId: activeOrganizationId
        };
      }
    };
  }

  root.DecapodSignupApp = Object.freeze({
    createSignupController: createSignupController
  });

  if (typeof document !== "undefined" && typeof document.getElementById === "function" && document.getElementById("signup-app")) {
    var app = createSignupController({});
    app.init().catch(function () {});
  }
})(typeof globalThis !== "undefined" ? globalThis : window);
