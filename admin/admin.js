(function (root) {
  "use strict";

  var TERMS_VERSION = "v7_2026_11_18";
  var CATEGORY_LABELS = {
    network_transfer: "Network transfer",
    compute_operations: "Compute & operations",
    retained_data: "Retained data",
    request_pressure: "Request pressure"
  };

  function hasCompatibleFlow(candidate) {
    return Boolean(
      candidate &&
      candidate.CONTRACT_VERSION === 1 &&
      typeof candidate.isAllowedSiteOrigin === "function" &&
      typeof candidate.isTrustedApiOrigin === "function" &&
      typeof candidate.isTrustedAuthUrl === "function" &&
      typeof candidate.isAllowedCheckoutUrl === "function" &&
      typeof candidate.isSupportedApiContractVersion === "function" &&
      typeof candidate.checkPageCoherence === "function" &&
      typeof candidate.scrubSensitiveLocation === "function" &&
      typeof candidate.createCoherenceChannel === "function" &&
      typeof candidate.parseOrgSlug === "function" &&
      typeof candidate.parseAdminRoute === "function" &&
      typeof candidate.buildAdminBrowserPath === "function" &&
      typeof candidate.listAdminOrganizations === "function" &&
      typeof candidate.resolveAdminOrganization === "function" &&
      typeof candidate.parseSafeAdminReturnParam === "function" &&
      typeof candidate.buildAdminAuthAuthorizeUrl === "function" &&
      typeof candidate.parseRepoSlug === "function" &&
      typeof candidate.buildSignupHandoffUrl === "function" &&
      typeof candidate.validateSessionRecord === "function" &&
      typeof candidate.hasHostileFragmentTokens === "function" &&
      typeof candidate.listVerifiedProviders === "function" &&
      typeof candidate.hasVerifiedProvider === "function" &&
      typeof candidate.discoverRuntimeConfig === "function" &&
      typeof candidate.randomSecret === "function" &&
      typeof candidate.sha256Base64Url === "function"
    );
  }

  function isValidProfile(p, flowApi) {
    if (!p || typeof p !== "object" || Array.isArray(p) || !hasCompatibleFlow(flowApi)) return false;
    if (p.contractVersion !== undefined && p.contractVersion !== flowApi.CONTRACT_VERSION) return false;
    if (!flowApi.isTrustedApiOrigin(p.projectOrigin) || !flowApi.isTrustedApiOrigin(p.apiOrigin)) return false;
    if (!flowApi.isTrustedAuthUrl(p.authBaseUrl)) return false;
    return typeof p.publishableKey === "string" && p.publishableKey.length > 0;
  }

  function createAdminController(deps) {
    var d = deps || {};
    var flow = Object.prototype.hasOwnProperty.call(d, "flow") ? d.flow : root.DecapodCloudFlow;
    var doc = d.document || root.document;
    var winLocation = d.location || root.location;
    var winHistory = d.history || (typeof history !== "undefined" ? history : null);
    var storage = d.sessionStorage || (typeof sessionStorage !== "undefined" ? sessionStorage : null);
    var fetchFn = d.fetch || (typeof fetch !== "undefined" ? fetch.bind(root) : null);
    var navigateFn = d.navigateFn || function (url) { winLocation.assign(url); };
    var nowSec = d.nowSec || function () { return Math.floor(Date.now() / 1000); };

    var flowOk = hasCompatibleFlow(flow);
    var profile = d.initialProfile ? (isValidProfile(d.initialProfile, flow) ? d.initialProfile : null) : null;
    var invalidInitialProfile = Boolean(d.initialProfile && !profile);
    var skewBlocked = !flowOk || invalidInitialProfile;
    var skewReason = !flowOk ? "incompatible_cloud_flow" : (invalidInitialProfile ? "untrusted_profile" : null);
    var session = null;
    var currentUser = null;
    var accountSnapshot = null;
    var inMemoryProviderToken = null;
    var pendingStepupProvider = null;

    var routeMode = "query";
    var requestedOrgLocator = null;
    var activeOrg = null;
    var adminOrgs = [];
    var orgProjects = [];
    var projectStates = new Map();
    var lastCapacities = [];
    var billingReady = false;
    var pendingBillingOrder = null;

    var sessionEpoch = 0;
    var renderGeneration = 0;
    var devicesGeneration = 0;
    var sessionAbortController = null;
    var orgAbortController = null;
    var busy = false;
    var pendingActions = new Map();

    var memberCursor = null;
    var billingMemberCursor = null;
    var invitationCursor = null;
    var createdInvitation = null;
    var limitsSnapshot = null;
    var enrollRequestId = null;
    var enrollRepoSlug = null;
    var adminRevision = 0;
    var exportedTemplate = null;
    var recoveryRevision = 0;
    var recoveryContact = null;
    var coherenceChannel = flowOk
      ? flow.createCoherenceChannel({
          BroadcastChannel: d.broadcastChannel,
          onSkew: function () {
            skewBlocked = true;
            skewReason = "multi_tab_release_skew";
            handleExpiredOrRevokedSession("A newer release of Decapod Cloud is active in another tab. Reload this page to continue safely.", false);
          },
          onAuthInvalidated: function (msg) {
            if (msg && msg.projectOrigin && profile && msg.projectOrigin !== profile.projectOrigin) return;
            handleExpiredOrRevokedSession("Signed out in another tab. Authenticate again to administer organizations.", false);
          }
        })
      : { announceReady: function () {}, broadcastAuthInvalidated: function () {}, close: function () {} };

    function byId(id) {
      return doc.getElementById(id);
    }

    function siteOrigin() {
      if (flowOk && winLocation && flow.isAllowedSiteOrigin(winLocation.origin)) {
        return winLocation.origin;
      }
      return flowOk ? flow.CANONICAL_SITE_ORIGIN : "https://decapodlabs.ai";
    }

    function namespace() {
      var proj = profile ? profile.projectOrigin : (flowOk ? flow.FALLBACK_CLOUD_ORIGIN : "https://goyxpcmxetztjlrrcwew.supabase.co");
      return "decapod-portal:" + proj + ":";
    }

    function storeGet(key, limit) {
      if (!storage) return null;
      var raw = storage.getItem(namespace() + key);
      if (raw === null || raw.length > (limit || 24576)) return null;
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
      var el = byId("admin-status");
      if (!el) return;
      el.textContent = text;
      el.classList.toggle("is-error", Boolean(isError));
    }

    function setBanner(kind, title, note) {
      var banner = byId("admin-route-banner");
      var titleEl = byId("admin-route-banner-title");
      var noteEl = byId("admin-route-banner-note");
      if (!banner || !titleEl || !noteEl) return;
      if (!kind) {
        banner.hidden = true;
        titleEl.textContent = "";
        noteEl.textContent = "";
        return;
      }
      banner.classList.toggle("is-invalid", kind === "invalid");
      titleEl.textContent = title;
      noteEl.textContent = note;
      banner.hidden = false;
    }

    function makeRequestId() {
      return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : flow.randomSecret();
    }

    function formatSupportRef(err, fallbackId) {
      var ref = (err && typeof err.correlationId === "string" && err.correlationId) ||
        (typeof fallbackId === "string" && fallbackId ? fallbackId : null);
      return ref ? "Support ref: " + ref : "";
    }

    function createAbortError() {
      var err = new Error("aborted");
      err.name = "AbortError";
      return err;
    }

    function resetSessionAbortController() {
      if (sessionAbortController) {
        try { sessionAbortController.abort(); } catch (_) {}
      }
      sessionAbortController = typeof AbortController === "function" ? new AbortController() : null;
      return sessionAbortController;
    }

    function resetOrgAbortController() {
      if (orgAbortController) {
        try { orgAbortController.abort(); } catch (_) {}
      }
      orgAbortController = typeof AbortController === "function" ? new AbortController() : null;
      return orgAbortController;
    }

    function abortAllInFlight() {
      if (orgAbortController) {
        try { orgAbortController.abort(); } catch (_) {}
        orgAbortController = null;
      }
      if (sessionAbortController) {
        try { sessionAbortController.abort(); } catch (_) {}
        sessionAbortController = null;
      }
    }

    function createLinkedSignal(timeoutMs, parentSignal) {
      var timeoutSig = typeof AbortSignal !== "undefined" && AbortSignal.timeout ? AbortSignal.timeout(timeoutMs) : null;
      if (!parentSignal) return { signal: timeoutSig, cleanup: function () {} };
      if (!timeoutSig) return { signal: parentSignal, cleanup: function () {} };
      if (typeof AbortSignal !== "undefined" && typeof AbortSignal.any === "function") {
        return { signal: AbortSignal.any([timeoutSig, parentSignal]), cleanup: function () {} };
      }
      if (typeof AbortController !== "function") return { signal: parentSignal, cleanup: function () {} };
      var ctrl = new AbortController();
      function onAbort() {
        try { ctrl.abort(); } catch (_) {}
      }
      if (parentSignal.aborted || timeoutSig.aborted) {
        onAbort();
        return { signal: ctrl.signal, cleanup: function () {} };
      }
      parentSignal.addEventListener("abort", onAbort, { once: true });
      timeoutSig.addEventListener("abort", onAbort, { once: true });
      return {
        signal: ctrl.signal,
        cleanup: function () {
          try { parentSignal.removeEventListener("abort", onAbort); } catch (_) {}
          try { timeoutSig.removeEventListener("abort", onAbort); } catch (_) {}
        }
      };
    }

    function isAdminRevocationError(error) {
      return Boolean(error && (
        error.status === 403 ||
        error.message === "admin_required" ||
        error.message === "organization_access_denied" ||
        error.message === "admin_revoked" ||
        error.message === "forbidden"
      ));
    }

    function isRevisionConflictError(error) {
      return Boolean(error && (
        error.status === 409 ||
        error.message === "revision_conflict" ||
        error.message === "conflict" ||
        error.message === "stale_revision"
      ));
    }

    function isActiveContext(ctx) {
      return Boolean(
        ctx &&
        !skewBlocked &&
        ctx.sessionEpoch === sessionEpoch &&
        ctx.generation === renderGeneration &&
        (!ctx.signal || !ctx.signal.aborted) &&
        activeOrg &&
        ctx.cloudOrgId === activeOrg.cloud_org_id &&
        currentUser &&
        ctx.actor === currentUser.id &&
        session &&
        ctx.bearer === session.access_token &&
        profile &&
        flow.validateSessionRecord(session, profile.projectOrigin, nowSec())
      );
    }

    function clearWorkspaceUi() {
      orgProjects = [];
      projectStates = new Map();
      lastCapacities = [];
      billingReady = false;
      pendingBillingOrder = null;
      memberCursor = null;
      billingMemberCursor = null;
      invitationCursor = null;
      createdInvitation = null;
      limitsSnapshot = null;
      enrollRequestId = null;
      enrollRepoSlug = null;
      adminRevision = 0;
      exportedTemplate = null;
      recoveryRevision = 0;
      recoveryContact = null;

      var clearTextIds = [
        "admin-active-org-uuid", "admin-active-org-slug", "admin-active-org-provider",
        "admin-orthogonality-summary", "admin-route-mode-note", "admin-enroll-status",
        "admin-project-settings-status", "admin-seat-assign-status", "admin-members-status",
        "admin-invitations-status", "admin-delegation-meta", "admin-delegation-status",
        "admin-template-status", "admin-overage-status",
        "admin-overage-receipt", "admin-overage-save-status", "admin-limit-save-status",
        "admin-billing-status", "admin-pending-order-summary", "admin-billing-detail",
        "admin-devices-status", "admin-recovery-contact-summary", "admin-recovery-status"
      ];
      for (var i = 0; i < clearTextIds.length; i++) {
        var tEl = byId(clearTextIds[i]);
        if (tEl) tEl.textContent = "";
      }

      var clearListIds = [
        "admin-repos-list", "admin-members-list", "admin-invitations-list",
        "admin-delegation-list", "admin-delegation-invites-list", "admin-template-audit-list",
        "admin-template-source-project", "admin-template-target-org",
        "admin-overage-ledger-list", "admin-resource-cards",
        "admin-resource-alerts", "admin-devices-list",
        "admin-settings-project-select", "admin-assign-project-select",
        "admin-assign-member-select", "admin-limit-metric"
      ];
      for (var j = 0; j < clearListIds.length; j++) {
        var lEl = byId(clearListIds[j]);
        if (lEl) lEl.replaceChildren();
      }

      var clearInputIds = [
        "admin-enroll-repo-input", "admin-settings-project-name", "admin-invite-recipient",
        "admin-delegate-account", "admin-template-target-project", "admin-recovery-contact-input",
        "admin-overage-cap-usd", "admin-limit-cap"
      ];
      for (var ii = 0; ii < clearInputIds.length; ii++) {
        var inp = byId(clearInputIds[ii]);
        if (inp) inp.value = "";
      }
      var termsCheck = byId("admin-overage-terms-check");
      if (termsCheck) termsCheck.checked = false;

      var invBox = byId("admin-invitation-copy-box");
      if (invBox) invBox.hidden = true;
      var invLink = byId("admin-invitation-link");
      if (invLink) invLink.value = "";
      var pendingOrderBox = byId("admin-pending-order-box");
      if (pendingOrderBox) pendingOrderBox.hidden = true;
      var reposEmpty = byId("admin-repos-empty");
      if (reposEmpty) reposEmpty.hidden = true;
      var workspace = byId("admin-workspace");
      if (workspace) workspace.hidden = true;
    }

    function hideAllProtectedPanels() {
      var ids = [
        "admin-account-bar", "admin-identity-panel",
        "admin-denied-panel", "admin-workspace"
      ];
      for (var i = 0; i < ids.length; i++) {
        var el = byId(ids[i]);
        if (el) el.hidden = true;
      }
      clearWorkspaceUi();
    }

    function clearAllSessionState(bumpEpoch) {
      if (bumpEpoch) {
        sessionEpoch++;
        abortAllInFlight();
      }
      renderGeneration++;
      devicesGeneration++;
      busy = false;
      pendingActions.clear();
      activeOrg = null;
      adminOrgs = [];
      currentUser = null;
      accountSnapshot = null;
      inMemoryProviderToken = null;
      pendingStepupProvider = null;
      enrollRequestId = null;
      enrollRepoSlug = null;
      hideAllProtectedPanels();
      var summary = byId("admin-account-summary");
      if (summary) summary.textContent = "";
      var orgSelect = byId("admin-org-select");
      if (orgSelect) orgSelect.replaceChildren();
      var orgBadge = byId("admin-org-uuid-badge");
      if (orgBadge) orgBadge.textContent = "";
      var switcherWrap = byId("admin-org-switcher-wrap");
      if (switcherWrap) switcherWrap.hidden = true;
    }

    function syncAuthGateUi() {
      var signedIn = Boolean(
        !skewBlocked &&
        flowOk &&
        profile &&
        flow.validateSessionRecord(session, profile.projectOrigin, nowSec())
      );
      var authGate = byId("admin-auth-gate");
      if (authGate) authGate.hidden = signedIn;
      var cancelBtn = byId("admin-cancel-auth-btn");
      if (cancelBtn) cancelBtn.hidden = skewBlocked || !storeGet("flow", 8192);
      if (!signedIn) {
        clearAllSessionState(false);
      }
      var providers = profile ? profile.authProviders : { github: true, google: false };
      var ghBtn = byId("admin-auth-github");
      var googleBtn = byId("admin-auth-google");
      if (ghBtn) ghBtn.disabled = skewBlocked || busy || !providers.github;
      if (googleBtn) googleBtn.disabled = skewBlocked || busy || !providers.google;
      var noteEl = byId("admin-auth-provider-note");
      if (noteEl) {
        if (skewBlocked) {
          noteEl.textContent = "Client asset version skew detected. Reload the page before signing in.";
        } else {
          var disabled = [];
          if (!providers.github) disabled.push("GitHub");
          if (!providers.google) disabled.push("Google");
          noteEl.textContent = disabled.length
            ? "Currently disabled on this deployment: " + disabled.join(", ") + "."
            : "Sign in with GitHub or Google via PKCE.";
        }
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
        if (!response.ok) {
          if (response.status === 429) return { error: { code: "rate_limited" } };
          if (response.status === 403) return { error: { code: "forbidden" } };
          return { error: { code: "service_unavailable" } };
        }
        throw new Error("invalid_response");
      }
    }

    async function apiRequest(url, body, bearer, method, reqOptions) {
      if (skewBlocked || !flowOk) throw new Error("client_version_skew");
      if (!profile || !isValidProfile(profile, flow)) throw new Error("service_unavailable");
      var opts = reqOptions || {};
      var expectedSessionEpoch = typeof opts.sessionEpoch === "number" ? opts.sessionEpoch : sessionEpoch;
      var parentSignal = opts.signal || (sessionAbortController ? sessionAbortController.signal : null);
      if ((parentSignal && parentSignal.aborted) || expectedSessionEpoch !== sessionEpoch) {
        throw createAbortError();
      }
      var parsed = new URL(url);
      if (!flow.isTrustedApiOrigin(parsed.origin)) throw new Error("untrusted_api_origin");
      var headers = { apikey: profile.publishableKey };
      if (body !== undefined) headers["Content-Type"] = "application/json";
      if (bearer) headers.Authorization = "Bearer " + bearer;
      var fallbackCorr = (body && typeof body.request_id === "string" && body.request_id) ? body.request_id : makeRequestId();
      var linked = createLinkedSignal(15000, parentSignal);
      var response;
      try {
        response = await fetchFn(url, {
          method: method || (body === undefined ? "GET" : "POST"),
          redirect: "error",
          credentials: "omit",
          cache: "no-store",
          signal: linked.signal || undefined,
          headers: headers,
          body: body === undefined ? undefined : JSON.stringify(body)
        });
      } catch (netErr) {
        if ((parentSignal && parentSignal.aborted) || expectedSessionEpoch !== sessionEpoch) {
          throw createAbortError();
        }
        var isTimeout = Boolean(netErr && (netErr.name === "TimeoutError" || netErr.name === "AbortError"));
        var wrappedNet = new Error(isTimeout ? "request_timeout" : "service_unavailable");
        wrappedNet.status = isTimeout ? 504 : 503;
        wrappedNet.correlationId = typeof flow.extractCorrelationRef === "function"
          ? flow.extractCorrelationRef(null, null, fallbackCorr)
          : fallbackCorr;
        throw wrappedNet;
      } finally {
        linked.cleanup();
      }
      if ((parentSignal && parentSignal.aborted) || expectedSessionEpoch !== sessionEpoch) {
        if (response && response.body && typeof response.body.cancel === "function") {
          await response.body.cancel().catch(function () {});
        }
        throw createAbortError();
      }
      var contractHeader = response.headers && typeof response.headers.get === "function"
        ? response.headers.get("decapod-cloud-contract-version")
        : null;
      if (!flow.isSupportedApiContractVersion(contractHeader)) {
        if (response.body && typeof response.body.cancel === "function") await response.body.cancel().catch(function () {});
        skewBlocked = true;
        skewReason = "api_contract_mismatch";
        handleExpiredOrRevokedSession("API contract version mismatch. Reload this page to continue safely.", false);
        throw new Error("contract_version_mismatch");
      }
      var data = await boundedJson(response);
      if ((parentSignal && parentSignal.aborted) || expectedSessionEpoch !== sessionEpoch) {
        throw createAbortError();
      }
      if (data && typeof data === "object" && !Array.isArray(data) &&
          data.version !== undefined && data.version !== flow.CONTRACT_VERSION) {
        skewBlocked = true;
        skewReason = "api_payload_version_mismatch";
        handleExpiredOrRevokedSession("API payload version mismatch. Reload this page to continue safely.", false);
        throw new Error("contract_version_mismatch");
      }
      if (!response.ok) {
        var errCode = data && ((data.error && data.error.code) || data.error_code || data.code) ||
          (response.status === 429 ? "rate_limited" : response.status === 403 ? "forbidden" : response.status >= 500 ? "service_unavailable" : "request_failed");
        if ((response.status === 401 || errCode === "invalid_token") && expectedSessionEpoch === sessionEpoch) {
          handleExpiredOrRevokedSession(null, true);
        }
        var retryAfterSec = typeof flow.parseRetryAfterSeconds === "function"
          ? flow.parseRetryAfterSeconds(response.headers && typeof response.headers.get === "function" ? response.headers.get("retry-after") : null)
          : null;
        var err = new Error(errCode);
        err.status = response.status;
        err.payload = data;
        err.correlationId = typeof flow.extractCorrelationRef === "function"
          ? flow.extractCorrelationRef(response, data, fallbackCorr)
          : fallbackCorr;
        if (retryAfterSec !== null) {
          err.retryAfterSec = retryAfterSec;
          err.retryAfterMs = retryAfterSec * 1000;
        }
        throw err;
      }
      return data;
    }

    function handleExpiredOrRevokedSession(customStatus, broadcast) {
      session = null;
      storeRemove("session");
      storeRemove("flow");
      clearAllSessionState(true);
      syncAuthGateUi();
      if (broadcast !== false && flowOk && profile) {
        coherenceChannel.broadcastAuthInvalidated(profile.projectOrigin);
      }
      setStatus(customStatus || "Your session expired or was revoked. Authenticate again to administer organizations.", true);
    }

    function handleOrgAccessRevoked(ctx, errorCode) {
      if (!ctx || ctx.sessionEpoch !== sessionEpoch) return;
      adminOrgs = adminOrgs.filter(function (o) { return o.cloud_org_id !== ctx.cloudOrgId; });
      if (orgAbortController) {
        try { orgAbortController.abort(); } catch (_) {}
        orgAbortController = null;
      }
      devicesGeneration++;
      showDeniedPanel(
        "ADMIN REVOKED",
        "Administrator authorization required",
        "Your administrator grant for this organization is no longer active.",
        "Refresh or contact an existing organization administrator.",
        adminOrgs.length > 0
      );
      setStatus("Administrator grant revoked or unavailable (" + (errorCode || "admin_required") + ").", true);
    }

    function requireToken() {
      if (skewBlocked || !flowOk || !profile || !flow.validateSessionRecord(session, profile.projectOrigin, nowSec())) {
        throw new Error("sign_in_required");
      }
      return session.access_token;
    }

    async function edgePost(action, body, reqOptions) {
      var bearer = requireToken();
      return await apiRequest(
        profile.onboardingPrefix + "/" + action,
        Object.assign({ version: 1 }, body || {}),
        bearer,
        "POST",
        reqOptions
      );
    }

    async function fetchUser(bearer, reqOptions) {
      var u = await apiRequest(profile.projectOrigin + "/auth/v1/user", undefined, bearer, "GET", reqOptions);
      if (!u || !flow.UUID_PATTERN.test(u.id || "") || !Array.isArray(u.identities) || u.identities.length > 100) {
        throw new Error("invalid_response");
      }
      return u;
    }

    async function beginAuth(provider, kind, repoVerification) {
      if (skewBlocked || !flowOk) throw new Error("client_version_skew");
      if (!profile) throw new Error("service_unavailable");
      if (busy) throw new Error("auth_pending");
      if (!["github", "google"].includes(provider)) throw new Error("invalid_provider");
      if (kind === "sign_in" && profile.authProviders && profile.authProviders[provider] === false) {
        throw new Error("provider_disabled");
      }

      busy = true;
      syncAuthGateUi();
      try {
        var verifier = flow.randomSecret();
        var nonce = flow.randomSecret();
        var challenge = await flow.sha256Base64Url(verifier);
        var origin = siteOrigin();
        var returnTarget = new URL(origin + "/admin/");
        returnTarget.searchParams.set("login_nonce", nonce);

        var flowRecord = {
          version: 1,
          contract_version: flow.CONTRACT_VERSION,
          kind: kind,
          provider: provider,
          verifier: verifier,
          nonce: nonce,
          expires: nowSec() + 900,
          phase: "pending",
          project: profile.projectOrigin,
          returnURL: origin + "/admin/",
          requested_org: requestedOrgLocator,
          route_mode: routeMode
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
        var authUrl = flow.buildAdminAuthAuthorizeUrl({
          authBaseUrl: profile.authBaseUrl,
          provider: provider,
          returnTo: returnTarget.href,
          codeChallenge: challenge,
          expectedOrigin: origin
        });
        navigateFn(authUrl);
      } finally {
        busy = false;
        syncAuthGateUi();
      }
    }

    function renderAccountBar() {
      var bar = byId("admin-account-bar");
      var summary = byId("admin-account-summary");
      var switcherWrap = byId("admin-org-switcher-wrap");
      var orgSelect = byId("admin-org-select");
      var badge = byId("admin-org-uuid-badge");
      if (!bar || !summary || !currentUser) return;
      var providers = flow.listVerifiedProviders(currentUser).map(function (p) {
        return p === "github" ? "GitHub" : p === "google" ? "Google" : p;
      });
      summary.textContent = "Account " + currentUser.id +
        (providers.length ? " · Linked: " + providers.join(", ") : " · No code host linked");

      if (orgSelect) {
        orgSelect.replaceChildren();
        for (var i = 0; i < adminOrgs.length; i++) {
          var orgItem = adminOrgs[i];
          var opt = doc.createElement("option");
          opt.value = orgItem.cloud_org_id;
          var labelSlug = orgItem.scm_owner_slug || orgItem.id;
          opt.textContent = labelSlug + " (" + orgItem.cloud_org_id.slice(0, 8) + "…)";
          orgSelect.appendChild(opt);
        }
        if (activeOrg && adminOrgs.some(function (o) { return o.cloud_org_id === activeOrg.cloud_org_id; })) {
          orgSelect.value = activeOrg.cloud_org_id;
        }
      }
      if (switcherWrap) {
        switcherWrap.hidden = adminOrgs.length === 0;
      }
      if (badge) {
        badge.textContent = activeOrg ? ("Org UUID: " + activeOrg.cloud_org_id) : "";
      }
      bar.hidden = false;
    }

    function showIdentityPanel(mode, pendingProvider) {
      hideAllProtectedPanels();
      renderAccountBar();
      var panel = byId("admin-identity-panel");
      var heading = byId("admin-identity-heading");
      var msg = byId("admin-identity-message");
      var linkActions = byId("admin-identity-link-actions");
      var qActions = byId("admin-identity-quarantine-actions");
      if (!panel) return;
      if (mode === "quarantine") {
        pendingStepupProvider = pendingProvider || null;
        heading.textContent = "Confirm attached sign-in provider";
        msg.textContent = "An unconfirmed provider attachment (" + (pendingStepupProvider || "provider") +
          ") requires explicit confirmation or revocation before organization administration continues.";
        if (linkActions) linkActions.hidden = true;
        if (qActions) qActions.hidden = false;
        setStatus("Step-up verification required before entering organization administration.", true);
      } else {
        pendingStepupProvider = null;
        heading.textContent = "Link your GitHub identity";
        msg.textContent = "A verified GitHub identity is required for organization administration actions.";
        if (linkActions) linkActions.hidden = false;
        if (qActions) qActions.hidden = true;
        setStatus("Link a verified GitHub account to access organization administration.", false);
      }
      panel.hidden = false;
    }

    function showDeniedPanel(kicker, heading, message, detail, allowSwitchToAdminOrg) {
      renderGeneration++;
      activeOrg = null;
      hideAllProtectedPanels();
      if (currentUser) renderAccountBar();
      var panel = byId("admin-denied-panel");
      if (!panel) return;
      byId("admin-denied-kicker").textContent = kicker;
      byId("admin-denied-heading").textContent = heading;
      byId("admin-denied-message").textContent = message;
      byId("admin-denied-detail").textContent = detail || "";
      var switchBtn = byId("admin-open-authorized-org-btn");
      if (switchBtn) {
        switchBtn.hidden = !(allowSwitchToAdminOrg && adminOrgs.length > 0);
      }
      panel.hidden = false;
    }

    function syncUrlForOrg(orgObj) {
      if (!winHistory || typeof winHistory.replaceState !== "function") return;
      var slug = orgObj ? (orgObj.scm_owner_slug || orgObj.cloud_org_id) : null;
      var nextPath = flow.buildAdminBrowserPath(
        routeMode === "path" && slug ? "/admin/" + slug : "/admin/",
        slug
      );
      winHistory.replaceState(null, "", nextPath);
    }

    function formatCents(cents) {
      return "$" + (Number(cents || 0) / 100).toFixed(2);
    }

    function formatMetricValue(val, unit) {
      if (val === null || val === undefined) return "Default ceiling";
      if (unit === "bytes") {
        if (val >= 1099511627776) return (val / 1099511627776).toFixed(2) + " TiB";
        if (val >= 1073741824) return (val / 1073741824).toFixed(2) + " GiB";
        if (val >= 1048576) return (val / 1048576).toFixed(2) + " MiB";
        if (val >= 1024) return (val / 1024).toFixed(2) + " KiB";
        return val + " B";
      }
      return String(val) + (unit ? " " + unit : "");
    }

    function formatDeviceDate(value) {
      if (typeof value !== "string" || value.length > 64 || !Number.isFinite(Date.parse(value))) {
        throw new Error("invalid_response");
      }
      return new Date(value).toISOString().replace("T", " ").slice(0, 19) + " UTC";
    }

    function renderOrgContextSummary() {
      if (!activeOrg) return;
      var uuidEl = byId("admin-active-org-uuid");
      var slugEl = byId("admin-active-org-slug");
      var provEl = byId("admin-active-org-provider");
      var orthoEl = byId("admin-orthogonality-summary");
      var modeNoteEl = byId("admin-route-mode-note");
      if (uuidEl) uuidEl.textContent = activeOrg.cloud_org_id;
      if (slugEl) slugEl.textContent = activeOrg.scm_owner_slug || activeOrg.id;
      if (provEl) provEl.textContent = activeOrg.scm_provider ? activeOrg.scm_provider.toUpperCase() : "MANAGED";

      var assignedCount = 0;
      for (var i = 0; i < orgProjects.length; i++) {
        var st = projectStates.get(orgProjects[i].project_id);
        if (st && (st.repo_assigned === true || st.backend_authorized === true)) assignedCount++;
      }
      if (orthoEl) {
        orthoEl.textContent = assignedCount === 0
          ? "0 paid repo seats held · Admin works orthogonally with zero repo task/event/evidence access"
          : assignedCount + " of " + orgProjects.length + " repositories explicitly assigned · Unassigned repo data stays denied";
      }
      if (modeNoteEl) {
        var slugLabel = activeOrg.scm_owner_slug || activeOrg.cloud_org_id;
        modeNoteEl.textContent = routeMode === "path"
          ? "Active route: /admin/" + slugLabel + " (resolved to immutable Cloud Org UUID " + activeOrg.cloud_org_id + ")."
          : "GitHub Pages static-safe route: /admin/?org=" + encodeURIComponent(slugLabel) +
            " (clean subpath /admin/" + slugLabel + " resolves identically when edge subpath routing is active).";
      }
    }

    function renderRepositoriesSection() {
      var tbody = byId("admin-repos-list");
      var emptyNote = byId("admin-repos-empty");
      var settingsSelect = byId("admin-settings-project-select");
      var settingsName = byId("admin-settings-project-name");
      var assignSelect = byId("admin-assign-project-select");
      if (!tbody) return;

      tbody.replaceChildren();
      if (settingsSelect) settingsSelect.replaceChildren();
      if (assignSelect) assignSelect.replaceChildren();
      if (emptyNote) emptyNote.hidden = orgProjects.length > 0;

      for (var i = 0; i < orgProjects.length; i++) {
        var proj = orgProjects[i];
        var st = projectStates.get(proj.project_id) || {};
        var capEntry = lastCapacities.find(function (c) { return c.project_id === proj.project_id; });
        var capLabel = billingReady && capEntry
          ? (String(capEntry.assigned || 0) + " / " + String(capEntry.capacity || 0) + " seats")
          : (billingReady ? "0 / 0 seats" : "Billing disabled");
        var dataAccessLabel = st.backend_authorized === true
          ? "Assigned seat (repo access active)"
          : "No repo seat (governance data denied)";

        var tr = doc.createElement("tr");
        var tdName = doc.createElement("td");
        tdName.textContent = proj.name || proj.project_id;
        var tdId = doc.createElement("td");
        tdId.textContent = proj.project_id;
        var tdCap = doc.createElement("td");
        tdCap.textContent = capLabel;
        var tdAccess = doc.createElement("td");
        tdAccess.textContent = dataAccessLabel;
        tr.appendChild(tdName);
        tr.appendChild(tdId);
        tr.appendChild(tdCap);
        tr.appendChild(tdAccess);
        tbody.appendChild(tr);

        if (settingsSelect) {
          var sOpt = doc.createElement("option");
          sOpt.value = proj.project_id;
          sOpt.textContent = (proj.name || proj.project_id) + " (" + proj.project_id + ")";
          settingsSelect.appendChild(sOpt);
        }
        if (assignSelect) {
          var aOpt = doc.createElement("option");
          aOpt.value = proj.project_id;
          aOpt.textContent = proj.name || proj.project_id;
          assignSelect.appendChild(aOpt);
        }
      }
      if (settingsName) {
        var selectedProj = orgProjects.find(function (p) {
          return settingsSelect && p.project_id === settingsSelect.value;
        }) || orgProjects[0];
        settingsName.value = selectedProj ? (selectedProj.name || "") : "";
      }
      renderOrgContextSummary();
    }

    function syncActionStates() {
      var isBusy = Boolean(activeOrg && pendingActions.has(activeOrg.cloud_org_id));
      var allowed = Boolean(activeOrg && profile && flow.validateSessionRecord(session, profile.projectOrigin, nowSec()));
      var hasRepos = orgProjects.length > 0;

      var alwaysAdminIds = [
        "admin-enroll-repo-btn", "admin-refresh-members-btn", "admin-invite-btn",
        "admin-refresh-invitations-btn", "admin-grant-admin-btn", "admin-invite-admin-btn",
        "admin-revoke-admin-btn", "admin-transfer-owner-btn", "admin-overages-enable-btn",
        "admin-overages-update-btn", "admin-overages-revoke-btn", "admin-save-limit-btn",
        "admin-reset-limit-btn", "admin-refresh-limits-btn", "admin-refresh-devices-btn",
        "admin-set-recovery-contact-btn", "admin-clear-recovery-contact-btn", "admin-refresh-recovery-btn"
      ];
      for (var i = 0; i < alwaysAdminIds.length; i++) {
        var el = byId(alwaysAdminIds[i]);
        if (el) el.disabled = !allowed || isBusy;
      }

      var hasDestOrgs = adminOrgs.some(function (o) { return activeOrg && o.cloud_org_id !== activeOrg.cloud_org_id; });
      var exportBtn = byId("admin-export-template-btn");
      var previewBtn = byId("admin-preview-template-btn");
      var importBtn = byId("admin-import-template-btn");
      if (exportBtn) exportBtn.disabled = !allowed || isBusy || !hasRepos || !hasDestOrgs;
      if (previewBtn) previewBtn.disabled = !allowed || isBusy || !exportedTemplate;
      if (importBtn) importBtn.disabled = !allowed || isBusy || !exportedTemplate;

      var repoControlIds = ["admin-settings-project-select", "admin-settings-project-name", "admin-save-project-btn"];
      for (var j = 0; j < repoControlIds.length; j++) {
        var rEl = byId(repoControlIds[j]);
        if (rEl) rEl.disabled = !allowed || isBusy || !hasRepos;
      }

      var billingIds = [
        "admin-assign-seat-btn", "admin-revoke-seat-btn", "admin-more-billing-members-btn",
        "admin-billing-portal-btn", "admin-cancel-order-btn"
      ];
      for (var k = 0; k < billingIds.length; k++) {
        var bEl = byId(billingIds[k]);
        if (bEl) bEl.disabled = !allowed || !billingReady || isBusy;
      }
    }

    function withOrgLock(fn) {
      return async function () {
        if (!activeOrg || !currentUser || !session) throw new Error("admin_required");
        var ctx = {
          sessionEpoch: sessionEpoch,
          generation: renderGeneration,
          signal: orgAbortController ? orgAbortController.signal : null,
          cloudOrgId: activeOrg.cloud_org_id,
          orgId: activeOrg.id,
          actor: currentUser.id,
          bearer: session.access_token
        };
        if (pendingActions.has(ctx.cloudOrgId)) return;
        pendingActions.set(ctx.cloudOrgId, ctx);
        syncActionStates();
        try {
          await fn(ctx);
        } catch (error) {
          if (error && error.name === "AbortError") return;
          if (error && (error.status === 401 || error.message === "invalid_token" || error.message === "sign_in_required")) {
            if (ctx.sessionEpoch === sessionEpoch && session) {
              handleExpiredOrRevokedSession(null, true);
            }
            return;
          }
          if (ctx.sessionEpoch !== sessionEpoch || !activeOrg || ctx.cloudOrgId !== activeOrg.cloud_org_id || ctx.generation !== renderGeneration) {
            return;
          }
          if (isAdminRevocationError(error)) {
            handleOrgAccessRevoked(ctx, error.message);
            return;
          }
          var actionRef = formatSupportRef(error, ctx.cloudOrgId);
          var actionWait = error && Number.isSafeInteger(error.retryAfterSec) && error.retryAfterSec > 0
            ? " Wait " + error.retryAfterSec + "s before retrying."
            : "";
          setStatus("Action failed (" + (error && error.message ? error.message : "error") + ")." + actionWait + (actionRef ? " " + actionRef + "." : ""), true);
        } finally {
          if (pendingActions.get(ctx.cloudOrgId) === ctx) {
            pendingActions.delete(ctx.cloudOrgId);
          }
          syncActionStates();
        }
      };
    }

    function orgReqOpts(ctx) {
      return { sessionEpoch: ctx.sessionEpoch, signal: ctx.signal };
    }

    function renderResourceLimits(ctx, snap) {
      if (!isActiveContext(ctx)) return;
      limitsSnapshot = snap;
      var ovg = snap.paid_overages || {};
      var capCents = ovg.monthly_spend_cap_cents !== undefined ? ovg.monthly_spend_cap_cents : ovg.spending_ceiling_cents;
      var active = Boolean(ovg.opted_in !== undefined ? ovg.opted_in : ovg.enabled);
      var capStatus = "";
      if (ovg.cap_exhausted || ovg.spend_cap_status === "overage_cap_exhausted") {
        capStatus = "CAP EXHAUSTED (100%) — billable overage admission halted; ";
      } else if (ovg.spend_cap_status === "warning") {
        capStatus = "80%+ SPEND CAP WARNING; ";
      }

      var overageStatusEl = byId("admin-overage-status");
      if (overageStatusEl) {
        var utilText = Number.isFinite(ovg.spend_utilization_pct)
          ? ", utilization " + String(ovg.spend_utilization_pct) + "%"
          : "";
        var warnThresholdText = Number.isSafeInteger(ovg.warning_threshold_cents)
          ? ", warning at " + formatCents(ovg.warning_threshold_cents)
          : "";
        overageStatusEl.textContent = active
          ? "Paid resource overages: ACTIVE (" + capStatus + "cap " + formatCents(capCents) +
            ", spent " + formatCents(ovg.spent_cents) +
            ", remaining " + formatCents(ovg.remaining_spend_cents !== undefined ? ovg.remaining_spend_cents : Math.max((capCents || 0) - (ovg.spent_cents || 0), 0)) +
            utilText + warnThresholdText +
            ", rev " + (ovg.revision || 0) + ")."
          : "Paid resource overages: OFF (default, $0 exposure). Request pressure is strictly protective and never overage-eligible.";
      }

      var enableBtn = byId("admin-overages-enable-btn");
      var updateBtn = byId("admin-overages-update-btn");
      var revokeBtn = byId("admin-overages-revoke-btn");
      if (enableBtn) enableBtn.hidden = active;
      if (updateBtn) updateBtn.hidden = !active;
      if (revokeBtn) revokeBtn.hidden = !active;

      var capInput = byId("admin-overage-cap-usd");
      if (capInput && capCents && !capInput.value) capInput.value = (capCents / 100).toFixed(2);

      var receiptEl = byId("admin-overage-receipt");
      if (receiptEl) {
        receiptEl.textContent = ovg.consent_receipt_id
          ? "Latest consent receipt: " + ovg.consent_receipt_id + " (" + (ovg.window_month || "") + ")"
          : "";
      }

      var ledgerEl = byId("admin-overage-ledger-list");
      if (ledgerEl) {
        ledgerEl.replaceChildren();
        var ledger = Array.isArray(ovg.ledger) ? ovg.ledger : [];
        for (var i = 0; i < ledger.length; i++) {
          var item = ledger[i];
          var li = doc.createElement("li");
          li.textContent = item.action + " · cap " + formatCents(item.monthly_spend_cap_cents) +
            " · spent " + formatCents(item.spent_cents_at_event) + " · receipt " + item.receipt_id;
          ledgerEl.appendChild(li);
        }
      }

      var cardsEl = byId("admin-resource-cards");
      var metricSelect = byId("admin-limit-metric");
      var list = Array.isArray(snap.metrics) ? snap.metrics : [];
      if (cardsEl) {
        cardsEl.replaceChildren();
        var cats = ["network_transfer", "compute_operations", "retained_data", "request_pressure"];
        for (var c = 0; c < cats.length; c++) {
          var cat = cats[c];
          var items = list.filter(function (x) { return x.category === cat; });
          if (!items.length) continue;
          var card = doc.createElement("section");
          card.className = "admin-resource-card";
          var heading = doc.createElement("h3");
          heading.textContent = CATEGORY_LABELS[cat] || cat;
          var ul = doc.createElement("ul");
          for (var m = 0; m < items.length; m++) {
            var metric = items[m];
            var mLi = doc.createElement("li");
            mLi.textContent = metric.key + ": used " + formatMetricValue(metric.used, metric.unit) +
              " · remaining " + formatMetricValue(metric.remaining, metric.unit) +
              " · cap " + formatMetricValue(metric.effective_limit, metric.unit) +
              " · window " + metric.window + " · alert " + metric.alert_state + " (rev " + metric.revision + ")";
            ul.appendChild(mLi);
          }
          card.appendChild(heading);
          card.appendChild(ul);
          cardsEl.appendChild(card);
        }
      }

      if (metricSelect) {
        var prev = metricSelect.value;
        metricSelect.replaceChildren();
        for (var k = 0; k < list.length; k++) {
          var opt = doc.createElement("option");
          opt.value = String(list[k].metric);
          opt.textContent = list[k].key + " (" + (CATEGORY_LABELS[list[k].category] || list[k].category) + ", " + list[k].window + ")";
          metricSelect.appendChild(opt);
        }
        if (list.length) {
          metricSelect.value = list.some(function (x) { return String(x.metric) === prev; })
            ? prev
            : String(list[0].metric);
        }
        syncLimitInputs();
      }

      var alertsEl = byId("admin-resource-alerts");
      if (alertsEl) {
        alertsEl.replaceChildren();
        var alerts = Array.isArray(snap.alerts) ? snap.alerts : [];
        for (var a = 0; a < alerts.length; a++) {
          (function (alertItem) {
            var aLi = doc.createElement("li");
            var span = doc.createElement("span");
            span.textContent = String(alertItem.level || "info").toUpperCase() + " " +
              alertItem.key + " (" + alertItem.window_key + "): " +
              alertItem.observed_value + " / " + alertItem.effective_limit + " [" + alertItem.state + "]";
            aLi.appendChild(span);
            if (alertItem.state === "pending" || alertItem.state === "dispatched") {
              var btn = doc.createElement("button");
              btn.type = "button";
              btn.textContent = "Dismiss";
              btn.onclick = withOrgLock(async function (activeCtx) {
                var statusSaveEl = byId("admin-limit-save-status");
                try {
                  var updated = await edgePost("resource-limits", {
                    action: "dismiss_alert",
                    organization_id: activeCtx.orgId,
                    alert_id: alertItem.id
                  }, orgReqOpts(activeCtx));
                  if (!isActiveContext(activeCtx)) return;
                  renderResourceLimits(activeCtx, updated);
                } catch (err) {
                  if (!isActiveContext(activeCtx) || isAdminRevocationError(err) || (err && (err.name === "AbortError" || err.status === 401))) throw err;
                  if (isRevisionConflictError(err)) {
                    if (statusSaveEl) statusSaveEl.textContent = "Concurrent revision conflict (409). Refreshing resource limits…";
                    await loadResourceLimits(activeCtx);
                    return;
                  }
                  throw err;
                }
              });
              aLi.appendChild(btn);
            }
            alertsEl.appendChild(aLi);
          })(alerts[a]);
        }
      }
    }

    function syncLimitInputs() {
      var list = limitsSnapshot && Array.isArray(limitsSnapshot.metrics) ? limitsSnapshot.metrics : [];
      var metricSelect = byId("admin-limit-metric");
      var selected = list.find(function (x) { return metricSelect && String(x.metric) === metricSelect.value; }) || list[0];
      var capEl = byId("admin-limit-cap");
      var warnEl = byId("admin-limit-warn");
      var critEl = byId("admin-limit-crit");
      var notifyEl = byId("admin-limit-notify");
      if (!selected) {
        if (capEl) capEl.value = "";
        if (warnEl) warnEl.value = "";
        if (critEl) critEl.value = "";
        if (notifyEl) notifyEl.value = "";
        return;
      }
      if (capEl) capEl.value = selected.operating_limit === null || selected.operating_limit === undefined ? "" : String(selected.operating_limit);
      if (warnEl) warnEl.value = String(selected.warning_pct !== undefined ? selected.warning_pct : 80);
      if (critEl) critEl.value = String(selected.critical_pct !== undefined ? selected.critical_pct : 95);
      if (notifyEl) notifyEl.value = String(selected.notify_flags !== undefined ? selected.notify_flags : 1);
    }

    async function loadResourceLimits(ctx) {
      if (!isActiveContext(ctx)) return;
      try {
        var snap = await edgePost("resource-limits", {
          action: "status",
          organization_id: ctx.orgId
        }, orgReqOpts(ctx));
        if (!isActiveContext(ctx)) return;
        if (!snap || !Array.isArray(snap.metrics)) throw new Error("invalid_response");
        renderResourceLimits(ctx, snap);
      } catch (error) {
        if ((error && error.name === "AbortError") || !isActiveContext(ctx)) return;
        if (isAdminRevocationError(error)) {
          handleOrgAccessRevoked(ctx, error.message);
          return;
        }
        var statusEl = byId("admin-overage-status");
        if (statusEl) statusEl.textContent = "Resource limit telemetry unavailable (" + (error && error.message ? error.message : "error") + ").";
      }
    }

    async function loadMembers(ctx, after) {
      if (!isActiveContext(ctx)) return;
      var statusEl = byId("admin-members-status");
      var listEl = byId("admin-members-list");
      var nextBtn = byId("admin-next-members-btn");
      try {
        var res = await edgePost("account-register", Object.assign({
          operation: "members",
          organization_id: ctx.orgId
        }, after !== undefined ? { after: after } : {}), orgReqOpts(ctx));
        if (!isActiveContext(ctx)) return;
        var entries = Array.isArray(res.members) ? res.members : [];
        memberCursor = res.next !== undefined ? res.next : null;
        if (nextBtn) nextBtn.hidden = memberCursor === null;
        if (listEl) {
          listEl.replaceChildren();
          for (var i = 0; i < entries.length; i++) {
            (function (entry) {
              var li = doc.createElement("li");
              var span = doc.createElement("span");
              var hosts = Array.isArray(entry.providers) && entry.providers.length
                ? entry.providers.join(", ") + " linked"
                : "no code host linked";
              var assigned = Array.isArray(entry.assigned_projects) && entry.assigned_projects.length
                ? "Assigned repos: " + entry.assigned_projects.join(", ")
                : "0 paid repo seats";
              span.textContent = "Seat " + entry.slot + " (" + entry.role + ") · Account " +
                entry.account_id + " · " + hosts + " · " + assigned;
              li.appendChild(span);

              if (entry.role !== "owner" && entry.slot !== 1) {
                var revokeSeatBtn = doc.createElement("button");
                revokeSeatBtn.type = "button";
                revokeSeatBtn.textContent = "Remove seat";
                revokeSeatBtn.onclick = withOrgLock(async function (activeCtx) {
                  await edgePost("account-register", {
                    operation: "revoke_seat",
                    organization_id: activeCtx.orgId,
                    slot: entry.slot,
                    member_account_id: entry.account_id
                  }, orgReqOpts(activeCtx));
                  if (!isActiveContext(activeCtx)) return;
                  await refreshActiveOrganization();
                });
                li.appendChild(revokeSeatBtn);

                var revokeMemBtn = doc.createElement("button");
                revokeMemBtn.type = "button";
                revokeMemBtn.textContent = "Revoke membership";
                revokeMemBtn.onclick = withOrgLock(async function (activeCtx) {
                  await edgePost("account-register", {
                    operation: "revoke_membership",
                    organization_id: activeCtx.orgId,
                    member_account_id: entry.account_id
                  }, orgReqOpts(activeCtx));
                  if (!isActiveContext(activeCtx)) return;
                  await refreshActiveOrganization();
                });
                li.appendChild(revokeMemBtn);
              }
              listEl.appendChild(li);
            })(entries[i]);
          }
        }
        if (statusEl) {
          statusEl.textContent = entries.length
            ? "Showing " + entries.length + " seated organization account(s)."
            : "No seated organization members.";
        }
      } catch (error) {
        if ((error && error.name === "AbortError") || !isActiveContext(ctx)) return;
        if (isAdminRevocationError(error)) {
          handleOrgAccessRevoked(ctx, error.message);
          return;
        }
        if (statusEl) statusEl.textContent = "Members could not be loaded (" + (error && error.message ? error.message : "error") + ").";
      }
    }

    function validateInvitationUrl(rawUrl) {
      if (typeof rawUrl !== "string" || rawUrl.length > 8192) throw new Error("invalid_response");
      var url = new URL(rawUrl);
      var fragment = new URLSearchParams(url.hash.startsWith("#") ? url.hash.slice(1) : url.hash);
      var invId = url.searchParams.get("invitation_id");
      var invSecret = fragment.get("invitation_secret");
      if (url.protocol !== "https:" || url.username || url.password ||
          !flow.UUID_PATTERN.test(invId || "") || !flow.PKCE_HASH_PATTERN.test(invSecret || "")) {
        throw new Error("invalid_response");
      }
      return url.href;
    }

    async function loadInvitations(ctx, after) {
      if (!isActiveContext(ctx)) return;
      var statusEl = byId("admin-invitations-status");
      var listEl = byId("admin-invitations-list");
      var moreBtn = byId("admin-more-invitations-btn");
      try {
        var res = await edgePost("account-register", Object.assign({
          operation: "invitations",
          organization_id: ctx.orgId
        }, after !== undefined ? { after: after } : {}), orgReqOpts(ctx));
        if (!isActiveContext(ctx)) return;
        var entries = Array.isArray(res.invitations) ? res.invitations : [];
        invitationCursor = res.next !== undefined ? res.next : null;
        if (moreBtn) moreBtn.hidden = invitationCursor === null;
        if (listEl) {
          listEl.replaceChildren();
          for (var i = 0; i < entries.length; i++) {
            (function (entry) {
              var li = doc.createElement("li");
              var span = doc.createElement("span");
              var expired = Date.parse(entry.expires_at) <= Date.now();
              span.textContent = "Invitation slot " + entry.slot + " · " +
                (expired ? "Expired" : "Expires " + formatDeviceDate(entry.expires_at));
              var btn = doc.createElement("button");
              btn.type = "button";
              btn.textContent = "Cancel invitation";
              btn.onclick = withOrgLock(async function (activeCtx) {
                try {
                  await edgePost("account-register", {
                    operation: "revoke_invitation",
                    organization_id: activeCtx.orgId,
                    invitation_id: entry.invitation_id
                  }, orgReqOpts(activeCtx));
                } catch (err) {
                  if (!err || !["invitation_already_accepted", "invitation_not_found"].includes(err.message)) throw err;
                }
                if (!isActiveContext(activeCtx)) return;
                await loadInvitations(activeCtx);
              });
              li.appendChild(span);
              li.appendChild(btn);
              listEl.appendChild(li);
            })(entries[i]);
          }
        }
        if (statusEl) {
          statusEl.textContent = entries.length
            ? "Showing " + entries.length + " active/pending invitation(s)."
            : "No unused invitations.";
        }
      } catch (error) {
        if ((error && error.name === "AbortError") || !isActiveContext(ctx)) return;
        if (isAdminRevocationError(error)) {
          handleOrgAccessRevoked(ctx, error.message);
          return;
        }
        if (statusEl) statusEl.textContent = "Invitations unavailable (" + (error && error.message ? error.message : "error") + ").";
      }
    }

    async function loadAdminDelegation(ctx) {
      if (!isActiveContext(ctx)) return;
      var listEl = byId("admin-delegation-list");
      var invitesEl = byId("admin-delegation-invites-list");
      var metaEl = byId("admin-delegation-meta");
      var statusEl = byId("admin-delegation-status");
      if (!listEl) return;
      listEl.replaceChildren();
      if (invitesEl) invitesEl.replaceChildren();
      try {
        var res = await edgePost("org-admins", {
          operation: "list",
          organization_id: ctx.orgId
        }, orgReqOpts(ctx));
        if (!isActiveContext(ctx)) return;
        adminRevision = Number.isSafeInteger(res.admin_revision) ? res.admin_revision : 0;
        if (metaEl) {
          metaEl.textContent = "Admin revision " + adminRevision +
            " · Authority generation " + (res.authority_generation !== undefined ? res.authority_generation : 1) +
            " · Primary owner " + (res.primary_owner_account_id || "verified") +
            (res.actor_role ? " · Your role: " + res.actor_role : "");
        }
        var admins = Array.isArray(res.admins) ? res.admins : [];
        for (var i = 0; i < admins.length; i++) {
          (function (a) {
            var li = doc.createElement("li");
            var span = doc.createElement("span");
            span.textContent = "Account " + a.account_id + " · Role: " + (a.role || "admin") +
              (a.revoked_at ? " · Revoked" : " · Active");
            li.appendChild(span);
            if (!a.revoked_at && a.role !== "owner") {
              var revBtn = doc.createElement("button");
              revBtn.type = "button";
              revBtn.textContent = "Revoke admin";
              revBtn.onclick = withOrgLock(async function (activeCtx) {
                try {
                  await edgePost("org-admins", {
                    operation: "revoke",
                    organization_id: activeCtx.orgId,
                    member_account_id: a.account_id,
                    expected_revision: adminRevision
                  }, orgReqOpts(activeCtx));
                  if (!isActiveContext(activeCtx)) return;
                  await loadAdminDelegation(activeCtx);
                } catch (err) {
                  if (!isActiveContext(activeCtx) || isAdminRevocationError(err) || (err && (err.name === "AbortError" || err.status === 401))) throw err;
                  if (isRevisionConflictError(err)) {
                    if (statusEl) statusEl.textContent = "Concurrent revision conflict (409). Refreshing authoritative admin state…";
                    await loadAdminDelegation(activeCtx);
                    if (isActiveContext(activeCtx) && statusEl) {
                      statusEl.textContent = "Concurrent revision conflict detected; reloaded admin revision " + adminRevision + ".";
                    }
                    return;
                  }
                  if (statusEl) statusEl.textContent = "Admin revocation failed (" + (err && err.message ? err.message : "error") + ").";
                }
              });
              li.appendChild(revBtn);
            }
            listEl.appendChild(li);
          })(admins[i]);
        }
        var pendingInvites = Array.isArray(res.pending_invitations) ? res.pending_invitations : [];
        if (invitesEl) {
          for (var j = 0; j < pendingInvites.length; j++) {
            (function (inv) {
              var iLi = doc.createElement("li");
              var iSpan = doc.createElement("span");
              iSpan.textContent = "Pending admin invite " + inv.invitation_id + " · Recipient " + (inv.recipient_account_id || "account");
              var cBtn = doc.createElement("button");
              cBtn.type = "button";
              cBtn.textContent = "Revoke admin invite";
              cBtn.onclick = withOrgLock(async function (activeCtx) {
                try {
                  await edgePost("org-admins", {
                    operation: "revoke_invite",
                    organization_id: activeCtx.orgId,
                    invitation_id: inv.invitation_id,
                    expected_revision: adminRevision
                  }, orgReqOpts(activeCtx));
                  if (!isActiveContext(activeCtx)) return;
                  await loadAdminDelegation(activeCtx);
                } catch (err) {
                  if (!isActiveContext(activeCtx) || isAdminRevocationError(err) || (err && (err.name === "AbortError" || err.status === 401))) throw err;
                  if (isRevisionConflictError(err)) {
                    if (statusEl) statusEl.textContent = "Concurrent revision conflict (409). Refreshing authoritative admin state…";
                    await loadAdminDelegation(activeCtx);
                    if (isActiveContext(activeCtx) && statusEl) {
                      statusEl.textContent = "Concurrent revision conflict detected; reloaded admin revision " + adminRevision + ".";
                    }
                    return;
                  }
                  if (statusEl) statusEl.textContent = "Admin invite revocation failed (" + (err && err.message ? err.message : "error") + ").";
                }
              });
              iLi.appendChild(iSpan);
              iLi.appendChild(cBtn);
              invitesEl.appendChild(iLi);
            })(pendingInvites[j]);
          }
        }
        if (statusEl) statusEl.textContent = admins.length ? String(admins.length) + " listed organization admin(s)." : "";
      } catch (error) {
        if ((error && error.name === "AbortError") || !isActiveContext(ctx)) return;
        if (isAdminRevocationError(error)) {
          handleOrgAccessRevoked(ctx, error.message);
          return;
        }
        if (statusEl) {
          statusEl.textContent = (error && (error.message === "not_found" || error.message === "invalid_request"))
            ? "Primary owner transfer is active; delegated org-admin list activates with Wave 2 /org-admins rollout."
            : "Delegated admin list unavailable (" + (error && error.message ? error.message : "error") + ").";
        }
      }
    }

    async function loadPolicyTemplates(ctx) {
      if (!isActiveContext(ctx)) return;
      var srcSelect = byId("admin-template-source-project");
      var dstOrgSelect = byId("admin-template-target-org");
      var auditList = byId("admin-template-audit-list");
      var statusEl = byId("admin-template-status");
      if (srcSelect) {
        srcSelect.replaceChildren();
        for (var i = 0; i < orgProjects.length; i++) {
          var sOpt = doc.createElement("option");
          sOpt.value = orgProjects[i].project_id;
          sOpt.textContent = orgProjects[i].name || orgProjects[i].project_id;
          srcSelect.appendChild(sOpt);
        }
      }
      if (dstOrgSelect) {
        dstOrgSelect.replaceChildren();
        for (var j = 0; j < adminOrgs.length; j++) {
          if (adminOrgs[j].cloud_org_id === ctx.cloudOrgId) continue;
          var dOpt = doc.createElement("option");
          dOpt.value = adminOrgs[j].cloud_org_id;
          dOpt.textContent = (adminOrgs[j].scm_owner_slug || adminOrgs[j].id) + " (" + adminOrgs[j].cloud_org_id.slice(0, 8) + "…)";
          dstOrgSelect.appendChild(dOpt);
        }
      }
      syncActionStates();
      if (!auditList) return;
      auditList.replaceChildren();
      try {
        var res = await edgePost("policy-templates", {
          operation: "audit_list",
          organization_id: ctx.orgId
        }, orgReqOpts(ctx));
        if (!isActiveContext(ctx)) return;
        var entries = Array.isArray(res.audit_entries) ? res.audit_entries : (Array.isArray(res.events) ? res.events : []);
        for (var k = 0; k < entries.length; k++) {
          var li = doc.createElement("li");
          li.textContent = (entries[k].operation || "template_op") + " · " + (entries[k].target_project_id || entries[k].source_project_id || ctx.cloudOrgId);
          auditList.appendChild(li);
        }
      } catch (error) {
        if ((error && error.name === "AbortError") || !isActiveContext(ctx)) return;
        if (isAdminRevocationError(error)) {
          handleOrgAccessRevoked(ctx, error.message);
          return;
        }
        if (statusEl && error && error.message !== "not_found") {
          statusEl.textContent = "Policy template audit unavailable (" + (error.message || "error") + ").";
        }
      }
    }

    async function loadRecoverySection(ctx) {
      if (!isActiveContext(ctx)) return;
      var summaryEl = byId("admin-recovery-contact-summary");
      var statusEl = byId("admin-recovery-status");
      var inputEl = byId("admin-recovery-contact-input");
      try {
        var contactRes = await edgePost("org-recovery", {
          operation: "get_recovery_contact",
          organization_id: ctx.orgId
        }, orgReqOpts(ctx));
        if (!isActiveContext(ctx)) return;
        recoveryContact = contactRes.contact_account_id || null;
        recoveryRevision = Number.isSafeInteger(contactRes.revision) ? contactRes.revision : 0;
        if (inputEl && recoveryContact) inputEl.value = recoveryContact;
        if (summaryEl) {
          summaryEl.textContent = recoveryContact
            ? "Designated secondary recovery contact: " + recoveryContact + " (rev " + recoveryRevision + ")"
            : "No secondary recovery contact designated yet (optional continuity protection).";
        }
        var recStatus = await edgePost("org-recovery", {
          operation: "status",
          organization_id: ctx.orgId
        }, orgReqOpts(ctx));
        if (!isActiveContext(ctx)) return;
        if (statusEl && recStatus && recStatus.recovery_request_id) {
          statusEl.textContent = "Active recovery request " + recStatus.recovery_request_id +
            " · state " + recStatus.state + " (" + (recStatus.proof_count || 0) + "/" + (recStatus.required_proofs || 2) + " proofs).";
        }
      } catch (error) {
        if ((error && error.name === "AbortError") || !isActiveContext(ctx)) return;
        if (isAdminRevocationError(error)) {
          handleOrgAccessRevoked(ctx, error.message);
          return;
        }
        if (summaryEl) {
          summaryEl.textContent = (error && (error.message === "not_found" || error.message === "invalid_request"))
            ? "Recovery contact management activates with Wave 2 /org-recovery rollout."
            : "Recovery contact status unavailable (" + (error && error.message ? error.message : "error") + ").";
        }
      }
    }

    async function loadBillingSection(ctx) {
      if (!isActiveContext(ctx)) return;
      var statusEl = byId("admin-billing-status");
      var detailEl = byId("admin-billing-detail");
      var pendingBox = byId("admin-pending-order-box");
      var pendingSummary = byId("admin-pending-order-summary");
      var memberSelect = byId("admin-assign-member-select");
      var moreMembersBtn = byId("admin-more-billing-members-btn");

      try {
        var state = await edgePost("billing-manage", {
          action: "status",
          organization_id: ctx.orgId
        }, orgReqOpts(ctx));
        if (!isActiveContext(ctx)) return;
        billingReady = true;
        lastCapacities = Array.isArray(state.capacities) ? state.capacities : [];
        pendingBillingOrder = state.pending_order || null;

        var cadenceDetail = state.cadence === "year" ? "Annual upfront plan" : state.cadence === "month" ? "Monthly plan" : null;
        var untilDetail = typeof state.paid_until === "string" && Number.isFinite(Date.parse(state.paid_until))
          ? " paid through " + new Date(state.paid_until).toISOString().slice(0, 10)
          : "";
        if (statusEl) {
          statusEl.textContent = state.risk_hold
            ? "Billing status: risk hold — use Stripe Billing Portal to resolve."
            : state.quantity
              ? "Active subscription: " + state.quantity + " paid seat unit(s)" +
                (cadenceDetail ? " (" + cadenceDetail + untilDetail + ")" : "") + ". Paid overages OFF by default."
              : "No active paid repository capacity yet. Use Cloud Signup to purchase initial repository seats.";
        }
        if (pendingBox && pendingSummary) {
          if (pendingBillingOrder && pendingBillingOrder.order_id) {
            pendingSummary.textContent = "Pending billing order " + pendingBillingOrder.order_id +
              " (" + (pendingBillingOrder.status || "pending") + ").";
            pendingBox.hidden = false;
          } else {
            pendingBox.hidden = true;
          }
        }
        if (detailEl) detailEl.textContent = "";

        if (memberSelect) {
          memberSelect.replaceChildren();
          var mRes = await edgePost("billing-manage", {
            action: "members",
            organization_id: ctx.orgId
          }, orgReqOpts(ctx));
          if (!isActiveContext(ctx)) return;
          var mList = Array.isArray(mRes.members) ? mRes.members : [];
          for (var i = 0; i < mList.length; i++) {
            var opt = doc.createElement("option");
            opt.value = mList[i].account_id;
            opt.textContent = "Member " + mList[i].slot + " · " + (mList[i].providers || []).join(", ");
            memberSelect.appendChild(opt);
          }
          billingMemberCursor = mRes.next || null;
          if (moreMembersBtn) moreMembersBtn.hidden = !billingMemberCursor;
        }
      } catch (error) {
        if ((error && error.name === "AbortError") || !isActiveContext(ctx)) return;
        if (isAdminRevocationError(error)) {
          handleOrgAccessRevoked(ctx, error.message);
          return;
        }
        billingReady = false;
        lastCapacities = [];
        pendingBillingOrder = null;
        if (pendingBox) pendingBox.hidden = true;
        var code = error && error.message ? error.message : "billing_not_configured";
        if (statusEl) {
          statusEl.textContent = (code === "billing_not_configured" || code === "live_sale_disabled")
            ? "UNDER WRAPS — Purchasing and Stripe Billing Portal are disabled on this deployment."
            : "Billing status unavailable (" + code + ").";
        }
      }
      if (!isActiveContext(ctx)) return;
      renderRepositoriesSection();
      syncActionStates();
    }

    async function loadDevices(ctx) {
      if (!isActiveContext(ctx)) return;
      var myDevGen = ++devicesGeneration;
      var statusEl = byId("admin-devices-status");
      var listEl = byId("admin-devices-list");
      if (statusEl) statusEl.textContent = "Loading enrolled devices…";
      if (listEl) listEl.replaceChildren();
      try {
        var adminMode = true;
        var res;
        try {
          res = await edgePost("device-keys", {
            action: "admin_list",
            organization_id: ctx.orgId
          }, orgReqOpts(ctx));
        } catch (adminErr) {
          if ((adminErr && adminErr.name === "AbortError") || !isActiveContext(ctx) || myDevGen !== devicesGeneration) return;
          if (adminErr && adminErr.message === "invalid_request") {
            adminMode = false;
            res = await edgePost("device-keys", {}, orgReqOpts(ctx));
          } else {
            throw adminErr;
          }
        }
        if (!isActiveContext(ctx) || myDevGen !== devicesGeneration) return;
        if (!res || res.version !== 1 || res.status !== "keys" ||
            (!adminMode && res.account_id !== ctx.actor) ||
            !Array.isArray(res.device_keys) || res.device_keys.length > 200) {
          throw new Error("invalid_response");
        }
        var seen = new Set();
        var rows = [];
        for (var i = 0; i < res.device_keys.length; i++) {
          (function (key) {
            if (!key || typeof key !== "object" || !flow.UUID_PATTERN.test(key.device_key_id || "") ||
                seen.has(key.device_key_id) || !flow.PKCE_HASH_PATTERN.test(key.jkt || "") ||
                typeof key.label !== "string" || key.label.length > 128) {
              throw new Error("invalid_response");
            }
            seen.add(key.device_key_id);
            var li = doc.createElement("li");
            var span = doc.createElement("span");
            var label = key.label || "Unnamed device";
            var text = label + " · JKT " + key.jkt +
              (key.account_id ? " · Account " + key.account_id : "") +
              " · Enrolled " + formatDeviceDate(key.enrolled_at) +
              " · Last seen " + (key.last_seen_at == null ? "never" : formatDeviceDate(key.last_seen_at)) +
              " · " + (key.enrolled_aal === "aal2" ? "MFA step-up" : String(key.enrolled_aal || "standard")) +
              (key.status ? " · " + key.status : "");
            if (key.revoked_at !== null && key.revoked_at !== undefined) {
              text += " · Revoked " + formatDeviceDate(key.revoked_at);
            }
            span.textContent = text;
            li.appendChild(span);

            if ((key.revoked_at === null || key.revoked_at === undefined) && key.status !== "revoked") {
              var btn = doc.createElement("button");
              btn.type = "button";
              btn.textContent = "Revoke " + label;
              btn.onclick = async function () {
                if (!isActiveContext(ctx) || myDevGen !== devicesGeneration) return;
                devicesGeneration++;
                if (statusEl) statusEl.textContent = "Revoking device…";
                try {
                  var revRes = await edgePost("device-revoke", adminMode ? {
                    action: "admin_revoke",
                    organization_id: ctx.orgId,
                    device_key_id: key.device_key_id
                  } : {
                    action: "revoke_key",
                    device_key_id: key.device_key_id
                  }, orgReqOpts(ctx));
                  if (!isActiveContext(ctx)) return;
                  if (revRes.status !== "device_revoked") throw new Error("invalid_response");
                  if (statusEl) statusEl.textContent = "Device revoked. Refreshing device inventory…";
                  await loadDevices(ctx);
                } catch (err) {
                  if ((err && err.name === "AbortError") || !isActiveContext(ctx)) return;
                  if (isAdminRevocationError(err)) {
                    handleOrgAccessRevoked(ctx, err.message);
                    return;
                  }
                  if (statusEl) statusEl.textContent = "Device revocation failed (" + (err && err.message ? err.message : "error") + ").";
                }
              };
              li.appendChild(btn);
            }
            rows.push(li);
          })(res.device_keys[i]);
        }
        if (!isActiveContext(ctx) || myDevGen !== devicesGeneration) return;
        if (listEl) listEl.replaceChildren.apply(listEl, rows);
        if (statusEl) {
          statusEl.textContent = rows.length
            ? ""
            : (adminMode ? "No enrolled CLI devices in this organization." : "No enrolled CLI devices on this account.");
        }
      } catch (error) {
        if ((error && error.name === "AbortError") || !isActiveContext(ctx) || myDevGen !== devicesGeneration) return;
        if (isAdminRevocationError(error)) {
          handleOrgAccessRevoked(ctx, error.message);
          return;
        }
        if (statusEl) statusEl.textContent = "Enrolled devices unavailable (" + (error && error.message ? error.message : "error") + ").";
      }
    }

    async function loadOrganizationProjects(ctx) {
      if (!isActiveContext(ctx)) return;
      var allProjects = Array.isArray(accountSnapshot && accountSnapshot.projects)
        ? accountSnapshot.projects
        : [];
      var filtered = [];
      for (var i = 0; i < allProjects.length; i++) {
        var proj = allProjects[i];
        if (!proj || typeof proj.project_id !== "string") continue;
        try {
          var st = await edgePost("account-status", {
            project_id: proj.project_id,
            operation: "access_details"
          }, orgReqOpts(ctx));
          if (!isActiveContext(ctx)) return;
          var matchesOrg = st.organization_id === ctx.orgId ||
            (typeof st.cloud_org_id === "string" && st.cloud_org_id.toLowerCase() === ctx.cloudOrgId);
          if (matchesOrg && st.admin === true) {
            filtered.push(proj);
            projectStates.set(proj.project_id, st);
          }
        } catch (err) {
          if ((err && err.name === "AbortError") || !isActiveContext(ctx)) return;
          if (isAdminRevocationError(err)) {
            handleOrgAccessRevoked(ctx, err.message);
            return;
          }
        }
      }
      if (!isActiveContext(ctx)) return;
      orgProjects = filtered;
      renderRepositoriesSection();
    }

    async function activateOrganization(orgObj, expectedSessionEpoch) {
      var mySessionEpoch = typeof expectedSessionEpoch === "number" ? expectedSessionEpoch : sessionEpoch;
      if (mySessionEpoch !== sessionEpoch || !currentUser || !session) return;
      resetOrgAbortController();
      var myGen = ++renderGeneration;
      clearWorkspaceUi();
      activeOrg = orgObj;
      renderAccountBar();

      var ctx = {
        sessionEpoch: mySessionEpoch,
        generation: myGen,
        signal: orgAbortController ? orgAbortController.signal : null,
        cloudOrgId: orgObj.cloud_org_id,
        orgId: orgObj.id,
        actor: currentUser.id,
        bearer: session.access_token
      };

      // Server-side verification of org admin grant for this exact cloud_org_id.
      try {
        var orgVerified = await edgePost("account-register", {
          operation: "account",
          organization_id: orgObj.cloud_org_id
        }, orgReqOpts(ctx));
        if (!isActiveContext(ctx)) return;
        if (!orgVerified || orgVerified.account_id !== currentUser.id) {
          throw new Error("auth_account_changed");
        }
      } catch (error) {
        if ((error && error.name === "AbortError") || mySessionEpoch !== sessionEpoch || myGen !== renderGeneration) return;
        var code = error && error.message ? error.message : "authorization_denied";
        var orgErrRef = formatSupportRef(error, orgObj.cloud_org_id);
        if (isAdminRevocationError(error)) {
          handleOrgAccessRevoked(ctx, code);
        } else if (error && (error.status === 429 || code === "rate_limited")) {
          var orgWait = Number.isSafeInteger(error.retryAfterSec) && error.retryAfterSec > 0
            ? " Wait " + error.retryAfterSec + "s before retrying."
            : " Wait briefly before retrying.";
          showDeniedPanel(
            "RATE LIMITED (429)",
            "Organization verification rate limited",
            "Cloud API rate limit prevented verifying your administrator grant. Workspace panels stay locked until verification completes." + orgWait,
            (orgErrRef ? orgErrRef + ". " : "") + "Use Refresh organization after waiting.",
            adminOrgs.length > 0
          );
          setStatus("Organization verification rate-limited (429)." + orgWait + (orgErrRef ? " " + orgErrRef + "." : ""), true);
        } else if (error && (error.status >= 500 || code === "service_unavailable" || code === "request_timeout")) {
          showDeniedPanel(
            "SERVICE UNAVAILABLE",
            "Organization verification temporarily unavailable",
            "The Decapod Cloud API could not verify your organization administrator grant right now. Protected panels remain locked.",
            (orgErrRef ? orgErrRef + ". " : "") + "Use Refresh organization or reload once connectivity recovers.",
            adminOrgs.length > 0
          );
          setStatus("Organization verification unavailable (" + code + ")." + (orgErrRef ? " " + orgErrRef + "." : ""), true);
        } else {
          showDeniedPanel(
            "AUTHORIZATION DENIED",
            "Organization administrator access denied",
            "You do not hold a verified administrator grant for this organization.",
            "Server verification returned: " + code + "." + (orgErrRef ? " " + orgErrRef + "." : ""),
            true
          );
          setStatus("Access denied for organization (" + code + ")." + (orgErrRef ? " " + orgErrRef + "." : ""), true);
        }
        return;
      }

      syncUrlForOrg(orgObj);
      var deniedPanel = byId("admin-denied-panel");
      if (deniedPanel) deniedPanel.hidden = true;
      var workspace = byId("admin-workspace");
      if (workspace) workspace.hidden = false;

      var signupLink = byId("admin-add-capacity-link");
      if (signupLink) {
        var firstRepo = orgProjects[0] ? orgProjects[0].name || orgProjects[0].project_id : null;
        signupLink.href = flow.buildSignupHandoffUrl({ origin: siteOrigin(), repo: firstRepo });
      }

      renderOrgContextSummary();
      syncActionStates();
      setStatus("Administering organization " + (orgObj.scm_owner_slug || orgObj.cloud_org_id) + " (" + orgObj.cloud_org_id + ").", false);

      await loadOrganizationProjects(ctx);
      if (!isActiveContext(ctx)) return;
      if (signupLink) {
        var loadedFirstRepo = orgProjects[0] ? orgProjects[0].name || orgProjects[0].project_id : null;
        signupLink.href = flow.buildSignupHandoffUrl({ origin: siteOrigin(), repo: loadedFirstRepo });
      }
      await Promise.all([
        loadBillingSection(ctx),
        loadMembers(ctx),
        loadInvitations(ctx),
        loadAdminDelegation(ctx),
        loadPolicyTemplates(ctx),
        loadRecoverySection(ctx),
        loadResourceLimits(ctx),
        loadDevices(ctx)
      ]);
    }

    async function refreshActiveOrganization() {
      if (!activeOrg) {
        await loadAuthenticatedAccount(sessionEpoch);
        return;
      }
      var targetUuid = activeOrg.cloud_org_id;
      requestedOrgLocator = targetUuid;
      await loadAuthenticatedAccount(sessionEpoch);
    }

    async function loadAuthenticatedAccount(expectedSessionEpoch) {
      var mySessionEpoch = typeof expectedSessionEpoch === "number" ? expectedSessionEpoch : sessionEpoch;
      var reqOpts = {
        sessionEpoch: mySessionEpoch,
        signal: sessionAbortController ? sessionAbortController.signal : null
      };
      var bearer = requireToken();
      var fetchedUser = await fetchUser(bearer, reqOpts);
      if (mySessionEpoch !== sessionEpoch || !session) return;
      currentUser = fetchedUser;
      var result = await edgePost("account-register", { operation: "account" }, reqOpts);
      if (mySessionEpoch !== sessionEpoch || !session) return;
      if (result.account_id !== currentUser.id) {
        throw new Error("auth_account_changed");
      }
      accountSnapshot = result;
      adminOrgs = flow.listAdminOrganizations(result.organizations);

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
          }, reqOpts);
          if (mySessionEpoch !== sessionEpoch || !session) return;
          if (accepted.status === "invitation_accepted") {
            storeRemove("invitation");
            result = await edgePost("account-register", { operation: "account" }, reqOpts);
            if (mySessionEpoch !== sessionEpoch || !session) return;
            accountSnapshot = result;
            adminOrgs = flow.listAdminOrganizations(result.organizations);
          }
        } catch (invErr) {
          if ((invErr && invErr.name === "AbortError") || mySessionEpoch !== sessionEpoch || !session) return;
        }
      }

      if (requestedOrgLocator) {
        var resolved = flow.resolveAdminOrganization(result.organizations, requestedOrgLocator);
        if (resolved.status !== "authorized") {
          showDeniedPanel(
            "ORGANIZATION ACCESS DENIED",
            "Organization unavailable or unauthorized",
            "You do not have verified administrator authority for the requested organization, or it could not be resolved for your account.",
            "Navigation slugs never grant authority. Switch to an organization where you hold an active org_admin role or return to Pricing/Signup.",
            adminOrgs.length > 0
          );
          setStatus("Organization resolution denied (" + resolved.reason + ").", true);
          return;
        }
        await activateOrganization(resolved.org, mySessionEpoch);
        return;
      }

      if (adminOrgs.length === 0) {
        showDeniedPanel(
          "NO ADMINISTERED ORGANIZATIONS",
          "No organization administrator grants found",
          "Your signed-in account does not currently administer any Decapod Cloud organization.",
          "Enroll a repository on /signup or accept an organization admin invitation first.",
          false
        );
        setStatus("Signed in with zero administered organizations.", false);
        return;
      }

      await activateOrganization(adminOrgs[0], mySessionEpoch);
    }

    async function processIncomingUrlAndSession(expectedSessionEpoch) {
      var mySessionEpoch = typeof expectedSessionEpoch === "number" ? expectedSessionEpoch : sessionEpoch;
      var reqOpts = {
        sessionEpoch: mySessionEpoch,
        signal: sessionAbortController ? sessionAbortController.signal : null
      };
      var currentUrl = new URL(winLocation.href);
      var query = new URLSearchParams(currentUrl.search || "");
      var rawHash = currentUrl.hash || "";
      var fragment = new URLSearchParams(rawHash.startsWith("#") ? rawHash.slice(1) : rawHash);

      var routeCheck = flow.parseAdminRoute(currentUrl.pathname, currentUrl.search);
      routeMode = routeCheck.source === "path" ? "path" : "query";

      var returnCheck = flow.parseSafeAdminReturnParam(query, siteOrigin());
      if (returnCheck.status === "rejected") {
        setStatus("Hostile or external return URL rejected.", true);
      }

      var code = query.get("code");
      var loginNonce = query.get("login_nonce");
      var codeList = query.getAll("code");
      var nonceList = query.getAll("login_nonce");
      var oauthError = query.get("error") || fragment.get("error");
      var invId = query.get("invitation_id");
      var invSecret = fragment.get("invitation_secret");
      var hostileFragment = flow.hasHostileFragmentTokens(rawHash);

      var pendingFlowBeforeScrub = storeGet("flow", 8192);
      if (routeCheck.status === "valid") {
        requestedOrgLocator = routeCheck.org;
        setBanner(
          "valid",
          "Requested organization locator: " + routeCheck.org,
          "Untrusted locator pending server-side verification against your authenticated admin grants."
        );
      } else if (routeCheck.status === "invalid") {
        requestedOrgLocator = null;
        setBanner(
          "invalid",
          "Malformed organization route rejected",
          "Use /admin/<org> or /admin/?org=<org> with a valid organization slug or UUID."
        );
      } else if ((query.has("code") || query.has("error")) && pendingFlowBeforeScrub &&
                 typeof pendingFlowBeforeScrub.requested_org === "string" &&
                 flow.parseOrgSlug(pendingFlowBeforeScrub.requested_org)) {
        requestedOrgLocator = pendingFlowBeforeScrub.requested_org;
        if (pendingFlowBeforeScrub.route_mode === "path") routeMode = "path";
      } else {
        requestedOrgLocator = null;
        setBanner(null);
      }

      // Scrub callback params, query secrets, and hostile fragments immediately before network calls.
      if ((currentUrl.search || currentUrl.hash || routeCheck.status === "invalid") &&
          winHistory && typeof winHistory.replaceState === "function") {
        var cleanPath = routeCheck.status === "valid"
          ? flow.buildAdminBrowserPath(currentUrl.pathname, routeCheck.org)
          : "/admin/";
        winHistory.replaceState(null, "", cleanPath);
      }

      if (!profile) {
        var discovery = typeof flow.discoverRuntimeStatus === "function"
          ? await flow.discoverRuntimeStatus(fetchFn)
          : { status: "ok", profile: await flow.discoverRuntimeConfig(fetchFn), correlationId: null, retryAfterSec: null };
        if (mySessionEpoch !== sessionEpoch) return;
        profile = discovery && discovery.profile ? discovery.profile : null;
        if (!profile) {
          var dStatus = discovery && discovery.status ? discovery.status : "unavailable";
          if (dStatus === "incompatible") {
            skewBlocked = true;
            skewReason = discovery.reason || "api_contract_mismatch";
          }
          syncAuthGateUi();
          var dRef = discovery && discovery.correlationId ? (" Support ref: " + discovery.correlationId + ".") : "";
          if (dStatus === "invalid") {
            setStatus("Cloud authentication configuration failed validation (malformed config)." + dRef, true);
          } else if (dStatus === "rate_limited") {
            var dWait = discovery.retryAfterSec ? (" Wait " + discovery.retryAfterSec + "s before reloading.") : "";
            setStatus("Cloud authentication discovery rate-limited (429)." + dWait + dRef, true);
          } else if (dStatus === "incompatible") {
            setStatus("API contract version mismatch. Reload this page to continue safely." + dRef, true);
          } else {
            setStatus("Cloud authentication configuration is currently unavailable." + dRef, true);
          }
          return;
        }
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

      if (routeCheck.status === "invalid" && !query.has("code")) {
        syncAuthGateUi();
        if (session) {
          var invalidRouteUser = await fetchUser(requireToken(), reqOpts);
          if (mySessionEpoch !== sessionEpoch || !session) return;
          currentUser = invalidRouteUser;
          var acct = await edgePost("account-register", { operation: "account" }, reqOpts);
          if (mySessionEpoch !== sessionEpoch || !session) return;
          accountSnapshot = acct;
          adminOrgs = flow.listAdminOrganizations(acct.organizations);
          showDeniedPanel(
            "MALFORMED ROUTE",
            "Malformed organization path rejected",
            "The requested /admin route could not be parsed as a valid organization locator.",
            "Select an administered organization from the switcher or return to /admin/.",
            adminOrgs.length > 0
          );
        }
        setStatus("Rejected malformed admin route (" + routeCheck.reason + ").", true);
        return;
      }

      if (query.has("code") || query.has("error") || fragment.has("error")) {
        var pendingFlow = storeGet("flow", 8192);
        var validFlow = pendingFlow &&
          pendingFlow.version === 1 &&
          (pendingFlow.contract_version === undefined || pendingFlow.contract_version === flow.CONTRACT_VERSION) &&
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
          if (mySessionEpoch !== sessionEpoch) return;
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
          if (session) await loadAuthenticatedAccount(mySessionEpoch);
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
          "POST",
          reqOpts
        );
        if (mySessionEpoch !== sessionEpoch) return;
        if (typeof exchanged.access_token !== "string" || !exchanged.access_token ||
            exchanged.access_token.length > 16384 || /\s/.test(exchanged.access_token) ||
            !Number.isSafeInteger(exchanged.expires_in) || exchanged.expires_in <= 15) {
          storeRemove("flow");
          throw new Error("invalid_response");
        }
        var confirmed = await fetchUser(exchanged.access_token, reqOpts);
        if (mySessionEpoch !== sessionEpoch) return;
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
          origin: profile.projectOrigin,
          contract_version: flow.CONTRACT_VERSION
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
          }, reqOpts);
          if (mySessionEpoch !== sessionEpoch) return;
        }
      }

      if (mySessionEpoch !== sessionEpoch) return;
      syncAuthGateUi();
      if (!session) {
        setStatus("Sign in with GitHub or Google to open organization administration.", false);
        return;
      }
      await loadAuthenticatedAccount(mySessionEpoch);
    }

    function bindEvents() {
      var ghBtn = byId("admin-auth-github");
      if (ghBtn) ghBtn.onclick = function () { beginAuth("github", "sign_in", false).catch(function (e) { setStatus("Sign-in error: " + e.message, true); }); };
      var googleBtn = byId("admin-auth-google");
      if (googleBtn) googleBtn.onclick = function () { beginAuth("google", "sign_in", false).catch(function (e) { setStatus("Sign-in error: " + e.message, true); }); };
      var cancelBtn = byId("admin-cancel-auth-btn");
      if (cancelBtn) cancelBtn.onclick = function () { storeRemove("flow"); syncAuthGateUi(); setStatus("Pending sign-in canceled.", false); };

      var signOutBtn = byId("admin-sign-out-btn");
      if (signOutBtn) {
        signOutBtn.onclick = function () {
          requestedOrgLocator = null;
          storeRemove("flow");
          storeRemove("session");
          session = null;
          clearAllSessionState(true);
          syncAuthGateUi();
          if (flowOk && profile) {
            coherenceChannel.broadcastAuthInvalidated(profile.projectOrigin);
          }
          setStatus("Signed out. Authenticate to continue.", false);
        };
      }

      var refreshBtn = byId("admin-refresh-btn");
      if (refreshBtn) refreshBtn.onclick = function () { refreshActiveOrganization().catch(function (e) { setStatus("Refresh failed: " + e.message, true); }); };

      var orgSelect = byId("admin-org-select");
      if (orgSelect) {
        orgSelect.onchange = function () {
          var chosen = adminOrgs.find(function (o) { return o.cloud_org_id === orgSelect.value; });
          if (!chosen) return;
          requestedOrgLocator = chosen.scm_owner_slug || chosen.cloud_org_id;
          activateOrganization(chosen, sessionEpoch).catch(function (e) { setStatus("Organization switch failed: " + e.message, true); });
        };
      }

      var openAuthorizedBtn = byId("admin-open-authorized-org-btn");
      if (openAuthorizedBtn) {
        openAuthorizedBtn.onclick = function () {
          if (!adminOrgs.length) return;
          requestedOrgLocator = adminOrgs[0].scm_owner_slug || adminOrgs[0].cloud_org_id;
          activateOrganization(adminOrgs[0], sessionEpoch).catch(function (e) { setStatus("Organization switch failed: " + e.message, true); });
        };
      }

      var linkGhBtn = byId("admin-link-github-btn");
      if (linkGhBtn) linkGhBtn.onclick = function () { beginAuth("github", "link", true).catch(function (e) { setStatus("GitHub linking failed: " + e.message, true); }); };

      var confirmProvBtn = byId("admin-confirm-provider-btn");
      if (confirmProvBtn) {
        confirmProvBtn.onclick = function () {
          if (!pendingStepupProvider) return;
          var myEpoch = sessionEpoch;
          edgePost("account-register", {
            operation: "resolve_provider_quarantine",
            provider: pendingStepupProvider,
            decision: "confirm"
          }, { sessionEpoch: myEpoch, signal: sessionAbortController ? sessionAbortController.signal : null })
            .then(function () { if (myEpoch === sessionEpoch) return loadAuthenticatedAccount(myEpoch); })
            .catch(function (e) { if (e && e.name !== "AbortError" && myEpoch === sessionEpoch) setStatus("Provider confirmation failed: " + e.message, true); });
        };
      }

      var revokeProvBtn = byId("admin-revoke-provider-btn");
      if (revokeProvBtn) {
        revokeProvBtn.onclick = function () {
          if (!pendingStepupProvider) return;
          var myEpoch = sessionEpoch;
          edgePost("account-register", {
            operation: "resolve_provider_quarantine",
            provider: pendingStepupProvider,
            decision: "revoke"
          }, { sessionEpoch: myEpoch, signal: sessionAbortController ? sessionAbortController.signal : null })
            .then(function () { if (myEpoch === sessionEpoch) return loadAuthenticatedAccount(myEpoch); })
            .catch(function (e) { if (e && e.name !== "AbortError" && myEpoch === sessionEpoch) setStatus("Provider revocation failed: " + e.message, true); });
        };
      }

      var enrollRepoBtn = byId("admin-enroll-repo-btn");
      if (enrollRepoBtn) {
        enrollRepoBtn.onclick = withOrgLock(async function (ctx) {
          var input = byId("admin-enroll-repo-input");
          var statusEl = byId("admin-enroll-status");
          var parsed = flow.parseRepoSlug(input ? input.value : "");
          if (!parsed) {
            if (statusEl) statusEl.textContent = "Enter a valid repository as owner/repo.";
            return;
          }
          if (!inMemoryProviderToken) {
            var authBtn = byId("admin-authorize-github-btn");
            if (authBtn) authBtn.hidden = false;
            if (statusEl) statusEl.textContent = "GitHub repository lookup token required. Click Authorize GitHub repo lookup.";
            return;
          }
          if (enrollRepoSlug !== parsed.slug || !enrollRequestId) {
            enrollRepoSlug = parsed.slug;
            enrollRequestId = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : flow.randomSecret();
          }
          var enrolled = await edgePost("repository-enroll", {
            request_id: enrollRequestId,
            provider: "github",
            repository: parsed.slug,
            organization_id: ctx.orgId,
            provider_token: inMemoryProviderToken
          }, orgReqOpts(ctx));
          if (!isActiveContext(ctx)) return;
          if (enrolled.status !== "repository_enrolled") {
            if (statusEl) statusEl.textContent = "Repository enrollment status: " + enrolled.status;
            return;
          }
          enrollRepoSlug = null;
          enrollRequestId = null;
          if (statusEl) statusEl.textContent = "Enrolled " + parsed.slug + " without altering seat assignments.";
          await refreshActiveOrganization();
        });
      }

      var authGhRepoBtn = byId("admin-authorize-github-btn");
      if (authGhRepoBtn) {
        authGhRepoBtn.onclick = function () { beginAuth("github", "sign_in", true).catch(function (e) { setStatus("GitHub authorization error: " + e.message, true); }); };
      }

      var saveProjBtn = byId("admin-save-project-btn");
      if (saveProjBtn) {
        saveProjBtn.onclick = withOrgLock(async function (ctx) {
          var sel = byId("admin-settings-project-select");
          var nameInput = byId("admin-settings-project-name");
          var statusEl = byId("admin-project-settings-status");
          var projId = sel ? sel.value : "";
          var newName = nameInput ? nameInput.value.trim() : "";
          if (!projId || !newName || newName.length > 200) {
            if (statusEl) statusEl.textContent = "Select a repository and enter a display name (1–200 chars).";
            return;
          }
          var updated = await edgePost("account-register", {
            operation: "project_settings",
            organization_id: ctx.orgId,
            project_id: projId,
            project_name: newName
          }, orgReqOpts(ctx));
          if (!isActiveContext(ctx)) return;
          if (statusEl) statusEl.textContent = "Saved display name for " + updated.project_id + ".";
          await refreshActiveOrganization();
        });
      }

      var assignBtn = byId("admin-assign-seat-btn");
      if (assignBtn) {
        assignBtn.onclick = withOrgLock(async function (ctx) {
          var projSel = byId("admin-assign-project-select");
          var memSel = byId("admin-assign-member-select");
          var statusEl = byId("admin-seat-assign-status");
          await edgePost("billing-manage", {
            action: "assign",
            organization_id: ctx.orgId,
            project_id: projSel ? projSel.value : "",
            account_id: memSel ? memSel.value : ""
          }, orgReqOpts(ctx));
          if (!isActiveContext(ctx)) return;
          if (statusEl) statusEl.textContent = "Assigned paid repository seat.";
          await refreshActiveOrganization();
        });
      }

      var revokeSeatAssignBtn = byId("admin-revoke-seat-btn");
      if (revokeSeatAssignBtn) {
        revokeSeatAssignBtn.onclick = withOrgLock(async function (ctx) {
          var projSel = byId("admin-assign-project-select");
          var memSel = byId("admin-assign-member-select");
          var statusEl = byId("admin-seat-assign-status");
          await edgePost("billing-manage", {
            action: "revoke",
            organization_id: ctx.orgId,
            project_id: projSel ? projSel.value : "",
            account_id: memSel ? memSel.value : ""
          }, orgReqOpts(ctx));
          if (!isActiveContext(ctx)) return;
          if (statusEl) statusEl.textContent = "Revoked paid repository seat. Organization admin authority remains unchanged.";
          await refreshActiveOrganization();
        });
      }

      var refreshMembersBtn = byId("admin-refresh-members-btn");
      if (refreshMembersBtn) refreshMembersBtn.onclick = withOrgLock(function (ctx) { return loadMembers(ctx); });
      var nextMembersBtn = byId("admin-next-members-btn");
      if (nextMembersBtn) nextMembersBtn.onclick = withOrgLock(function (ctx) { return memberCursor === null ? undefined : loadMembers(ctx, memberCursor); });

      var inviteBtn = byId("admin-invite-btn");
      if (inviteBtn) {
        inviteBtn.onclick = withOrgLock(async function (ctx) {
          var recipientInput = byId("admin-invite-recipient");
          var statusEl = byId("admin-invitations-status");
          var recipient = recipientInput ? recipientInput.value.trim() : "";
          if (!flow.UUID_PATTERN.test(recipient)) {
            if (statusEl) statusEl.textContent = "Enter a valid recipient Cloud Account UUID.";
            return;
          }
          var res = await edgePost("account-register", {
            operation: "invite",
            organization_id: ctx.orgId,
            recipient_account_id: recipient
          }, orgReqOpts(ctx));
          if (!isActiveContext(ctx)) return;
          if (recipientInput) recipientInput.value = "";
          var safeUrl = validateInvitationUrl(res.invitation_url);
          createdInvitation = { url: safeUrl, id: res.invitation_id };
          var copyBox = byId("admin-invitation-copy-box");
          var linkInput = byId("admin-invitation-link");
          if (linkInput) linkInput.value = safeUrl;
          if (copyBox) copyBox.hidden = false;
          if (statusEl) statusEl.textContent = "Invitation created (membership only; assign repository seats separately).";
          await loadInvitations(ctx);
        });
      }

      var copyInvBtn = byId("admin-copy-invitation-btn");
      if (copyInvBtn) {
        copyInvBtn.onclick = function () {
          if (!createdInvitation || typeof navigator === "undefined" || !navigator.clipboard) return;
          navigator.clipboard.writeText(createdInvitation.url).catch(function () {});
        };
      }

      var refreshInvBtn = byId("admin-refresh-invitations-btn");
      if (refreshInvBtn) refreshInvBtn.onclick = withOrgLock(function (ctx) { return loadInvitations(ctx); });
      var moreInvBtn = byId("admin-more-invitations-btn");
      if (moreInvBtn) moreInvBtn.onclick = withOrgLock(function (ctx) { return invitationCursor === null ? undefined : loadInvitations(ctx, invitationCursor); });

      var grantAdminBtn = byId("admin-grant-admin-btn");
      if (grantAdminBtn) {
        grantAdminBtn.onclick = withOrgLock(async function (ctx) {
          var targetInput = byId("admin-delegate-account");
          var statusEl = byId("admin-delegation-status");
          var targetUuid = targetInput ? targetInput.value.trim() : "";
          if (!flow.UUID_PATTERN.test(targetUuid)) {
            if (statusEl) statusEl.textContent = "Enter a valid member Account UUID.";
            return;
          }
          try {
            await edgePost("org-admins", {
              operation: "grant",
              organization_id: ctx.orgId,
              member_account_id: targetUuid,
              role: "admin",
              expected_revision: adminRevision
            }, orgReqOpts(ctx));
            if (!isActiveContext(ctx)) return;
            if (statusEl) statusEl.textContent = "Granted admin role to " + targetUuid + " (0 repo seats added).";
            await loadAdminDelegation(ctx);
          } catch (error) {
            if ((error && (error.name === "AbortError" || error.status === 401)) || isAdminRevocationError(error) || !isActiveContext(ctx)) throw error;
            if (isRevisionConflictError(error)) {
              if (statusEl) statusEl.textContent = "Concurrent revision conflict (409). Refreshing authoritative admin state…";
              await loadAdminDelegation(ctx);
              if (isActiveContext(ctx) && statusEl) {
                statusEl.textContent = "Concurrent revision conflict detected; reloaded authoritative admin revision " + adminRevision + ".";
              }
              return;
            }
            if (statusEl) statusEl.textContent = "Admin grant failed (" + (error && error.message ? error.message : "error") + ").";
          }
        });
      }

      var inviteAdminBtn = byId("admin-invite-admin-btn");
      if (inviteAdminBtn) {
        inviteAdminBtn.onclick = withOrgLock(async function (ctx) {
          var targetInput = byId("admin-delegate-account");
          var statusEl = byId("admin-delegation-status");
          var targetUuid = targetInput ? targetInput.value.trim() : "";
          if (!flow.UUID_PATTERN.test(targetUuid)) {
            if (statusEl) statusEl.textContent = "Enter a valid recipient Account UUID.";
            return;
          }
          try {
            var res = await edgePost("org-admins", {
              operation: "invite",
              organization_id: ctx.orgId,
              recipient_account_id: targetUuid,
              expected_revision: adminRevision
            }, orgReqOpts(ctx));
            if (!isActiveContext(ctx)) return;
            if (statusEl) statusEl.textContent = "Created admin invitation " + (res.invitation_id || "") + " (identity-bound).";
            await loadAdminDelegation(ctx);
          } catch (error) {
            if ((error && (error.name === "AbortError" || error.status === 401)) || isAdminRevocationError(error) || !isActiveContext(ctx)) throw error;
            if (isRevisionConflictError(error)) {
              if (statusEl) statusEl.textContent = "Concurrent revision conflict (409). Refreshing authoritative admin state…";
              await loadAdminDelegation(ctx);
              if (isActiveContext(ctx) && statusEl) {
                statusEl.textContent = "Concurrent revision conflict detected; reloaded authoritative admin revision " + adminRevision + ".";
              }
              return;
            }
            if (statusEl) statusEl.textContent = "Admin invitation failed (" + (error && error.message ? error.message : "error") + ").";
          }
        });
      }

      var revokeAdminBtn = byId("admin-revoke-admin-btn");
      if (revokeAdminBtn) {
        revokeAdminBtn.onclick = withOrgLock(async function (ctx) {
          var targetInput = byId("admin-delegate-account");
          var statusEl = byId("admin-delegation-status");
          var targetUuid = targetInput ? targetInput.value.trim() : "";
          if (!flow.UUID_PATTERN.test(targetUuid)) {
            if (statusEl) statusEl.textContent = "Enter a valid admin Account UUID.";
            return;
          }
          try {
            await edgePost("org-admins", {
              operation: "revoke",
              organization_id: ctx.orgId,
              member_account_id: targetUuid,
              expected_revision: adminRevision
            }, orgReqOpts(ctx));
            if (!isActiveContext(ctx)) return;
            if (statusEl) statusEl.textContent = "Revoked admin role for " + targetUuid + ".";
            await loadAdminDelegation(ctx);
          } catch (error) {
            if ((error && (error.name === "AbortError" || error.status === 401)) || isAdminRevocationError(error) || !isActiveContext(ctx)) throw error;
            if (isRevisionConflictError(error)) {
              if (statusEl) statusEl.textContent = "Concurrent revision conflict (409). Refreshing authoritative admin state…";
              await loadAdminDelegation(ctx);
              if (isActiveContext(ctx) && statusEl) {
                statusEl.textContent = "Concurrent revision conflict detected; reloaded authoritative admin revision " + adminRevision + ".";
              }
              return;
            }
            if (statusEl) statusEl.textContent = "Admin revocation failed (" + (error && error.message ? error.message : "error") + ").";
          }
        });
      }

      var transferOwnerBtn = byId("admin-transfer-owner-btn");
      if (transferOwnerBtn) {
        transferOwnerBtn.onclick = withOrgLock(async function (ctx) {
          var targetInput = byId("admin-delegate-account");
          var statusEl = byId("admin-delegation-status");
          var targetUuid = targetInput ? targetInput.value.trim() : "";
          if (!flow.UUID_PATTERN.test(targetUuid)) {
            if (statusEl) statusEl.textContent = "Enter a valid seated member Account UUID for ownership transfer.";
            return;
          }
          try {
            await edgePost("org-admins", {
              operation: "transfer_ownership",
              organization_id: ctx.orgId,
              member_account_id: targetUuid,
              expected_revision: adminRevision
            }, orgReqOpts(ctx));
          } catch (err) {
            if ((err && (err.name === "AbortError" || err.status === 401)) || isAdminRevocationError(err) || !isActiveContext(ctx)) throw err;
            if (isRevisionConflictError(err)) {
              if (statusEl) statusEl.textContent = "Concurrent revision conflict (409). Refreshing authoritative admin state…";
              await loadAdminDelegation(ctx);
              if (isActiveContext(ctx) && statusEl) {
                statusEl.textContent = "Concurrent revision conflict detected; reloaded authoritative admin revision " + adminRevision + ".";
              }
              return;
            }
            if (err && (err.message === "not_found" || err.message === "invalid_request")) {
              await edgePost("account-register", {
                operation: "transfer_ownership",
                organization_id: ctx.orgId,
                member_account_id: targetUuid
              }, orgReqOpts(ctx));
            } else {
              throw err;
            }
          }
          if (!isActiveContext(ctx)) return;
          if (statusEl) statusEl.textContent = "Primary ownership transferred to " + targetUuid + ".";
          await refreshActiveOrganization();
        });
      }

      var exportTplBtn = byId("admin-export-template-btn");
      if (exportTplBtn) {
        exportTplBtn.onclick = withOrgLock(async function (ctx) {
          var srcSel = byId("admin-template-source-project");
          var dstSel = byId("admin-template-target-org");
          var statusEl = byId("admin-template-status");
          var srcProj = srcSel ? srcSel.value : "";
          var dstOrgId = dstSel ? dstSel.value : "";
          if (!srcProj || !dstOrgId || dstOrgId === ctx.cloudOrgId) {
            if (statusEl) statusEl.textContent = "Select a source repository and a different administered destination organization.";
            return;
          }
          var res = await edgePost("policy-templates", {
            operation: "export",
            source_organization_id: ctx.orgId,
            source_project_id: srcProj,
            target_organization_id: dstOrgId
          }, orgReqOpts(ctx));
          if (!isActiveContext(ctx)) return;
          exportedTemplate = res.template || res;
          if (statusEl) statusEl.textContent = "Exported policy template from " + srcProj + " for destination " + dstOrgId + ".";
          syncActionStates();
        });
      }

      var previewTplBtn = byId("admin-preview-template-btn");
      if (previewTplBtn) {
        previewTplBtn.onclick = withOrgLock(async function (ctx) {
          var dstProjInput = byId("admin-template-target-project");
          var statusEl = byId("admin-template-status");
          var targetProj = dstProjInput ? dstProjInput.value.trim() : "";
          if (!exportedTemplate || !targetProj) {
            if (statusEl) statusEl.textContent = "Export a policy template and specify target repository first.";
            return;
          }
          var res = await edgePost("policy-templates", {
            operation: "preview",
            template: exportedTemplate,
            target_project_id: targetProj
          }, orgReqOpts(ctx));
          if (!isActiveContext(ctx)) return;
          if (statusEl) statusEl.textContent = "Preview ready for " + targetProj + " (" + (res.status || "preview_ready") + ").";
        });
      }

      var importTplBtn = byId("admin-import-template-btn");
      if (importTplBtn) {
        importTplBtn.onclick = withOrgLock(async function (ctx) {
          var dstProjInput = byId("admin-template-target-project");
          var statusEl = byId("admin-template-status");
          var targetProj = dstProjInput ? dstProjInput.value.trim() : "";
          if (!exportedTemplate || !targetProj) {
            if (statusEl) statusEl.textContent = "Export a policy template and specify target repository first.";
            return;
          }
          await edgePost("policy-templates", {
            operation: "import",
            template: exportedTemplate,
            target_project_id: targetProj
          }, orgReqOpts(ctx));
          if (!isActiveContext(ctx)) return;
          exportedTemplate = null;
          if (statusEl) statusEl.textContent = "Applied repository policy template to " + targetProj + " (seats and governance data untouched).";
          await loadPolicyTemplates(ctx);
        });
      }

      var setRecBtn = byId("admin-set-recovery-contact-btn");
      if (setRecBtn) {
        setRecBtn.onclick = withOrgLock(async function (ctx) {
          var inputEl = byId("admin-recovery-contact-input");
          var statusEl = byId("admin-recovery-status");
          var contactUuid = inputEl ? inputEl.value.trim() : "";
          if (!flow.UUID_PATTERN.test(contactUuid)) {
            if (statusEl) statusEl.textContent = "Enter a valid Cloud Account UUID for the recovery contact.";
            return;
          }
          try {
            await edgePost("org-recovery", {
              operation: "set_recovery_contact",
              organization_id: ctx.orgId,
              contact_account_id: contactUuid,
              expected_revision: recoveryRevision
            }, orgReqOpts(ctx));
            if (!isActiveContext(ctx)) return;
            if (statusEl) statusEl.textContent = "Designated recovery contact saved.";
            await loadRecoverySection(ctx);
          } catch (error) {
            if ((error && (error.name === "AbortError" || error.status === 401)) || isAdminRevocationError(error) || !isActiveContext(ctx)) throw error;
            if (isRevisionConflictError(error)) {
              if (statusEl) statusEl.textContent = "Concurrent revision conflict (409). Refreshing authoritative recovery state…";
              await loadRecoverySection(ctx);
              if (isActiveContext(ctx) && statusEl) {
                statusEl.textContent = "Concurrent revision conflict detected; reloaded authoritative recovery revision " + recoveryRevision + ".";
              }
              return;
            }
            if (statusEl) statusEl.textContent = "Recovery contact update failed (" + (error && error.message ? error.message : "error") + ").";
          }
        });
      }

      var clearRecBtn = byId("admin-clear-recovery-contact-btn");
      if (clearRecBtn) {
        clearRecBtn.onclick = withOrgLock(async function (ctx) {
          var statusEl = byId("admin-recovery-status");
          try {
            await edgePost("org-recovery", {
              operation: "clear_recovery_contact",
              organization_id: ctx.orgId,
              expected_revision: recoveryRevision
            }, orgReqOpts(ctx));
            if (!isActiveContext(ctx)) return;
            if (statusEl) statusEl.textContent = "Cleared secondary recovery contact.";
            await loadRecoverySection(ctx);
          } catch (error) {
            if ((error && (error.name === "AbortError" || error.status === 401)) || isAdminRevocationError(error) || !isActiveContext(ctx)) throw error;
            if (isRevisionConflictError(error)) {
              if (statusEl) statusEl.textContent = "Concurrent revision conflict (409). Refreshing authoritative recovery state…";
              await loadRecoverySection(ctx);
              if (isActiveContext(ctx) && statusEl) {
                statusEl.textContent = "Concurrent revision conflict detected; reloaded authoritative recovery revision " + recoveryRevision + ".";
              }
              return;
            }
            if (statusEl) statusEl.textContent = "Recovery contact clear failed (" + (error && error.message ? error.message : "error") + ").";
          }
        });
      }

      var refreshRecBtn = byId("admin-refresh-recovery-btn");
      if (refreshRecBtn) refreshRecBtn.onclick = withOrgLock(function (ctx) { return loadRecoverySection(ctx); });

      var metricSel = byId("admin-limit-metric");
      if (metricSel) metricSel.onchange = syncLimitInputs;

      var refreshLimitsBtn = byId("admin-refresh-limits-btn");
      if (refreshLimitsBtn) refreshLimitsBtn.onclick = withOrgLock(function (ctx) { return loadResourceLimits(ctx); });

      var saveLimitBtn = byId("admin-save-limit-btn");
      if (saveLimitBtn) {
        saveLimitBtn.onclick = withOrgLock(async function (ctx) {
          var list = limitsSnapshot && Array.isArray(limitsSnapshot.metrics) ? limitsSnapshot.metrics : [];
          var sel = byId("admin-limit-metric");
          var selected = list.find(function (x) { return sel && String(x.metric) === sel.value; }) || list[0];
          var statusEl = byId("admin-limit-save-status");
          if (!selected) return;
          var rawCap = (byId("admin-limit-cap") ? byId("admin-limit-cap").value : "").trim();
          var opLimit = rawCap === "" ? null : Number(rawCap);
          var warnPct = Number(byId("admin-limit-warn") ? byId("admin-limit-warn").value : 80);
          var critPct = Number(byId("admin-limit-crit") ? byId("admin-limit-crit").value : 95);
          var notifyFlags = Number(byId("admin-limit-notify") ? byId("admin-limit-notify").value : 1);
          if ((opLimit !== null && (!Number.isSafeInteger(opLimit) || opLimit < 1)) ||
              !Number.isSafeInteger(warnPct) || warnPct < 1 || warnPct > 99 ||
              !Number.isSafeInteger(critPct) || critPct < 2 || critPct > 100 ||
              warnPct >= critPct || !Number.isSafeInteger(notifyFlags) || notifyFlags < 0 || notifyFlags > 7) {
            if (statusEl) statusEl.textContent = "Invalid limit or threshold values.";
            return;
          }
          try {
            var updated = await edgePost("resource-limits", {
              action: "set_limit",
              organization_id: ctx.orgId,
              metric: selected.metric,
              expected_revision: selected.revision || 0,
              operating_limit: opLimit,
              warning_pct: warnPct,
              critical_pct: critPct,
              notify_flags: notifyFlags
            }, orgReqOpts(ctx));
            if (!isActiveContext(ctx)) return;
            renderResourceLimits(ctx, updated);
            if (statusEl) statusEl.textContent = "Saved limit for " + selected.key + ".";
          } catch (error) {
            if ((error && (error.name === "AbortError" || error.status === 401)) || isAdminRevocationError(error) || !isActiveContext(ctx)) throw error;
            if (isRevisionConflictError(error)) {
              if (statusEl) statusEl.textContent = "Concurrent revision conflict (409). Refreshing authoritative resource limits…";
              await loadResourceLimits(ctx);
              if (isActiveContext(ctx) && statusEl) {
                statusEl.textContent = "Concurrent revision conflict detected; reloaded authoritative resource limits.";
              }
              return;
            }
            if (statusEl) statusEl.textContent = "Limit update failed (" + (error && error.message ? error.message : "error") + ").";
          }
        });
      }

      var resetLimitBtn = byId("admin-reset-limit-btn");
      if (resetLimitBtn) {
        resetLimitBtn.onclick = withOrgLock(async function (ctx) {
          var list = limitsSnapshot && Array.isArray(limitsSnapshot.metrics) ? limitsSnapshot.metrics : [];
          var sel = byId("admin-limit-metric");
          var selected = list.find(function (x) { return sel && String(x.metric) === sel.value; }) || list[0];
          var statusEl = byId("admin-limit-save-status");
          if (!selected) return;
          try {
            var updated = await edgePost("resource-limits", {
              action: "reset_limit",
              organization_id: ctx.orgId,
              metric: selected.metric,
              expected_revision: selected.revision || 0
            }, orgReqOpts(ctx));
            if (!isActiveContext(ctx)) return;
            renderResourceLimits(ctx, updated);
            if (statusEl) statusEl.textContent = "Reset " + selected.key + " to default ceiling.";
          } catch (error) {
            if ((error && (error.name === "AbortError" || error.status === 401)) || isAdminRevocationError(error) || !isActiveContext(ctx)) throw error;
            if (isRevisionConflictError(error)) {
              if (statusEl) statusEl.textContent = "Concurrent revision conflict (409). Refreshing authoritative resource limits…";
              await loadResourceLimits(ctx);
              if (isActiveContext(ctx) && statusEl) {
                statusEl.textContent = "Concurrent revision conflict detected; reloaded authoritative resource limits.";
              }
              return;
            }
            if (statusEl) statusEl.textContent = "Limit reset failed (" + (error && error.message ? error.message : "error") + ").";
          }
        });
      }

      function parseSpendCapCents() {
        var raw = (byId("admin-overage-cap-usd") ? byId("admin-overage-cap-usd").value : "").trim();
        var num = Number(raw);
        if (!raw || !Number.isFinite(num) || num <= 0) return null;
        var cents = Math.round(num * 100);
        if (!Number.isSafeInteger(cents) || cents < 1 || cents > 100000000) return null;
        return cents;
      }

      var overagesEnableBtn = byId("admin-overages-enable-btn");
      if (overagesEnableBtn) {
        overagesEnableBtn.onclick = withOrgLock(async function (ctx) {
          var statusEl = byId("admin-overage-save-status");
          var capCents = parseSpendCapCents();
          var checked = Boolean(byId("admin-overage-terms-check") && byId("admin-overage-terms-check").checked);
          if (!capCents || !checked) {
            if (statusEl) statusEl.textContent = "Enter a valid monthly spend cap and accept the V7 paid overage terms.";
            return;
          }
          var rev = limitsSnapshot && limitsSnapshot.paid_overages ? limitsSnapshot.paid_overages.revision : undefined;
          try {
            var updated = await edgePost("billing-overage-policy", Object.assign({
              action: "enable",
              organization_id: ctx.orgId,
              monthly_spend_cap_cents: capCents,
              accepted_terms: true,
              terms_version: TERMS_VERSION
            }, Number.isSafeInteger(rev) ? { expected_revision: rev } : {}), orgReqOpts(ctx));
            if (!isActiveContext(ctx)) return;
            renderResourceLimits(ctx, updated);
            if (statusEl) statusEl.textContent = "Enabled paid overages with " + formatCents(capCents) + " monthly spend cap.";
          } catch (error) {
            if ((error && (error.name === "AbortError" || error.status === 401)) || isAdminRevocationError(error) || !isActiveContext(ctx)) throw error;
            if (isRevisionConflictError(error)) {
              if (statusEl) statusEl.textContent = "Concurrent revision conflict (409). Refreshing authoritative overage policy…";
              await loadResourceLimits(ctx);
              if (isActiveContext(ctx) && statusEl) {
                statusEl.textContent = "Concurrent revision conflict detected; reloaded authoritative overage policy.";
              }
              return;
            }
            if (statusEl) statusEl.textContent = "Enable overages failed (" + (error && error.message ? error.message : "error") + ").";
          }
        });
      }

      var overagesUpdateBtn = byId("admin-overages-update-btn");
      if (overagesUpdateBtn) {
        overagesUpdateBtn.onclick = withOrgLock(async function (ctx) {
          var statusEl = byId("admin-overage-save-status");
          var capCents = parseSpendCapCents();
          if (!capCents) {
            if (statusEl) statusEl.textContent = "Enter a valid monthly spend cap.";
            return;
          }
          var rev = limitsSnapshot && limitsSnapshot.paid_overages ? limitsSnapshot.paid_overages.revision : undefined;
          try {
            var updated = await edgePost("billing-overage-policy", Object.assign({
              action: "update_cap",
              organization_id: ctx.orgId,
              monthly_spend_cap_cents: capCents
            }, Number.isSafeInteger(rev) ? { expected_revision: rev } : {}), orgReqOpts(ctx));
            if (!isActiveContext(ctx)) return;
            renderResourceLimits(ctx, updated);
            if (statusEl) statusEl.textContent = "Updated monthly spend cap to " + formatCents(capCents) + ".";
          } catch (error) {
            if ((error && (error.name === "AbortError" || error.status === 401)) || isAdminRevocationError(error) || !isActiveContext(ctx)) throw error;
            if (isRevisionConflictError(error)) {
              if (statusEl) statusEl.textContent = "Concurrent revision conflict (409). Refreshing authoritative overage policy…";
              await loadResourceLimits(ctx);
              if (isActiveContext(ctx) && statusEl) {
                statusEl.textContent = "Concurrent revision conflict detected; reloaded authoritative overage policy.";
              }
              return;
            }
            if (statusEl) statusEl.textContent = "Update spend cap failed (" + (error && error.message ? error.message : "error") + ").";
          }
        });
      }

      var overagesRevokeBtn = byId("admin-overages-revoke-btn");
      if (overagesRevokeBtn) {
        overagesRevokeBtn.onclick = withOrgLock(async function (ctx) {
          var statusEl = byId("admin-overage-save-status");
          var rev = limitsSnapshot && limitsSnapshot.paid_overages ? limitsSnapshot.paid_overages.revision : undefined;
          try {
            var updated = await edgePost("billing-overage-policy", Object.assign({
              action: "revoke",
              organization_id: ctx.orgId
            }, Number.isSafeInteger(rev) ? { expected_revision: rev } : {}), orgReqOpts(ctx));
            if (!isActiveContext(ctx)) return;
            renderResourceLimits(ctx, updated);
            if (statusEl) statusEl.textContent = "Revoked paid resource overages ($0 overage exposure restored).";
          } catch (error) {
            if ((error && (error.name === "AbortError" || error.status === 401)) || isAdminRevocationError(error) || !isActiveContext(ctx)) throw error;
            if (isRevisionConflictError(error)) {
              if (statusEl) statusEl.textContent = "Concurrent revision conflict (409). Refreshing authoritative overage policy…";
              await loadResourceLimits(ctx);
              if (isActiveContext(ctx) && statusEl) {
                statusEl.textContent = "Concurrent revision conflict detected; reloaded authoritative overage policy.";
              }
              return;
            }
            if (statusEl) statusEl.textContent = "Revoke overages failed (" + (error && error.message ? error.message : "error") + ").";
          }
        });
      }

      var portalBtn = byId("admin-billing-portal-btn");
      if (portalBtn) {
        portalBtn.onclick = withOrgLock(async function (ctx) {
          var detailEl = byId("admin-billing-detail");
          var res = await edgePost("billing-portal", { organization_id: ctx.orgId }, orgReqOpts(ctx));
          if (!isActiveContext(ctx)) return;
          if (!res || !flow.isAllowedCheckoutUrl(res.portal_url)) {
            if (detailEl) detailEl.textContent = "Rejected untrusted billing portal redirect.";
            throw new Error("invalid_response");
          }
          navigateFn(res.portal_url);
        });
      }

      var cancelOrderBtn = byId("admin-cancel-order-btn");
      if (cancelOrderBtn) {
        cancelOrderBtn.onclick = withOrgLock(async function (ctx) {
          if (!pendingBillingOrder || !pendingBillingOrder.order_id) return;
          await edgePost("billing-manage", {
            action: "order_cancel",
            organization_id: ctx.orgId,
            order_id: pendingBillingOrder.order_id
          }, orgReqOpts(ctx));
          if (!isActiveContext(ctx)) return;
          await loadBillingSection(ctx);
        });
      }

      var refreshDevicesBtn = byId("admin-refresh-devices-btn");
      if (refreshDevicesBtn) {
        refreshDevicesBtn.onclick = function () {
          if (!activeOrg || !currentUser || !session) return;
          loadDevices({
            sessionEpoch: sessionEpoch,
            generation: renderGeneration,
            signal: orgAbortController ? orgAbortController.signal : null,
            cloudOrgId: activeOrg.cloud_org_id,
            orgId: activeOrg.id,
            actor: currentUser.id,
            bearer: session.access_token
          }).catch(function () {});
        };
      }
    }

    async function init() {
      if (flowOk) {
        var coherence = flow.checkPageCoherence({
          document: doc,
          requiredIds: ["admin-auth-gate", "admin-denied-panel", "admin-workspace", "admin-status"]
        });
        if (!coherence.ok) {
          skewBlocked = true;
          skewReason = coherence.reason || "html_js_skew";
        }
      }
      if (skewBlocked) {
        if (flowOk) {
          flow.scrubSensitiveLocation(winLocation, winHistory, { stripAllHash: true });
        } else if (winLocation && winHistory && typeof winHistory.replaceState === "function") {
          try { winHistory.replaceState(null, "", "/admin/"); } catch (_) {}
        }
        hideAllProtectedPanels();
        var ghBtn = byId("admin-auth-github");
        var googleBtn = byId("admin-auth-google");
        if (ghBtn) ghBtn.disabled = true;
        if (googleBtn) googleBtn.disabled = true;
        setStatus("Client asset or HTML/JS version skew detected (" + (skewReason || "mismatch") + "). Reload the page to continue safely.", true);
        return;
      }

      coherenceChannel.announceReady();
      if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
        window.addEventListener("pagehide", function () {
          coherenceChannel.close();
        });
        window.addEventListener("pageshow", function (ev) {
          if (ev && ev.persisted) {
            busy = false;
            syncAuthGateUi();
          }
        });
      }

      bindEvents();
      syncAuthGateUi();
      var mySessionEpoch = ++sessionEpoch;
      resetSessionAbortController();
      try {
        await processIncomingUrlAndSession(mySessionEpoch);
      } catch (error) {
        if (error && error.name === "AbortError") return;
        if (mySessionEpoch !== sessionEpoch) return;
        try { syncAuthGateUi(); } catch (_) {}
        var initRef = formatSupportRef(error, null);
        var initWait = error && Number.isSafeInteger(error.retryAfterSec) && error.retryAfterSec > 0
          ? " Wait " + error.retryAfterSec + "s before retrying."
          : "";
        setStatus("Organization Admin could not be initialized (" + (error && error.message ? error.message : "error") + ")." + initWait + (initRef ? " " + initRef + "." : ""), true);
      }
    }

    return {
      init: init,
      beginAuth: beginAuth,
      switchOrganization: async function (cloudOrgId) {
        var target = adminOrgs.find(function (o) { return o.cloud_org_id === cloudOrgId; });
        if (!target) throw new Error("organization_access_denied");
        requestedOrgLocator = target.scm_owner_slug || target.cloud_org_id;
        await activateOrganization(target, sessionEpoch);
      },
      signOut: function () {
        var btn = byId("admin-sign-out-btn");
        if (btn && typeof btn.onclick === "function") btn.onclick();
      },
      close: function () { abortAllInFlight(); coherenceChannel.close(); },
      getState: function () {
        return {
          authenticated: Boolean(!skewBlocked && flowOk && profile && flow.validateSessionRecord(session, profile.projectOrigin, nowSec())),
          skewBlocked: skewBlocked,
          skewReason: skewReason,
          requestedOrgLocator: requestedOrgLocator,
          activeOrg: activeOrg ? Object.assign({}, activeOrg) : null,
          adminOrgIds: adminOrgs.map(function (o) { return o.cloud_org_id; }),
          orgProjectCount: orgProjects.length,
          billingReady: billingReady,
          routeMode: routeMode,
          adminRevision: adminRevision,
          recoveryRevision: recoveryRevision,
          sessionEpoch: sessionEpoch,
          renderGeneration: renderGeneration
        };
      }
    };
  }

  root.DecapodAdminApp = Object.freeze({
    createAdminController: createAdminController
  });

  if (typeof document !== "undefined" && typeof document.getElementById === "function" && document.getElementById("admin-app")) {
    var app = createAdminController({});
    app.init().catch(function () {});
  }
})(typeof globalThis !== "undefined" ? globalThis : window);
