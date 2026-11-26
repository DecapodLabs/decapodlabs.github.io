(function (root) {
  "use strict";

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
      typeof candidate.parseRepoSlug === "function" &&
      typeof candidate.parseRepoSearch === "function" &&
      typeof candidate.parseSeatParam === "function" &&
      typeof candidate.parseBillingParam === "function" &&
      typeof candidate.parseContinuationParam === "function" &&
      typeof candidate.parseSafeReturnParam === "function" &&
      typeof candidate.validateSessionRecord === "function" &&
      typeof candidate.hasHostileFragmentTokens === "function" &&
      typeof candidate.listVerifiedProviders === "function" &&
      typeof candidate.hasVerifiedProvider === "function" &&
      typeof candidate.classifyAccessState === "function" &&
      typeof candidate.extractCorrelationRef === "function" &&
      typeof candidate.parseRetryAfterSeconds === "function" &&
      typeof candidate.createBoundedPoller === "function" &&
      typeof candidate.buildAuthAuthorizeUrl === "function" &&
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

  function createSignupController(deps) {
    var d = deps || {};
    var flow = Object.prototype.hasOwnProperty.call(d, "flow") ? d.flow : root.DecapodCloudFlow;
    var doc = d.document || root.document;
    var winLocation = d.location || root.location;
    var winHistory = d.history || (typeof history !== "undefined" ? history : null);
    var storage = d.sessionStorage || (typeof sessionStorage !== "undefined" ? sessionStorage : null);
    var fetchFn = d.fetch || (typeof fetch !== "undefined" ? fetch.bind(root) : null);
    var navigateFn = d.navigateFn || function (url) { winLocation.assign(url); };
    var nowSec = d.nowSec || function () { return Math.floor(Date.now() / 1000); };
    var sleepFn = d.sleepFn;
    var quoteDebounceMs = typeof d.quoteDebounceMs === "number" ? d.quoteDebounceMs : 220;

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

    var preselectedRepo = null;
    var preferredBilling = "month";
    var preferredSeats = 1;
    var checkoutReturned = false;
    var checkoutCanceled = false;
    var activeContinuation = null;

    var activeProjectId = null;
    var activeOrganizationId = null;
    var activeQuoteOrder = null;
    var quoteRequestId = null;
    var quotePayloadKey = null;
    var quoteDirty = false;
    var quoteTimer = null;
    var checkoutRequestId = null;
    var checkoutRequestKey = null;
    var enrollRequestId = null;
    var enrollRepoSlug = null;
    var githubReposCache = [];
    var sessionEpoch = 0;
    var viewGeneration = 0;
    var pollGeneration = 0;
    var quoteGeneration = 0;
    var sessionAbortController = null;
    var viewAbortController = null;
    var busy = false;
    var enrollInFlight = false;
    var quoteInFlight = false;
    var checkoutInFlight = false;
    var portalInFlight = false;
    var siblingCheckout = null;
    var backendAuthorized = false;
    var lastStateKind = null;
    var lastReadyMeta = null;

    var coherenceChannel = flowOk
      ? flow.createCoherenceChannel({
          BroadcastChannel: d.broadcastChannel,
          onSkew: function () {
            skewBlocked = true;
            skewReason = "multi_tab_release_skew";
            invalidateSessionState("A newer release of Decapod Cloud is active in another tab. Please reload this page.", true, false);
          },
          onAuthInvalidated: function (msg) {
            if (msg && msg.projectOrigin && profile && msg.projectOrigin !== profile.projectOrigin) return;
            invalidateSessionState("You were signed out in another tab. Sign in again to continue.", false, false);
          },
          onCheckoutEvent: function (msg) {
            if (!msg || skewBlocked || !session) return;
            if (msg.projectOrigin && profile && msg.projectOrigin !== profile.projectOrigin) return;
            if (msg.type === "checkout_started") {
              if (activeProjectId && msg.projectId === activeProjectId) {
                siblingCheckout = {
                  organizationId: msg.organizationId || null,
                  projectId: msg.projectId,
                  orderId: msg.orderId || null,
                  requestId: msg.requestId || null
                };
                var cBtn = byId("checkout-btn");
                if (cBtn) cBtn.disabled = true;
                setStatus("Checkout is already open in another tab for this repository. Finish there or refresh before starting another.", false);
              }
              return;
            }
            if (msg.type === "checkout_returned" || msg.type === "fulfillment_status") {
              if (siblingCheckout && (!msg.projectId || siblingCheckout.projectId === msg.projectId)) {
                siblingCheckout = null;
              }
              if (activeOrganizationId && activeProjectId && (!msg.projectId || msg.projectId === activeProjectId) && !backendAuthorized) {
                inspectProjectAccess(activeOrganizationId, activeProjectId, preselectedRepo || activeProjectId, viewGeneration)
                  .catch(function () {});
              }
            }
          }
        })
      : { announceReady: function () {}, broadcastAuthInvalidated: function () {}, broadcastIntentSync: function () {}, broadcastCheckoutEvent: function () {}, close: function () {} };

    function makeRequestId() {
      return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : flow.randomSecret();
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

    function resetViewAbortController() {
      if (viewAbortController) {
        try { viewAbortController.abort(); } catch (_) {}
      }
      viewAbortController = typeof AbortController === "function" ? new AbortController() : null;
      return viewAbortController;
    }

    function abortAllInFlight() {
      if (quoteTimer !== null) {
        clearTimeout(quoteTimer);
        quoteTimer = null;
      }
      if (viewAbortController) {
        try { viewAbortController.abort(); } catch (_) {}
        viewAbortController = null;
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

    function isActiveView(expectedSessionEpoch, expectedViewGen) {
      return Boolean(
        !skewBlocked &&
        expectedSessionEpoch === sessionEpoch &&
        expectedViewGen === viewGeneration &&
        session &&
        profile &&
        flow.validateSessionRecord(session, profile.projectOrigin, nowSec())
      );
    }

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

    function savePendingIntent() {
      if (!storage) return;
      try {
        if (preselectedRepo) {
          storage.setItem("decapod:pending-repo-intent", preselectedRepo);
        } else {
          storage.removeItem("decapod:pending-repo-intent");
        }
        storage.setItem("decapod:pending-checkout-intent", JSON.stringify({
          repo: preselectedRepo || null,
          billing: preferredBilling === "year" ? "year" : "month",
          seats: preferredSeats
        }));
      } catch (_) {}
    }

    function clearPendingIntent() {
      preselectedRepo = null;
      if (!storage) return;
      try {
        storage.removeItem("decapod:pending-repo-intent");
        storage.removeItem("decapod:pending-checkout-intent");
      } catch (_) {}
    }

    function setStep(activeStage) {
      var stages = ["auth", "repo", "review", "ready"];
      var activeIdx = stages.indexOf(activeStage);
      for (var i = 0; i < stages.length; i++) {
        var pill = byId("step-pill-" + stages[i]);
        if (!pill) continue;
        var done = activeStage === "ready" ? i <= 3 : (activeIdx > i);
        var active = activeStage !== "ready" && i === activeIdx;
        pill.classList.toggle("is-done", done);
        pill.classList.toggle("is-active", active);
      }
    }

    function setStatus(text, isError) {
      var el = byId("signup-status");
      if (!el) return;
      if (!text) {
        el.textContent = "";
        el.hidden = true;
        el.classList.remove("is-error");
        return;
      }
      el.textContent = text;
      el.classList.toggle("is-error", Boolean(isError));
      el.hidden = false;
    }

    function setBanner(kind, title, note) {
      var banner = byId("signup-repo-banner");
      var titleEl = byId("signup-repo-banner-title");
      var noteEl = byId("signup-repo-banner-note");
      if (!banner || !titleEl || !noteEl) return;
      if (!kind) {
        banner.hidden = true;
        titleEl.textContent = "";
        noteEl.textContent = "";
        return;
      }
      banner.classList.toggle("is-invalid", kind === "invalid");
      titleEl.textContent = title;
      noteEl.textContent = note || "";
      banner.hidden = false;
    }

    function hideAllProtectedPanels() {
      backendAuthorized = false;
      var ids = ["account-bar", "step-identity", "step-org-repo", "step-state", "step-checkout", "step-ready", "quote-summary"];
      for (var i = 0; i < ids.length; i++) {
        var el = byId(ids[i]);
        if (el) el.hidden = true;
      }
      var checkoutBtn = byId("checkout-btn");
      if (checkoutBtn) checkoutBtn.disabled = true;
    }

    function clearConfidentialUi() {
      hideAllProtectedPanels();
      var summary = byId("account-summary");
      if (summary) summary.textContent = "";
      var suggestions = byId("repo-suggestions");
      if (suggestions) suggestions.replaceChildren();
      var checkoutBtn = byId("checkout-btn");
      if (checkoutBtn) checkoutBtn.disabled = true;
      var quoteErr = byId("quote-error-note");
      if (quoteErr) { quoteErr.hidden = true; quoteErr.textContent = ""; }
      activeQuoteOrder = null;
      activeProjectId = null;
      activeOrganizationId = null;
      lastReadyMeta = null;
    }

    function invalidateSessionState(statusMessage, isError, broadcast) {
      sessionEpoch++;
      viewGeneration++;
      pollGeneration++;
      quoteGeneration++;
      abortAllInFlight();
      busy = false;
      enrollInFlight = false;
      quoteInFlight = false;
      checkoutInFlight = false;
      portalInFlight = false;
      siblingCheckout = null;
      backendAuthorized = false;
      lastStateKind = null;
      checkoutReturned = false;
      checkoutCanceled = false;
      activeContinuation = null;
      storeRemove("flow");
      storeRemove("session");
      storeRemove("checkout_pending");
      storeRemove("checkout_return_state");
      storeRemove("checkout_req");
      storeRemove("quote_req");
      storeRemove("enroll_req");
      session = null;
      currentUser = null;
      accountSnapshot = null;
      inMemoryProviderToken = null;
      pendingStepupProvider = null;
      quoteRequestId = null;
      quotePayloadKey = null;
      quoteDirty = false;
      checkoutRequestId = null;
      checkoutRequestKey = null;
      enrollRequestId = null;
      enrollRepoSlug = null;
      githubReposCache = [];
      var repoInput = byId("repo-input");
      if (repoInput) repoInput.value = "";
      syncAuthGateUi();
      if (broadcast !== false && flowOk && profile) {
        coherenceChannel.broadcastAuthInvalidated(profile.projectOrigin);
      }
      if (statusMessage) {
        setStatus(statusMessage, Boolean(isError));
      } else {
        setStatus("", false);
      }
    }

    function syncAuthGateUi() {
      var signedIn = Boolean(
        !skewBlocked &&
        flowOk &&
        profile &&
        flow.validateSessionRecord(session, profile.projectOrigin, nowSec())
      );
      var authGate = byId("auth-gate");
      if (authGate) authGate.hidden = signedIn;
      var cancelBtn = byId("cancel-auth-btn");
      if (cancelBtn) cancelBtn.hidden = skewBlocked || !storeGet("flow", 8192);
      if (!signedIn) {
        clearConfidentialUi();
        setStep("auth");
      }
      var providers = profile ? profile.authProviders : { github: true, google: false };
      var ghBtn = byId("auth-github");
      var googleBtn = byId("auth-google");
      if (ghBtn) {
        ghBtn.hidden = providers.github !== true;
        ghBtn.disabled = skewBlocked || busy || providers.github !== true;
      }
      if (googleBtn) {
        googleBtn.hidden = providers.google !== true;
        googleBtn.disabled = skewBlocked || busy || providers.google !== true;
      }
      var noteEl = byId("auth-provider-note");
      if (noteEl) {
        if (skewBlocked) {
          noteEl.textContent = "A newer version is available. Reload this page before signing in.";
        } else {
          noteEl.textContent = "";
        }
      }
    }

    function formatSupportRef(err, fallbackId) {
      var ref = (err && typeof err.correlationId === "string" && err.correlationId) ||
        (typeof fallbackId === "string" && fallbackId ? fallbackId : null);
      return ref ? "Ref: " + ref : "";
    }

    function formatMoney(cents) {
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: Number(cents) % 100 === 0 ? 0 : 2,
        maximumFractionDigits: 2
      }).format(Number(cents || 0) / 100);
    }

    function extractGitHubHandle(user) {
      if (!user || typeof user !== "object") return "Verified on GitHub";
      if (user.user_metadata && typeof user.user_metadata.user_name === "string" && user.user_metadata.user_name.trim()) {
        return "@" + user.user_metadata.user_name.trim();
      }
      if (Array.isArray(user.identities)) {
        for (var i = 0; i < user.identities.length; i++) {
          var ident = user.identities[i];
          if (ident && ident.provider === "github" && ident.identity_data) {
            var uname = ident.identity_data.user_name || ident.identity_data.preferred_username;
            if (typeof uname === "string" && uname.trim()) {
              return "@" + uname.trim();
            }
          }
        }
      }
      return flow.hasVerifiedProvider(user, "github") ? "Verified on GitHub" : "Signed in";
    }

    function renderAccountBar() {
      var bar = byId("account-bar");
      var summary = byId("account-summary");
      if (!bar || !summary || !currentUser) return;
      summary.textContent = extractGitHubHandle(currentUser);
      bar.hidden = false;
    }

    function showDegradedApiState(err, targetRef, allowRetry) {
      backendAuthorized = false;
      var code = (err && err.message) ? err.message : "service_unavailable";
      var ref = formatSupportRef(err, targetRef);
      if (err && (err.status === 403 || code === "admin_required" || code === "organization_access_denied" || code === "forbidden")) {
        showFailClosedState(
          "access_denied",
          "Access restricted",
          "Organization administrator access required",
          "Your signed-in account does not have permission to purchase or manage subscriptions for this repository.",
          ref,
          false,
          true,
          false
        );
        setStatus("Administrator permission is required for this repository." + (ref ? " " + ref : ""), true);
        return;
      }
      if (err && (err.status === 429 || code === "rate_limited")) {
        var waitSec = Number.isSafeInteger(err.retryAfterSec) && err.retryAfterSec > 0
          ? "Please wait " + err.retryAfterSec + " seconds before trying again."
          : "Please wait a moment before trying again.";
        showFailClosedState(
          "rate_limited",
          "Temporarily busy",
          "Too many requests",
          waitSec,
          ref,
          allowRetry !== false,
          true,
          false
        );
        setStatus("Too many requests. " + waitSec + (ref ? " " + ref : ""), true);
        return;
      }
      showFailClosedState(
        "backend_unavailable",
        "Connection issue",
        "Could not reach Decapod Cloud",
        "Your session is intact and no payment was started. Please check your connection and try again.",
        ref,
        allowRetry !== false,
        true,
        false
      );
      setStatus("Could not reach Decapod Cloud." + (ref ? " " + ref : ""), true);
    }

    async function apiRequest(url, body, bearer, method, reqOpts) {
      var opts = reqOpts || {};
      var mySessionEpoch = typeof opts.sessionEpoch === "number" ? opts.sessionEpoch : sessionEpoch;
      var linked = createLinkedSignal(12000, opts.signal || null);
      var headers = { apikey: profile.publishableKey };
      if (bearer) headers.Authorization = "Bearer " + bearer;
      if (body !== undefined) headers["Content-Type"] = "application/json";
      var res;
      try {
        res = await fetchFn(url, {
          method: method || (body !== undefined ? "POST" : "GET"),
          headers: headers,
          body: body !== undefined ? JSON.stringify(body) : undefined,
          credentials: "omit",
          cache: "no-store",
          redirect: "error",
          signal: linked.signal
        });
      } catch (fetchErr) {
        linked.cleanup();
        if (fetchErr && fetchErr.name === "AbortError") throw createAbortError();
        var netErr = new Error("service_unavailable");
        netErr.status = 503;
        throw netErr;
      }
      linked.cleanup();
      if (mySessionEpoch !== sessionEpoch || (opts.signal && opts.signal.aborted)) {
        throw createAbortError();
      }
      if (!res.ok) {
        var errBody = await res.json().catch(function () { return {}; });
        var code = (errBody.error && errBody.error.code) || errBody.error_code || errBody.msg || ("http_" + res.status);
        var e = new Error(code);
        e.status = res.status;
        e.correlationId = flow.extractCorrelationRef(res, errBody, body && body.request_id ? body.request_id : null);
        if (res.status === 429) {
          var retrySec = flow.parseRetryAfterSeconds(res.headers && res.headers.get ? res.headers.get("retry-after") : null);
          if (retrySec) {
            e.retryAfterSec = retrySec;
            e.retryAfterMs = retrySec * 1000;
          }
        }
        throw e;
      }
      var resVersion = res.headers && typeof res.headers.get === "function"
        ? res.headers.get("decapod-cloud-contract-version")
        : null;
      if (!flow.isSupportedApiContractVersion(resVersion)) {
        skewBlocked = true;
        skewReason = "api_contract_mismatch";
        throw new Error("contract_version_mismatch");
      }
      var parsed = await res.json();
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed) &&
          !flow.isSupportedApiContractVersion(parsed.contract_version)) {
        skewBlocked = true;
        skewReason = "api_contract_payload_mismatch";
        throw new Error("contract_version_mismatch");
      }
      return parsed;
    }

    function requireToken() {
      if (!profile || !flow.validateSessionRecord(session, profile.projectOrigin, nowSec())) {
        session = null;
        storeRemove("session");
        throw new Error("sign_in_required");
      }
      return session.access_token;
    }

    async function edgePost(action, body, reqOpts) {
      var opts = reqOpts || {};
      var mySessionEpoch = typeof opts.sessionEpoch === "number" ? opts.sessionEpoch : sessionEpoch;
      var bearer = requireToken();
      try {
        return await apiRequest(
          profile.apiOrigin + flow.CANONICAL_ONBOARDING_PREFIX + "/" + action,
          Object.assign({ version: 1 }, body || {}),
          bearer,
          "POST",
          { sessionEpoch: mySessionEpoch, signal: opts.signal || null }
        );
      } catch (err) {
        if (err && err.status === 401 && mySessionEpoch === sessionEpoch) {
          invalidateSessionState("Your session expired. Sign in again to continue.", true, true);
        }
        throw err;
      }
    }

    async function fetchUser(bearer, reqOpts) {
      var opts = reqOpts || {};
      var mySessionEpoch = typeof opts.sessionEpoch === "number" ? opts.sessionEpoch : sessionEpoch;
      try {
        var user = await apiRequest(profile.projectOrigin + "/auth/v1/user", undefined, bearer, "GET", {
          sessionEpoch: mySessionEpoch,
          signal: opts.signal || null
        });
        if (!user || !flow.UUID_PATTERN.test(user.id || "") || !Array.isArray(user.identities)) {
          throw new Error("invalid_response");
        }
        return user;
      } catch (err) {
        if (err && err.status === 401 && mySessionEpoch === sessionEpoch && session) {
          invalidateSessionState("Your session expired. Sign in again to continue.", true, true);
        }
        throw err;
      }
    }

    async function beginAuth(provider, kind, repoVerification) {
      if (skewBlocked) {
        setStatus("Reload this page to use the latest version before signing in.", true);
        return;
      }
      if (!profile) throw new Error("service_unavailable");
      if (!flow.isTrustedAuthUrl(profile.authBaseUrl)) throw new Error("untrusted_auth_origin");
      if (kind !== "link" && profile.authProviders && profile.authProviders[provider] === false) {
        setStatus("That sign-in method is currently unavailable.", true);
        return;
      }
      busy = true;
      syncAuthGateUi();
      try {
        savePendingIntent();
        var verifier = flow.randomSecret();
        var nonce = flow.randomSecret();
        var challenge = await flow.sha256Base64Url(verifier);
        var origin = siteOrigin();
        var returnTarget = new URL(origin + "/signup");
        returnTarget.searchParams.set("login_nonce", nonce);

        var flowRecord = {
          version: 1,
          contract_version: flow.CONTRACT_VERSION,
          asset_release: flow.ASSET_RELEASE,
          kind: kind || "sign_in",
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
      } finally {
        busy = false;
        syncAuthGateUi();
      }
    }

    function showIdentityPanel(mode, pendingProvider) {
      hideAllProtectedPanels();
      renderAccountBar();
      setStep("auth");
      var panel = byId("step-identity");
      var heading = byId("identity-heading");
      var msg = byId("identity-message");
      var linkActions = byId("identity-link-actions");
      var qActions = byId("identity-quarantine-actions");
      if (!panel) return;
      if (mode === "quarantine") {
        pendingStepupProvider = pendingProvider || null;
        heading.textContent = "Confirm your sign-in method";
        msg.textContent = "An additional sign-in method (" + (pendingStepupProvider || "provider") +
          ") was attached to your account. Confirm or remove it before continuing.";
        if (linkActions) linkActions.hidden = true;
        if (qActions) qActions.hidden = false;
      } else {
        pendingStepupProvider = null;
        heading.textContent = "Link your GitHub account";
        msg.textContent = "Connect a verified GitHub account to confirm repository ownership before subscribing.";
        if (linkActions) linkActions.hidden = false;
        if (qActions) qActions.hidden = true;
      }
      panel.hidden = false;
    }

    function showFailClosedState(kind, kicker, heading, message, detail, allowRetry, allowChangeRepo, allowResumeCheckout) {
      backendAuthorized = false;
      lastStateKind = kind;
      hideAllProtectedPanels();
      renderAccountBar();
      setStep(kind === "pending_fulfillment" ? "ready" : "review");
      var card = byId("step-state");
      if (!card) return;
      byId("state-kicker").textContent = kicker;
      byId("state-heading").textContent = heading;
      byId("state-message").textContent = message;
      byId("state-detail").textContent = detail || "";
      var retryBtn = byId("state-retry-btn");
      if (retryBtn) retryBtn.hidden = !allowRetry;
      var resumeBtn = byId("state-resume-checkout-btn");
      if (resumeBtn) resumeBtn.hidden = !allowResumeCheckout;
      var changeBtn = byId("state-change-repo-btn");
      if (changeBtn) changeBtn.hidden = !allowChangeRepo;
      card.dataset.stateKind = kind;
      card.hidden = false;
    }

    function showReadyState(projectId, accessStatus, meta) {
      if (!accessStatus || accessStatus.backend_authorized !== true ||
          (accessStatus.status !== "active" && accessStatus.status !== "ready")) {
        throw new Error("invalid_response");
      }
      pollGeneration++;
      hideAllProtectedPanels();
      backendAuthorized = true;
      lastStateKind = "ready";
      siblingCheckout = null;
      checkoutReturned = false;
      checkoutCanceled = false;
      storeRemove("checkout_pending");
      storeRemove("checkout_return_state");
      storeRemove("checkout_req");
      renderAccountBar();
      setStep("ready");

      var card = byId("step-ready");
      var summary = byId("ready-summary");
      if (!card || !summary) return;
      var resolvedProject = resolveDisplayProjectSlug(
        accessStatus.project_id || projectId,
        (accessStatus && accessStatus.project_slug) || (meta && meta.project_slug)
      );
      lastReadyMeta = Object.assign({ project_id: resolvedProject, organization_id: activeOrganizationId }, meta || {});
      var roleLabel = accessStatus.admin ? "organization administrator" : "repository contributor";
      summary.textContent = "Access is active for " + resolvedProject + " (" + roleLabel + ").";

      var detailsDl = byId("ready-details");
      var rRepo = byId("ready-repo");
      var rPlan = byId("ready-plan");
      var rSeats = byId("ready-seats");
      var rRenewalRow = byId("ready-renewal-row");
      var rRenewal = byId("ready-renewal");
      var portalBtn = byId("ready-billing-portal-btn");
      var adminLink = byId("ready-admin-link");
      var portalNote = byId("ready-portal-note");
      if (portalNote) { portalNote.hidden = true; portalNote.textContent = ""; }

      if (detailsDl) detailsDl.hidden = false;
      if (rRepo) rRepo.textContent = resolvedProject;
      if (rPlan) {
        rPlan.textContent = lastReadyMeta.cadence === "year"
          ? "Decapod Cloud · Annual"
          : (lastReadyMeta.cadence === "month" ? "Decapod Cloud · Monthly" : "Decapod Cloud");
      }
      if (rSeats) {
        var seatCount = Number.isSafeInteger(lastReadyMeta.quantity) && lastReadyMeta.quantity > 0
          ? lastReadyMeta.quantity
          : null;
        rSeats.textContent = seatCount ? (seatCount + (seatCount === 1 ? " seat" : " seats")) : "Included";
      }
      if (rRenewalRow && rRenewal) {
        if (typeof lastReadyMeta.paid_until === "string" && Number.isFinite(Date.parse(lastReadyMeta.paid_until))) {
          rRenewal.textContent = new Date(lastReadyMeta.paid_until).toISOString().slice(0, 10);
          rRenewalRow.hidden = false;
        } else {
          rRenewalRow.hidden = true;
        }
      }
      if (portalBtn) {
        portalBtn.hidden = !(activeOrganizationId && (lastReadyMeta.can_manage_billing !== false) && isOrgAdmin(activeOrganizationId));
      }
      if (adminLink) {
        var orgObj = findOrgById(activeOrganizationId);
        var orgSlug = (lastReadyMeta.organization_slug) || (orgObj && (orgObj.scm_owner_slug || orgObj.cloud_org_id)) || null;
        adminLink.href = orgSlug ? ("/admin/?org=" + encodeURIComponent(orgSlug)) : "/admin/";
      }

      card.hidden = false;
      setStatus("", false);
      if (flowOk && profile) {
        coherenceChannel.broadcastCheckoutEvent("fulfillment_status", {
          projectOrigin: profile.projectOrigin,
          organizationId: activeOrganizationId,
          projectId: resolvedProject,
          state: "ready"
        });
      }
    }

    function findOrgById(orgId) {
      if (!orgId || !accountSnapshot || !Array.isArray(accountSnapshot.organizations)) return null;
      var target = String(orgId).toLowerCase();
      return accountSnapshot.organizations.find(function (o) {
        return o && ((typeof o.id === "string" && o.id.toLowerCase() === target) ||
          (typeof o.cloud_org_id === "string" && o.cloud_org_id.toLowerCase() === target));
      }) || null;
    }

    function isOrgAdmin(orgId) {
      var orgs = (accountSnapshot && Array.isArray(accountSnapshot.organizations))
        ? accountSnapshot.organizations
        : [];
      var target = String(orgId || "").toLowerCase();
      return orgs.some(function (o) {
        return o && o.admin === true && ((typeof o.id === "string" && o.id.toLowerCase() === target) ||
          (typeof o.cloud_org_id === "string" && o.cloud_org_id.toLowerCase() === target));
      });
    }

    function findExistingProject(slug) {
      var projects = (accountSnapshot && Array.isArray(accountSnapshot.projects))
        ? accountSnapshot.projects
        : [];
      var target = String(slug || "").toLowerCase();
      return projects.find(function (p) {
        return (typeof p.name === "string" && p.name.toLowerCase() === target) ||
          (typeof p.project_id === "string" && p.project_id.toLowerCase() === target);
      }) || null;
    }

    function resolveDisplayProjectSlug(projectId, explicitSlug) {
      if (typeof explicitSlug === "string" && explicitSlug.trim() && explicitSlug.indexOf("/") !== -1) {
        return explicitSlug.trim();
      }
      var matched = findExistingProject(projectId);
      if (matched && typeof matched.name === "string" && matched.name.trim()) {
        return matched.name.trim();
      }
      return projectId;
    }

    function populateRepoSuggestions() {
      var suggestions = byId("repo-suggestions");
      var repoInput = byId("repo-input");
      if (!suggestions) return;
      suggestions.replaceChildren();
      for (var i = 0; i < githubReposCache.length; i++) {
        var opt = doc.createElement("option");
        opt.value = githubReposCache[i].full_name;
        suggestions.appendChild(opt);
      }
      if (preselectedRepo && repoInput && !repoInput.value) {
        repoInput.value = preselectedRepo;
      }
    }

    async function loadGitHubOrgsAndRepos(expectedSessionEpoch, expectedViewGen) {
      var mySessionEpoch = typeof expectedSessionEpoch === "number" ? expectedSessionEpoch : sessionEpoch;
      var myViewGen = typeof expectedViewGen === "number" ? expectedViewGen : viewGeneration;
      var extraBox = byId("repo-auth-extra");
      if (!inMemoryProviderToken) {
        if (extraBox) extraBox.hidden = true;
        return;
      }
      try {
        var headers = {
          Authorization: "Bearer " + inMemoryProviderToken,
          Accept: "application/vnd.github+json"
        };
        var sig = viewAbortController ? viewAbortController.signal : (sessionAbortController ? sessionAbortController.signal : undefined);
        var reposRes = await fetchFn("https://api.github.com/user/repos?per_page=100&affiliation=owner,organization_member", {
          method: "GET",
          redirect: "error",
          signal: sig,
          headers: headers
        });
        if (!isActiveView(mySessionEpoch, myViewGen)) return;
        if (!reposRes.ok) return;
        var ghRepos = await reposRes.json();
        if (!isActiveView(mySessionEpoch, myViewGen)) return;
        githubReposCache = Array.isArray(ghRepos)
          ? ghRepos.filter(function (r) { return r && typeof r.full_name === "string" && r.permissions && r.permissions.admin === true; })
          : [];
        populateRepoSuggestions();
      } catch (_) {}
    }

    async function showOrgRepoPicker(note) {
      resetViewAbortController();
      var mySessionEpoch = sessionEpoch;
      var myViewGen = ++viewGeneration;
      pollGeneration++;
      quoteGeneration++;
      activeOrganizationId = null;
      activeProjectId = null;
      activeQuoteOrder = null;
      siblingCheckout = null;
      hideAllProtectedPanels();
      renderAccountBar();
      setStep("repo");
      var panel = byId("step-org-repo");
      var input = byId("repo-input");
      var hint = byId("org-repo-hint");
      var extraBox = byId("repo-auth-extra");
      if (!panel) return;
      if (preselectedRepo && input && !input.value) {
        input.value = preselectedRepo;
      }
      if (hint) hint.textContent = note || "";
      if (extraBox) extraBox.hidden = true;
      setStatus("", false);
      panel.hidden = false;
      await loadGitHubOrgsAndRepos(mySessionEpoch, myViewGen);
    }

    async function fetchReadyDetails(cont) {
      var access = {
        status: cont.status === "ready" ? "active" : cont.status,
        backend_authorized: cont.backend_authorized === true,
        project_id: cont.project_id,
        admin: isOrgAdmin(cont.organization_id)
      };
      try {
        var bStatus = await edgePost("billing-manage", {
          action: "status",
          organization_id: cont.organization_id
        }, { sessionEpoch: sessionEpoch, signal: viewAbortController ? viewAbortController.signal : null });
        if (bStatus && typeof bStatus === "object") {
          cont.paid_until = cont.paid_until || bStatus.paid_until || null;
          cont.cadence = cont.cadence || bStatus.cadence || null;
        }
      } catch (_) {}
      return access;
    }

    async function handleContinuationOutcome(cont, isFromReturn) {
      if (!cont || typeof cont !== "object" || cont.status === "not_found" || cont.status === "quoted") {
        return false;
      }
      activeOrganizationId = cont.organization_id || activeOrganizationId;
      activeProjectId = cont.project_id || activeProjectId;
      if (cont.project_id) preselectedRepo = cont.project_id;
      if (cont.cadence === "month" || cont.cadence === "year") preferredBilling = cont.cadence;
      if (Number.isSafeInteger(cont.quantity) && cont.quantity >= 1 && cont.quantity <= 1000) {
        preferredSeats = cont.quantity;
      }
      if (cont.continuation) {
        activeContinuation = cont.continuation;
      }

      var displayProject = resolveDisplayProjectSlug(cont.project_id || activeProjectId, cont.project_slug);

      if (cont.status === "ready" && cont.backend_authorized === true) {
        var access = await fetchReadyDetails(cont);
        showReadyState(cont.project_id, access, {
          cadence: cont.cadence,
          quantity: cont.quantity,
          paid_until: cont.paid_until,
          can_manage_billing: cont.can_manage_billing,
          organization_slug: cont.organization_slug,
          project_slug: displayProject
        });
        return true;
      }

      if (cont.status === "checkout_canceled" || cont.status === "checkout_expired" || cont.status === "order_closed") {
        storeRemove("checkout_pending");
        storeRemove("checkout_return_state");
        var isExpired = cont.status === "checkout_expired";
        showFailClosedState(
          cont.status,
          isExpired ? "Checkout expired" : "Checkout canceled",
          isExpired ? "Your Stripe Checkout session expired" : "Payment was canceled before completion",
          "No charge was made. You can review your subscription details or choose a different repository.",
          displayProject ? ("Repository: " + displayProject) : "",
          false,
          true,
          cont.can_retry_checkout === true && Boolean(activeOrganizationId && activeProjectId && isOrgAdmin(activeOrganizationId))
        );
        setStatus("", false);
        return true;
      }

      if (cont.status === "payment_pending" || cont.status === "scheduled" || isFromReturn) {
        await runContinuationPoll(cont.continuation || activeContinuation, cont.project_id || activeProjectId, displayProject);
        return true;
      }
      return false;
    }

    async function runContinuationPoll(contToken, projectId, displaySlug) {
      var mySessionEpoch = sessionEpoch;
      var myViewGen = viewGeneration;
      var myGen = ++pollGeneration;
      var mySignal = viewAbortController ? viewAbortController.signal : (sessionAbortController ? sessionAbortController.signal : null);
      var repoLabel = resolveDisplayProjectSlug(projectId, displaySlug);
      showFailClosedState(
        "pending_fulfillment",
        "Finalizing subscription",
        "Confirming your subscription…",
        "We are verifying your payment and activating Decapod Cloud for " + (repoLabel || "your repository") + ".",
        "Checking payment confirmation…",
        true,
        false,
        false
      );
      var lastSnapshot = null;
      var outcome;
      try {
        outcome = await flow.createBoundedPoller({
          maxAttempts: 12,
          intervalMs: 2500,
          sleepFn: sleepFn,
          isCancelled: function () {
            return myGen !== pollGeneration || mySessionEpoch !== sessionEpoch || myViewGen !== viewGeneration || Boolean(mySignal && mySignal.aborted);
          },
          onUpdate: function (info) {
            if (myGen !== pollGeneration || mySessionEpoch !== sessionEpoch || myViewGen !== viewGeneration) return;
            var detail = byId("state-detail");
            if (!detail) return;
            detail.textContent = info.phase === "checking"
              ? "Confirming payment settlement (" + info.attempt + " of " + info.maxAttempts + ")…"
              : "Waiting for Stripe confirmation (" + info.attempt + " of " + info.maxAttempts + ")…";
          },
          checkFn: async function () {
            if (contToken || !projectId) {
              var payload = { action: "continuation" };
              if (contToken) payload.continuation = contToken;
              else if (projectId) payload.project_id = projectId;
              var res = await edgePost("billing-manage", payload, { sessionEpoch: mySessionEpoch, signal: mySignal });
              lastSnapshot = res;
              return res;
            }
            var accRes = await edgePost("account-status", {
              project_id: projectId,
              operation: "access_details"
            }, { sessionEpoch: mySessionEpoch, signal: mySignal });
            lastSnapshot = accRes;
            return accRes;
          }
        });
      } catch (err) {
        if ((err && err.name === "AbortError") || myGen !== pollGeneration || mySessionEpoch !== sessionEpoch || myViewGen !== viewGeneration) {
          return;
        }
        if (err && (err.status === 404 || err.message === "continuation_not_found")) {
          storeRemove("checkout_pending");
          storeRemove("checkout_return_state");
          showFailClosedState(
            "continuation_mismatch",
            "Confirmation mismatch",
            "Subscription confirmation did not match this account",
            "This confirmation link does not belong to your signed-in GitHub account or billing environment.",
            "",
            false,
            true,
            false
          );
          return;
        }
        if (err && (err.status === 403 || err.message === "admin_required" || err.message === "organization_access_denied" || err.message === "forbidden")) {
          storeRemove("checkout_pending");
          showDegradedApiState(err, null, false);
          return;
        }
        throw err;
      }

      if (myGen !== pollGeneration || mySessionEpoch !== sessionEpoch || myViewGen !== viewGeneration) return;
      if (outcome.outcome === "cancelled") return;
      if (outcome.outcome === "ready") {
        var r = outcome.result || lastSnapshot || {};
        if (r.organization_id) activeOrganizationId = r.organization_id;
        var finalMeta = {
          cadence: r.cadence || preferredBilling,
          quantity: r.quantity || preferredSeats,
          paid_until: r.paid_until || null,
          can_manage_billing: r.can_manage_billing,
          organization_slug: r.organization_slug || null
        };
        if (r.project_id && !r.paid_until && activeOrganizationId) {
          var hydrated = await fetchReadyDetails(r);
          showReadyState(r.project_id || projectId, hydrated, Object.assign(finalMeta, { paid_until: r.paid_until || null }));
          return;
        }
        showReadyState(r.project_id || projectId, r, finalMeta);
        return;
      }
      if (outcome.outcome === "admin_approval_required") {
        storeRemove("checkout_pending");
        showFailClosedState(
          "admin_approval_required",
          "Approval needed",
          "Administrator approval required",
          "An administrator of this organization must assign your seat for this repository.",
          "",
          true,
          true,
          false
        );
        return;
      }
      if (outcome.outcome === "organization_already_enrolled") {
        storeRemove("checkout_pending");
        showFailClosedState(
          "organization_already_enrolled",
          "Already enrolled",
          "Organization already active on Decapod Cloud",
          "This GitHub organization already has a Cloud account under another administrator. Ask an administrator to invite you.",
          "",
          false,
          true,
          false
        );
        return;
      }
      var pendingRef = (outcome.lastError && outcome.lastError.correlationId) || projectId;
      var refDetail = pendingRef ? ("Ref: " + pendingRef) : "";
      showFailClosedState(
        "pending_timeout",
        "Settlement pending",
        "Still confirming your subscription",
        "Your payment confirmation has not arrived from Stripe yet. Do not pay again — select Check status in a moment.",
        refDetail,
        true,
        false,
        false
      );
      if (flowOk && profile) {
        coherenceChannel.broadcastCheckoutEvent("fulfillment_status", {
          projectOrigin: profile.projectOrigin,
          organizationId: activeOrganizationId,
          projectId: projectId,
          state: "pending_timeout"
        });
      }
    }

    function updateSummarySelections(cadence, seats) {
      var repoEl = byId("summary-repo");
      var planEl = byId("summary-plan");
      var seatsEl = byId("summary-seats");
      if (repoEl) repoEl.textContent = preselectedRepo || activeProjectId || "—";
      if (planEl) planEl.textContent = cadence === "year" ? "Decapod Cloud · Annual" : "Decapod Cloud · Monthly";
      if (seatsEl) seatsEl.textContent = String(seats) + (seats === 1 ? " seat" : " seats");
    }

    function setQuoteUpdatingUi(cadence, seats) {
      updateSummarySelections(cadence, seats);
      var amtEl = byId("quote-amount");
      var badgeEl = byId("quote-discount-badge");
      var discRow = byId("summary-discount-row");
      var detailsEl = byId("quote-details");
      var commitEl = byId("quote-commitment");
      var checkoutBtn = byId("checkout-btn");
      var quoteErr = byId("quote-error-note");
      if (amtEl) amtEl.textContent = "Calculating…";
      if (badgeEl) badgeEl.hidden = true;
      if (discRow) discRow.hidden = true;
      if (detailsEl) detailsEl.textContent = "";
      if (commitEl) {
        commitEl.textContent = cadence === "year"
          ? "Billed upfront for 12 months."
          : "Recurring monthly subscription.";
      }
      if (checkoutBtn) checkoutBtn.disabled = true;
      if (quoteErr) { quoteErr.hidden = true; quoteErr.textContent = ""; }
    }

    function renderQuoteSummary(quoted, repoLabel) {
      activeQuoteOrder = quoted;
      var summary = byId("quote-summary");
      var amountEl = byId("quote-amount");
      var detailsEl = byId("quote-details");
      var commitEl = byId("quote-commitment");
      var checkoutBtn = byId("checkout-btn");
      var badgeEl = byId("quote-discount-badge");
      var discRow = byId("summary-discount-row");
      var discVal = byId("summary-discount");
      var quoteErr = byId("quote-error-note");
      if (!summary || !amountEl || !detailsEl || !commitEl || !checkoutBtn) return;

      var qty = Number.isSafeInteger(quoted.quantity) ? quoted.quantity : preferredSeats;
      var cadence = quoted.cadence === "year" ? "year" : "month";
      updateSummarySelections(cadence, qty);

      amountEl.textContent = Number.isSafeInteger(quoted.amount)
        ? (formatMoney(quoted.amount) + (cadence === "year" ? " / year" : " / month"))
        : "Quoted";
      var unitNote = Number.isSafeInteger(quoted.unit_cents)
        ? (qty + (qty === 1 ? " seat" : " seats") + " × " + formatMoney(quoted.unit_cents) + (cadence === "year" ? "/seat/yr" : "/seat/mo"))
        : (qty + (qty === 1 ? " seat" : " seats"));
      detailsEl.textContent = unitNote;

      var pct = Number.isSafeInteger(quoted.total_discount_pct) ? quoted.total_discount_pct : 0;
      if (pct > 0) {
        if (badgeEl) {
          badgeEl.textContent = pct + "% off";
          badgeEl.hidden = false;
        }
        if (discRow && discVal) {
          discVal.textContent = (cadence === "year" ? "Annual + team discount (" + pct + "%)" : "Team discount (" + pct + "%)");
          discRow.hidden = false;
        }
      } else {
        if (badgeEl) badgeEl.hidden = true;
        if (discRow) discRow.hidden = true;
      }

      commitEl.textContent = cadence === "year"
        ? "Annual commitment billed upfront for 12 months. Cancel anytime before renewal."
        : "Monthly recurring subscription. Adjust or cancel anytime before renewal.";
      summary.hidden = false;
      if (quoteErr) { quoteErr.hidden = true; quoteErr.textContent = ""; }
      var blockedBySibling = Boolean(siblingCheckout && siblingCheckout.projectId === activeProjectId);
      checkoutBtn.disabled = quoteDirty || !quoted.quote_id || quoted.status === "scheduled" || checkoutInFlight || blockedBySibling;
    }

    function readSelectedPlanInputs() {
      var cadenceEl = byId("billing-cadence");
      var seatEl = byId("seat-quantity");
      var cadence = cadenceEl && cadenceEl.value === "year" ? "year" : "month";
      var rawSeats = seatEl ? Math.floor(Number(seatEl.value)) : preferredSeats;
      if (!Number.isSafeInteger(rawSeats) || rawSeats < 1) rawSeats = 1;
      if (rawSeats > 1000) rawSeats = 1000;
      if (seatEl && String(rawSeats) !== seatEl.value) seatEl.value = String(rawSeats);
      preferredBilling = cadence;
      preferredSeats = rawSeats;
      savePendingIntent();
      return { cadence: cadence, capacity: rawSeats };
    }

    async function requestAutomaticQuote() {
      if (!activeOrganizationId || !activeProjectId) return null;
      var selected = readSelectedPlanInputs();
      var targetOrgId = activeOrganizationId;
      var targetProjId = activeProjectId;
      var payload = {
        organization_id: targetOrgId,
        cadence: selected.cadence,
        allocations: [{ project_id: targetProjId, capacity: selected.capacity }]
      };
      var canonical = JSON.stringify(payload);
      if (quotePayloadKey !== canonical || !quoteRequestId) {
        var savedQ = storeGet("quote_req", 1024);
        if (savedQ && savedQ.key === canonical && typeof savedQ.request_id === "string" && savedQ.request_id) {
          quotePayloadKey = canonical;
          quoteRequestId = savedQ.request_id;
        } else {
          quotePayloadKey = canonical;
          quoteRequestId = makeRequestId();
          storeSet("quote_req", { key: canonical, request_id: quoteRequestId });
        }
      }
      quoteInFlight = true;
      quoteDirty = true;
      setQuoteUpdatingUi(selected.cadence, selected.capacity);
      var mySessionEpoch = sessionEpoch;
      var myViewGen = viewGeneration;
      var myQuoteGen = ++quoteGeneration;
      var mySignal = viewAbortController ? viewAbortController.signal : (sessionAbortController ? sessionAbortController.signal : null);
      try {
        var quoted = await edgePost("billing-quote", Object.assign({ request_id: quoteRequestId }, payload), {
          sessionEpoch: mySessionEpoch,
          signal: mySignal
        });
        if (!isActiveView(mySessionEpoch, myViewGen) || myQuoteGen !== quoteGeneration ||
            activeOrganizationId !== targetOrgId || activeProjectId !== targetProjId) {
          return null;
        }
        quoteDirty = false;
        renderQuoteSummary(quoted, preselectedRepo || targetProjId);
        return quoted;
      } catch (error) {
        if ((error && error.name === "AbortError") || !isActiveView(mySessionEpoch, myViewGen) ||
            myQuoteGen !== quoteGeneration || activeProjectId !== targetProjId) {
          return null;
        }
        var code = error && error.message ? error.message : "billing_quote_unavailable";
        if (code === "billing_not_configured" || code === "live_sale_disabled") {
          var closedBox = byId("billing-closed-notice");
          var quoteControls = byId("billing-quote-controls");
          if (closedBox) closedBox.hidden = false;
          if (quoteControls) quoteControls.hidden = true;
          return null;
        }
        if (code === "order_pending" || code === "order_conflict" || error.status === 409) {
          // Recover an existing pending order or reset stale request ID
          try {
            var st = await edgePost("billing-manage", { action: "status", organization_id: targetOrgId }, {
              sessionEpoch: mySessionEpoch,
              signal: mySignal
            });
            if (!isActiveView(mySessionEpoch, myViewGen) || myQuoteGen !== quoteGeneration) return null;
            if (st && st.pending_order && st.pending_order.quote_id) {
              var po = st.pending_order;
              if (po.status === "checkout" || po.status === "paid" || po.status === "scheduled") {
                var contRes = await edgePost("billing-manage", { action: "continuation", organization_id: targetOrgId, project_id: targetProjId }, {
                  sessionEpoch: mySessionEpoch,
                  signal: mySignal
                });
                if (await handleContinuationOutcome(contRes, false)) return null;
              }
              if (po.cadence === selected.cadence && po.quantity === selected.capacity) {
                quoteDirty = false;
                renderQuoteSummary(po, preselectedRepo || targetProjId);
                return po;
              }
              if (po.order_id && (po.status === "quoted" || po.status === "prepared")) {
                await edgePost("billing-manage", { action: "order_cancel", organization_id: targetOrgId, order_id: po.order_id }, {
                  sessionEpoch: mySessionEpoch,
                  signal: mySignal
                });
                quoteRequestId = makeRequestId();
                storeSet("quote_req", { key: canonical, request_id: quoteRequestId });
                var retried = await edgePost("billing-quote", Object.assign({ request_id: quoteRequestId }, payload), {
                  sessionEpoch: mySessionEpoch,
                  signal: mySignal
                });
                if (!isActiveView(mySessionEpoch, myViewGen) || myQuoteGen !== quoteGeneration) return null;
                quoteDirty = false;
                renderQuoteSummary(retried, preselectedRepo || targetProjId);
                return retried;
              }
            }
          } catch (_) {}
        }
        var quoteErr = byId("quote-error-note");
        var amtEl = byId("quote-amount");
        if (amtEl) amtEl.textContent = "Unavailable";
        var qRef = formatSupportRef(error, null);
        if (quoteErr) {
          quoteErr.textContent = (error && (error.status === 429 || code === "rate_limited"))
            ? "Too many price updates. Please wait a moment and change your selection to retry."
            : "Could not calculate subscription price right now. Adjust seats or try again shortly." + (qRef ? " " + qRef : "");
          quoteErr.hidden = false;
        }
        return null;
      } finally {
        if (myQuoteGen === quoteGeneration) quoteInFlight = false;
      }
    }

    function scheduleQuoteRefresh() {
      quoteDirty = true;
      var selected = readSelectedPlanInputs();
      setQuoteUpdatingUi(selected.cadence, selected.capacity);
      if (quoteTimer !== null) {
        clearTimeout(quoteTimer);
        quoteTimer = null;
      }
      if (quoteDebounceMs <= 0) {
        requestAutomaticQuote().catch(function () {});
        return;
      }
      quoteTimer = setTimeout(function () {
        quoteTimer = null;
        requestAutomaticQuote().catch(function () {});
      }, quoteDebounceMs);
    }

    async function showCheckoutPanel(orgId, projectId, repoLabel, expectedViewGen, customStatus) {
      var mySessionEpoch = sessionEpoch;
      var myViewGen = typeof expectedViewGen === "number" ? expectedViewGen : viewGeneration;
      var mySignal = viewAbortController ? viewAbortController.signal : (sessionAbortController ? sessionAbortController.signal : null);
      hideAllProtectedPanels();
      renderAccountBar();
      setStep("review");
      activeOrganizationId = orgId;
      activeProjectId = projectId;
      activeQuoteOrder = null;

      var card = byId("step-checkout");
      var label = byId("checkout-target-label");
      var closedBox = byId("billing-closed-notice");
      var quoteControls = byId("billing-quote-controls");
      var checkoutBtn = byId("checkout-btn");
      if (!card) return;

      if (label) {
        label.textContent = "Repository: " + (repoLabel || projectId);
      }
      if (checkoutBtn) checkoutBtn.disabled = true;

      var cadenceSelect = byId("billing-cadence");
      if (cadenceSelect && (preferredBilling === "month" || preferredBilling === "year")) {
        cadenceSelect.value = preferredBilling;
      }
      var seatInput = byId("seat-quantity");
      if (seatInput) {
        seatInput.value = String(preferredSeats);
      }

      try {
        var bStatus = await edgePost("billing-manage", {
          action: "status",
          organization_id: orgId
        }, { sessionEpoch: mySessionEpoch, signal: mySignal });
        if (!isActiveView(mySessionEpoch, myViewGen) || activeProjectId !== projectId) return;
        if (closedBox) closedBox.hidden = true;
        if (quoteControls) quoteControls.hidden = false;
        card.hidden = false;
        setStatus(customStatus || "", false);

        var po = bStatus && bStatus.pending_order ? bStatus.pending_order : null;
        if (po && (po.status === "checkout" || po.status === "paid" || po.status === "scheduled")) {
          var contRes = await edgePost("billing-manage", {
            action: "continuation",
            organization_id: orgId,
            project_id: projectId
          }, { sessionEpoch: mySessionEpoch, signal: mySignal });
          if (await handleContinuationOutcome(contRes, false)) return;
        }
        if (po && po.quote_id && po.status === "quoted" && po.cadence === preferredBilling && po.quantity === preferredSeats &&
            (!po.allocations || !po.allocations.length || po.allocations[0].project_id === projectId)) {
          quoteDirty = false;
          renderQuoteSummary(po, repoLabel || projectId);
        } else {
          await requestAutomaticQuote();
        }
      } catch (error) {
        if ((error && error.name === "AbortError") || !isActiveView(mySessionEpoch, myViewGen) || activeProjectId !== projectId) return;
        var code = error && error.message ? error.message : "";
        if (code === "billing_not_configured" || code === "live_sale_disabled") {
          if (closedBox) closedBox.hidden = false;
          if (quoteControls) quoteControls.hidden = true;
          card.hidden = false;
          setStatus("", false);
          return;
        }
        throw error;
      }
    }

    async function inspectProjectAccess(orgId, projectId, repoLabel, expectedViewGen) {
      var mySessionEpoch = sessionEpoch;
      var myViewGen;
      if (typeof expectedViewGen === "number") {
        myViewGen = expectedViewGen;
        if (!viewAbortController) resetViewAbortController();
      } else {
        resetViewAbortController();
        myViewGen = ++viewGeneration;
      }
      var mySignal = viewAbortController ? viewAbortController.signal : (sessionAbortController ? sessionAbortController.signal : null);
      activeOrganizationId = orgId;
      activeProjectId = projectId;
      var pendingCheckout = storeGet("checkout_pending", 4096);
      var matchingPending = Boolean(pendingCheckout && pendingCheckout.project_id === projectId);
      var pendingReturned = Boolean(matchingPending && pendingCheckout.returned === true);

      var access;
      try {
        access = await edgePost("account-status", {
          project_id: projectId,
          operation: "access_details"
        }, { sessionEpoch: mySessionEpoch, signal: mySignal });
      } catch (err) {
        if ((err && err.name === "AbortError") || !isActiveView(mySessionEpoch, myViewGen) || activeProjectId !== projectId) return;
        if ((checkoutReturned || pendingReturned) && !(err && (
          err.status === 401 ||
          err.status === 403 ||
          err.message === "invalid_token" ||
          err.message === "admin_required" ||
          err.message === "organization_access_denied" ||
          err.message === "forbidden" ||
          err.message === "contract_version_mismatch" ||
          err.message === "client_version_skew" ||
          err.message === "sign_in_required" ||
          err.message === "auth_account_changed"
        ))) {
          if (flowOk && profile) {
            coherenceChannel.broadcastCheckoutEvent("checkout_returned", {
              projectOrigin: profile.projectOrigin,
              organizationId: orgId,
              projectId: projectId
            });
          }
          await runContinuationPoll(activeContinuation, projectId);
          return;
        }
        if (err && (err.status === 401 || err.message === "invalid_token" || err.message === "contract_version_mismatch" || err.message === "client_version_skew")) {
          throw err;
        }
        showDegradedApiState(err, repoLabel || projectId, true);
        return;
      }
      if (!isActiveView(mySessionEpoch, myViewGen) || activeProjectId !== projectId) return;
      var state = flow.classifyAccessState(access);
      if (state === "ready") {
        showReadyState(projectId, access, {
          cadence: preferredBilling,
          quantity: preferredSeats
        });
        return;
      }
      if (state === "pending_fulfillment" || checkoutReturned || pendingReturned) {
        if (flowOk && profile) {
          coherenceChannel.broadcastCheckoutEvent("checkout_returned", {
            projectOrigin: profile.projectOrigin,
            organizationId: orgId,
            projectId: projectId
          });
        }
        await runContinuationPoll(activeContinuation, projectId);
        return;
      }
      if (state === "organization_already_enrolled") {
        storeRemove("checkout_pending");
        showFailClosedState(
          "organization_already_enrolled",
          "Already enrolled",
          "Organization already active on Decapod Cloud",
          "This GitHub organization is already managed by another administrator. Ask them to invite you and assign a seat.",
          "",
          false,
          true,
          false
        );
        return;
      }
      if (state === "admin_approval_required") {
        storeRemove("checkout_pending");
        showFailClosedState(
          "admin_approval_required",
          "Approval needed",
          "Administrator approval required",
          "An administrator of this organization must approve your access and assign a seat for " + (repoLabel || projectId) + ".",
          "",
          true,
          true,
          false
        );
        return;
      }
      if (state === "entitlement_required") {
        var returnedFromBack = matchingPending && !checkoutReturned && !pendingReturned;
        if (returnedFromBack) {
          storeRemove("checkout_pending");
          siblingCheckout = null;
        }
        if (!isOrgAdmin(access.organization_id || orgId)) {
          showFailClosedState(
            "admin_approval_required",
            "Approval needed",
            "Administrator permission required",
            "Only an organization administrator can purchase seats for " + (repoLabel || projectId) + ".",
            "",
            true,
            true,
            false
          );
          return;
        }
        await showCheckoutPanel(
          access.organization_id || orgId,
          projectId,
          repoLabel,
          myViewGen,
          returnedFromBack ? "Checkout was not completed. Review your subscription below to continue." : null
        );
        return;
      }
      await showOrgRepoPicker("Enter a repository to continue.");
    }

    async function handleVerifyAndEnrollRepo() {
      if (enrollInFlight) return;
      var input = byId("repo-input");
      var hint = byId("org-repo-hint");
      var extraBox = byId("repo-auth-extra");
      var verifyBtn = byId("verify-repo-btn");
      var rawSlug = input ? input.value : "";
      var parsed = flow.parseRepoSlug(rawSlug);
      if (!parsed) {
        if (hint) hint.textContent = "Enter a valid GitHub repository as owner/repository.";
        return;
      }
      enrollInFlight = true;
      if (verifyBtn) verifyBtn.disabled = true;
      resetViewAbortController();
      var mySessionEpoch = sessionEpoch;
      var myViewGen = ++viewGeneration;
      var mySignal = viewAbortController ? viewAbortController.signal : (sessionAbortController ? sessionAbortController.signal : null);
      try {
        preselectedRepo = parsed.slug;
        savePendingIntent();
        if (extraBox) extraBox.hidden = true;

        var existing = findExistingProject(parsed.slug);
        if (existing) {
          await inspectProjectAccess(existing.organization_id || existing.organization, existing.project_id, parsed.slug, myViewGen);
          return;
        }

        if (!inMemoryProviderToken) {
          if (hint) {
            hint.textContent = "GitHub repository access must be confirmed once to verify admin ownership of " + parsed.slug + ".";
          }
          if (extraBox) extraBox.hidden = false;
          return;
        }

        if (enrollRepoSlug !== parsed.slug || !enrollRequestId) {
          var savedEnroll = storeGet("enroll_req", 1024);
          if (savedEnroll && savedEnroll.repo === parsed.slug && typeof savedEnroll.request_id === "string" && savedEnroll.request_id) {
            enrollRepoSlug = parsed.slug;
            enrollRequestId = savedEnroll.request_id;
          } else {
            enrollRepoSlug = parsed.slug;
            enrollRequestId = makeRequestId();
            storeSet("enroll_req", { repo: parsed.slug, request_id: enrollRequestId });
          }
        }

        if (hint) hint.textContent = "Verifying GitHub ownership for " + parsed.slug + "…";
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
        var enrolled = await edgePost("repository-enroll", Object.assign({
          request_id: enrollRequestId,
          provider: "github",
          repository: parsed.slug,
          provider_token: inMemoryProviderToken
        }, sameOwnerProject && (sameOwnerProject.organization_id || sameOwnerProject.organization)
          ? { organization_id: sameOwnerProject.organization_id || sameOwnerProject.organization }
          : {}), { sessionEpoch: mySessionEpoch, signal: mySignal });
        if (!isActiveView(mySessionEpoch, myViewGen)) return;

        enrollRequestId = null;
        enrollRepoSlug = null;
        storeRemove("enroll_req");

        var refreshed = await edgePost("account-register", { operation: "account" }, {
          sessionEpoch: mySessionEpoch,
          signal: mySignal
        });
        if (!isActiveView(mySessionEpoch, myViewGen)) return;
        accountSnapshot = refreshed;

        var resolvedOrg = enrolled.organization_id;
        var resolvedProj = enrolled.project_id || parsed.slug;
        await inspectProjectAccess(resolvedOrg, resolvedProj, parsed.slug, myViewGen);
      } catch (error) {
        if ((error && error.name === "AbortError") || !isActiveView(mySessionEpoch, myViewGen)) return;
        var code = error && error.message ? error.message : "verification_failed";
        if (code === "organization_already_enrolled") {
          showFailClosedState(
            "organization_already_enrolled",
            "Already enrolled",
            "Organization already active on Decapod Cloud",
            "Another administrator already manages " + parsed.owner + " on Decapod Cloud. Request an invitation or seat assignment from them.",
            "",
            false,
            true,
            false
          );
          return;
        }
        if (code === "admin_approval_required" || code === "admin_required") {
          showFailClosedState(
            "admin_approval_required",
            "Approval needed",
            "Administrator permission required",
            "An administrator of this organization must approve enrollment and assign your seat.",
            "",
            true,
            true,
            false
          );
          return;
        }
        if (code === "repository_verification_required") {
          if (hint) {
            hint.textContent = "We could not confirm administrator permission on GitHub for " + parsed.slug + ".";
          }
          if (extraBox) extraBox.hidden = false;
          return;
        }
        if (code === "repository_identity_mismatch") {
          if (hint) hint.textContent = "Please sign in with the GitHub account that administers " + parsed.slug + ".";
          return;
        }
        if (hint) hint.textContent = "Could not verify " + parsed.slug + ". Check the repository name and try again.";
      } finally {
        enrollInFlight = false;
        if (verifyBtn) verifyBtn.disabled = false;
      }
    }

    async function handleCheckoutClick() {
      if (checkoutInFlight || quoteDirty) return;
      if (!activeOrganizationId || !activeQuoteOrder || !activeQuoteOrder.quote_id) {
        await requestAutomaticQuote();
        return;
      }
      if (siblingCheckout && siblingCheckout.projectId === activeProjectId) {
        setStatus("Checkout is already open in another tab for this repository.", true);
        return;
      }
      var targetOrgId = activeOrganizationId;
      var targetProjId = activeProjectId;
      var targetOrderId = activeQuoteOrder.order_id;
      var targetQuoteId = activeQuoteOrder.quote_id;
      var reqKey = targetOrgId + ":" + targetOrderId + ":" + targetQuoteId;
      if (checkoutRequestKey !== reqKey || !checkoutRequestId) {
        var savedReq = storeGet("checkout_req", 1024);
        if (savedReq && savedReq.key === reqKey && typeof savedReq.request_id === "string" && savedReq.request_id) {
          checkoutRequestKey = reqKey;
          checkoutRequestId = savedReq.request_id;
        } else {
          checkoutRequestKey = reqKey;
          checkoutRequestId = makeRequestId();
          storeSet("checkout_req", { key: reqKey, request_id: checkoutRequestId });
        }
      }

      checkoutInFlight = true;
      var checkoutBtn = byId("checkout-btn");
      if (checkoutBtn) checkoutBtn.disabled = true;
      var mySessionEpoch = sessionEpoch;
      var myViewGen = viewGeneration;
      var mySignal = viewAbortController ? viewAbortController.signal : (sessionAbortController ? sessionAbortController.signal : null);
      try {
        var result = await edgePost("billing-checkout", {
          request_id: checkoutRequestId,
          organization_id: targetOrgId,
          order_id: targetOrderId,
          quote_id: targetQuoteId
        }, { sessionEpoch: mySessionEpoch, signal: mySignal });
        if (!isActiveView(mySessionEpoch, myViewGen) || activeProjectId !== targetProjId) return;
        if (result.continuation) activeContinuation = result.continuation;
        if (result.checkout_url) {
          if (!flow.isAllowedCheckoutUrl(result.checkout_url)) {
            throw new Error("invalid_response");
          }
          storeSet("checkout_pending", {
            organization_id: targetOrgId,
            project_id: targetProjId,
            order_id: targetOrderId,
            quote_id: targetQuoteId,
            request_id: checkoutRequestId,
            continuation: result.continuation || null,
            repo: preselectedRepo || targetProjId,
            returned: false,
            started_at: nowSec()
          });
          if (flowOk && profile) {
            coherenceChannel.broadcastCheckoutEvent("checkout_started", {
              projectOrigin: profile.projectOrigin,
              organizationId: targetOrgId,
              projectId: targetProjId,
              orderId: targetOrderId,
              quoteId: targetQuoteId,
              requestId: checkoutRequestId
            });
          }
          navigateFn(result.checkout_url);
          return;
        }
        if (result.status === "payment_pending") {
          storeSet("checkout_pending", {
            organization_id: targetOrgId,
            project_id: targetProjId,
            order_id: targetOrderId,
            quote_id: targetQuoteId,
            request_id: checkoutRequestId,
            continuation: result.continuation || null,
            repo: preselectedRepo || targetProjId,
            returned: true,
            started_at: nowSec()
          });
          await runContinuationPoll(result.continuation || activeContinuation, targetProjId);
          return;
        }
        await inspectProjectAccess(targetOrgId, targetProjId, preselectedRepo || targetProjId, myViewGen);
      } catch (error) {
        if ((error && error.name === "AbortError") || !isActiveView(mySessionEpoch, myViewGen)) return;
        var errCode = error && error.message ? error.message : "error";
        if (errCode === "quote_expired" || errCode === "quote_mismatch" || (error && error.status === 409)) {
          activeQuoteOrder = null;
          quoteRequestId = null;
          quotePayloadKey = null;
          checkoutRequestId = null;
          checkoutRequestKey = null;
          storeRemove("checkout_req");
          storeRemove("quote_req");
          var quoteErr = byId("quote-error-note");
          if (quoteErr) {
            quoteErr.textContent = "Your previous quote expired. Refreshing the current price now…";
            quoteErr.hidden = false;
          }
          await requestAutomaticQuote();
          return;
        }
        var checkoutRef = formatSupportRef(error, checkoutRequestId);
        if (error && (error.status === 429 || errCode === "rate_limited")) {
          var waitSec = Number.isSafeInteger(error.retryAfterSec) && error.retryAfterSec > 0
            ? "Wait " + error.retryAfterSec + "s before retrying."
            : "Wait a moment before retrying.";
          setStatus("Too many checkout requests. " + waitSec + (checkoutRef ? " " + checkoutRef : ""), true);
        } else if (error && (error.status >= 500 || errCode === "service_unavailable" || errCode === "request_timeout")) {
          setStatus("Could not confirm checkout status right now. Do not submit a duplicate payment — check your status in a moment." + (checkoutRef ? " " + checkoutRef : ""), true);
        } else {
          setStatus("Checkout could not be opened." + (checkoutRef ? " " + checkoutRef : ""), true);
        }
        if (checkoutBtn && !quoteDirty && activeQuoteOrder && activeQuoteOrder.quote_id &&
            !(siblingCheckout && siblingCheckout.projectId === activeProjectId)) {
          checkoutBtn.disabled = false;
        }
      } finally {
        checkoutInFlight = false;
      }
    }

    async function handleOpenBillingPortal() {
      if (portalInFlight || !activeOrganizationId) return;
      portalInFlight = true;
      var btn = byId("ready-billing-portal-btn");
      var note = byId("ready-portal-note");
      if (btn) btn.disabled = true;
      if (note) { note.hidden = true; note.textContent = ""; }
      try {
        var res = await edgePost("billing-portal", { organization_id: activeOrganizationId }, {
          sessionEpoch: sessionEpoch,
          signal: viewAbortController ? viewAbortController.signal : null
        });
        if (!res || !flow.isAllowedCheckoutUrl(res.portal_url)) {
          throw new Error("invalid_response");
        }
        navigateFn(res.portal_url);
      } catch (err) {
        if (err && err.name === "AbortError") return;
        if (note) {
          note.textContent = "Billing portal is temporarily unavailable." + (formatSupportRef(err, null) ? " " + formatSupportRef(err, null) : "");
          note.hidden = false;
        }
      } finally {
        portalInFlight = false;
        if (btn) btn.disabled = false;
      }
    }

    async function loadAuthenticatedAccount(expectedSessionEpoch, expectedViewGen) {
      var mySessionEpoch = typeof expectedSessionEpoch === "number" ? expectedSessionEpoch : sessionEpoch;
      var myViewGen = typeof expectedViewGen === "number" ? expectedViewGen : viewGeneration;
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
          }
        } catch (invErr) {
          if ((invErr && invErr.name === "AbortError") || mySessionEpoch !== sessionEpoch || !session) return;
        }
      }

      if (myViewGen !== viewGeneration) return;

      // Authoritative purchase/checkout continuation recovery (#252, #255)
      var returnState = storeGet("checkout_return_state", 2048);
      var pendingCheckout = storeGet("checkout_pending", 4096);
      var isReturnFlow = Boolean(checkoutReturned || checkoutCanceled || (returnState && returnState.mode));
      var contRef = activeContinuation ||
        (returnState && returnState.continuation) ||
        (pendingCheckout && pendingCheckout.continuation) ||
        null;
      var checkSession = Boolean(checkoutCanceled || (returnState && returnState.mode === "canceled"));

      if (isReturnFlow || !preselectedRepo) {
        try {
          var contPayload = { action: "continuation" };
          if (contRef) contPayload.continuation = contRef;
          if (checkSession) contPayload.check_session = true;
          var contResult = await edgePost("billing-manage", contPayload, reqOpts);
          if (!isActiveView(mySessionEpoch, myViewGen)) return;
          if (await handleContinuationOutcome(contResult, isReturnFlow)) {
            return;
          }
        } catch (contErr) {
          if ((contErr && contErr.name === "AbortError") || !isActiveView(mySessionEpoch, myViewGen)) return;
          if (contRef && contErr && (contErr.status === 404 || contErr.message === "continuation_not_found")) {
            storeRemove("checkout_pending");
            storeRemove("checkout_return_state");
            activeContinuation = null;
            checkoutReturned = false;
            checkoutCanceled = false;
            showFailClosedState(
              "continuation_mismatch",
              "Confirmation mismatch",
              "Checkout confirmation could not be verified",
              "This confirmation link does not belong to your signed-in account or billing environment.",
              "",
              false,
              true,
              false
            );
            return;
          }
          // Non-fatal fallback only if no explicit return continuation failed validation
          if (isReturnFlow && !contRef && pendingCheckout && (pendingCheckout.repo || pendingCheckout.project_id)) {
            await runContinuationPoll(null, pendingCheckout.repo || pendingCheckout.project_id);
            return;
          }
        }
      }

      var targetLookup = preselectedRepo;
      if (!targetLookup && pendingCheckout && Number.isSafeInteger(pendingCheckout.started_at) && (nowSec() - pendingCheckout.started_at) < 1800) {
        targetLookup = pendingCheckout.repo || pendingCheckout.project_id || null;
      }
      if (targetLookup) {
        var existing = findExistingProject(targetLookup);
        if (existing) {
          await inspectProjectAccess(existing.organization_id || existing.organization, existing.project_id, targetLookup, myViewGen);
          return;
        }
      }
      await showOrgRepoPicker("");
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

      // Restore saved intent from Pricing / previous step across OAuth redirects
      try {
        var savedCheckoutIntentRaw = storage ? storage.getItem("decapod:pending-checkout-intent") : null;
        if (savedCheckoutIntentRaw && savedCheckoutIntentRaw.length < 4096) {
          var savedCheckoutIntent = JSON.parse(savedCheckoutIntentRaw);
          if (savedCheckoutIntent && typeof savedCheckoutIntent === "object") {
            if (savedCheckoutIntent.billing === "year" || savedCheckoutIntent.billing === "month") {
              preferredBilling = savedCheckoutIntent.billing;
            }
            if (Number.isSafeInteger(savedCheckoutIntent.seats) && savedCheckoutIntent.seats >= 1 && savedCheckoutIntent.seats <= 1000) {
              preferredSeats = savedCheckoutIntent.seats;
            }
            if (savedCheckoutIntent.repo) {
              var parsedSavedRepo = flow.parseRepoSlug(savedCheckoutIntent.repo);
              if (parsedSavedRepo) preselectedRepo = parsedSavedRepo.slug;
            }
          }
        }
      } catch (_) {}

      var repoCheck = flow.parseRepoSearch(query);
      if (repoCheck.status === "valid") {
        preselectedRepo = repoCheck.slug;
        setBanner("valid", "Selected repository: " + repoCheck.slug, "Ownership will be verified automatically.");
      } else if (repoCheck.status === "invalid") {
        preselectedRepo = null;
        setBanner("invalid", "Repository parameter could not be read", "Enter your owner/repository below.");
      } else if (!preselectedRepo) {
        try {
          var legacySavedRepo = storage ? storage.getItem("decapod:pending-repo-intent") : null;
          var parsedLegacy = flow.parseRepoSlug(legacySavedRepo);
          if (parsedLegacy) {
            preselectedRepo = parsedLegacy.slug;
          }
        } catch (_) {}
      }

      var billingCheck = flow.parseBillingParam(query);
      if (billingCheck.status === "valid") preferredBilling = billingCheck.billing;
      var seatCheck = flow.parseSeatParam(query);
      if (seatCheck.status === "valid") preferredSeats = seatCheck.seats;
      savePendingIntent();

      var returnCheck = flow.parseSafeReturnParam(query, siteOrigin());
      if (returnCheck.status === "rejected") {
        setStatus("Invalid return destination ignored.", true);
      }

      var checkoutParam = query.get("checkout");
      checkoutReturned = checkoutParam === "returned";
      checkoutCanceled = checkoutParam === "canceled";
      var contCheck = flow.parseContinuationParam(query);
      if (contCheck.status === "valid") {
        activeContinuation = contCheck.continuation;
      } else if (contCheck.status === "invalid") {
        activeContinuation = "__invalid__";
      }

      var code = query.get("code");
      var loginNonce = query.get("login_nonce");
      var codeList = query.getAll("code");
      var nonceList = query.getAll("login_nonce");
      var oauthError = query.get("error") || fragment.get("error");
      var invId = query.get("invitation_id");
      var invSecret = fragment.get("invitation_secret");
      var hostileFragment = flow.hasHostileFragmentTokens(rawHash);

      // Scrub URL query & fragment immediately before network calls
      if ((currentUrl.search || currentUrl.hash) && winHistory && typeof winHistory.replaceState === "function") {
        winHistory.replaceState(null, "", "/signup");
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
          var dRef = discovery && discovery.correlationId ? (" Ref: " + discovery.correlationId) : "";
          setStatus(
            dStatus === "rate_limited"
              ? "Service temporarily busy. Please reload shortly." + (dRef ? " " + dRef : "")
              : (dStatus === "incompatible"
                ? "Please reload this page to continue with the latest version." + (dRef ? " " + dRef : "")
                : (dStatus === "invalid"
                  ? "Decapod Cloud returned malformed configuration. Please reload shortly." + (dRef ? " " + dRef : "")
                  : "Decapod Cloud is currently unavailable. Please try again shortly." + (dRef ? " " + dRef : ""))),
            true
          );
          return;
        }
      }

      // Persist return/cancel state in profile-namespaced sessionStorage so it survives OAuth re-auth!
      if (checkoutReturned || checkoutCanceled) {
        storeSet("checkout_return_state", {
          mode: checkoutCanceled ? "canceled" : "returned",
          continuation: activeContinuation,
          observed_at: nowSec()
        });
      } else {
        var existingReturn = storeGet("checkout_return_state", 2048);
        if (existingReturn && Number.isSafeInteger(existingReturn.observed_at) && (nowSec() - existingReturn.observed_at) < 1800) {
          if (existingReturn.mode === "returned") checkoutReturned = true;
          if (existingReturn.mode === "canceled") checkoutCanceled = true;
          if (!activeContinuation && existingReturn.continuation) activeContinuation = existingReturn.continuation;
        } else if (existingReturn) {
          storeRemove("checkout_return_state");
        }
      }

      if (activeContinuation === "__invalid__") {
        storeRemove("checkout_return_state");
        storeRemove("checkout_pending");
        setStatus("Invalid subscription confirmation link.", true);
        activeContinuation = null;
        checkoutReturned = false;
        checkoutCanceled = false;
      }

      var storedPendingCheckout = storeGet("checkout_pending", 4096);
      if (storedPendingCheckout) {
        if (!Number.isSafeInteger(storedPendingCheckout.started_at) || (nowSec() - storedPendingCheckout.started_at) >= 1800) {
          storeRemove("checkout_pending");
        } else if (checkoutReturned) {
          storedPendingCheckout.returned = true;
          if (!storedPendingCheckout.repo && preselectedRepo) storedPendingCheckout.repo = preselectedRepo;
          if (!storedPendingCheckout.continuation && activeContinuation) storedPendingCheckout.continuation = activeContinuation;
          storeSet("checkout_pending", storedPendingCheckout);
        }
      } else if (checkoutReturned) {
        storeSet("checkout_pending", {
          project_id: preselectedRepo || null,
          repo: preselectedRepo || null,
          continuation: activeContinuation || null,
          returned: true,
          started_at: nowSec()
        });
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
        setStatus("Please sign in using the GitHub button below.", true);
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
          setStatus("Your sign-in session expired. Please sign in with GitHub to continue.", true);
          return;
        }

        if (oauthError) {
          storeRemove("flow");
          syncAuthGateUi();
          setStatus("Sign-in was canceled.", false);
          if (session) await loadAuthenticatedAccount(mySessionEpoch, viewGeneration);
          return;
        }

        if (codeList.length !== 1 || typeof code !== "string" || !code || code.length > 2048) {
          storeRemove("flow");
          syncAuthGateUi();
          setStatus("Sign-in response was invalid. Please try again.", true);
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
        if (checkoutReturned || checkoutCanceled) {
          setStatus("Sign in with GitHub to view your subscription status.", false);
        }
        return;
      }
      await loadAuthenticatedAccount(mySessionEpoch, viewGeneration);
    }

    function bindEvents() {
      var ghBtn = byId("auth-github");
      if (ghBtn) ghBtn.onclick = function () { beginAuth("github", "sign_in", false).catch(function () { setStatus("Could not start GitHub sign-in.", true); }); };
      var googleBtn = byId("auth-google");
      if (googleBtn) googleBtn.onclick = function () { beginAuth("google", "sign_in", false).catch(function () { setStatus("Could not start Google sign-in.", true); }); };
      var cancelBtn = byId("cancel-auth-btn");
      if (cancelBtn) cancelBtn.onclick = function () { storeRemove("flow"); syncAuthGateUi(); setStatus("Sign-in canceled.", false); };
      var signOutBtn = byId("sign-out-btn");
      if (signOutBtn) {
        signOutBtn.onclick = function () {
          clearPendingIntent();
          invalidateSessionState("Signed out. Sign in with GitHub to continue.", false, true);
        };
      }
      var linkGhBtn = byId("link-github-btn");
      if (linkGhBtn) linkGhBtn.onclick = function () { beginAuth("github", "link", true).catch(function () { setStatus("Could not link GitHub.", true); }); };
      var confirmProvBtn = byId("confirm-provider-btn");
      if (confirmProvBtn) {
        confirmProvBtn.onclick = function () {
          if (!pendingStepupProvider) return;
          var myEpoch = sessionEpoch;
          edgePost("account-register", {
            operation: "resolve_provider_quarantine",
            provider: pendingStepupProvider,
            decision: "confirm"
          }, { sessionEpoch: myEpoch, signal: sessionAbortController ? sessionAbortController.signal : null })
            .then(function () { if (myEpoch === sessionEpoch) return loadAuthenticatedAccount(myEpoch, viewGeneration); })
            .catch(function () { if (myEpoch === sessionEpoch) setStatus("Could not confirm sign-in method.", true); });
        };
      }
      var revokeProvBtn = byId("revoke-provider-btn");
      if (revokeProvBtn) {
        revokeProvBtn.onclick = function () {
          if (!pendingStepupProvider) return;
          var myEpoch = sessionEpoch;
          edgePost("account-register", {
            operation: "resolve_provider_quarantine",
            provider: pendingStepupProvider,
            decision: "revoke"
          }, { sessionEpoch: myEpoch, signal: sessionAbortController ? sessionAbortController.signal : null })
            .then(function () { if (myEpoch === sessionEpoch) return loadAuthenticatedAccount(myEpoch, viewGeneration); })
            .catch(function () { if (myEpoch === sessionEpoch) setStatus("Could not remove sign-in method.", true); });
        };
      }
      var repoForm = byId("repo-form");
      if (repoForm) {
        repoForm.onsubmit = function (ev) {
          if (ev && typeof ev.preventDefault === "function") ev.preventDefault();
          handleVerifyAndEnrollRepo().catch(function () { setStatus("Could not verify repository.", true); });
        };
      }
      var verifyRepoBtn = byId("verify-repo-btn");
      if (verifyRepoBtn) verifyRepoBtn.onclick = function (ev) {
        if (ev && typeof ev.preventDefault === "function") ev.preventDefault();
        handleVerifyAndEnrollRepo().catch(function () { setStatus("Could not verify repository.", true); });
      };
      var authReposBtn = byId("authorize-github-repos-btn");
      if (authReposBtn) authReposBtn.onclick = function () { beginAuth("github", "sign_in", true).catch(function () { setStatus("Could not open GitHub authorization.", true); }); };
      var stateRetryBtn = byId("state-retry-btn");
      if (stateRetryBtn) {
        stateRetryBtn.onclick = function () {
          if (lastStateKind === "pending_fulfillment") {
            runContinuationPoll(activeContinuation, activeProjectId).catch(function () {});
          } else if (activeProjectId) {
            inspectProjectAccess(activeOrganizationId, activeProjectId, preselectedRepo || activeProjectId)
              .catch(function (e) { if (e && e.name !== "AbortError") showDegradedApiState(e, preselectedRepo || activeProjectId, true); });
          } else if (session) {
            loadAuthenticatedAccount(sessionEpoch, viewGeneration)
              .catch(function (e) { if (e && e.name !== "AbortError") showDegradedApiState(e, preselectedRepo, true); });
          }
        };
      }
      var resumeCheckoutBtn = byId("state-resume-checkout-btn");
      if (resumeCheckoutBtn) {
        resumeCheckoutBtn.onclick = function () {
          if (activeOrganizationId && activeProjectId) {
            showCheckoutPanel(activeOrganizationId, activeProjectId, preselectedRepo || activeProjectId, viewGeneration).catch(function () {});
          }
        };
      }
      var changeRepoBtn = byId("state-change-repo-btn");
      if (changeRepoBtn) changeRepoBtn.onclick = function () { pollGeneration++; storeRemove("checkout_return_state"); showOrgRepoPicker("").catch(function () {}); };
      var checkoutBackBtn = byId("checkout-back-btn");
      if (checkoutBackBtn) checkoutBackBtn.onclick = function () { showOrgRepoPicker("").catch(function () {}); };

      var cadenceEl = byId("billing-cadence");
      if (cadenceEl) cadenceEl.onchange = function () { scheduleQuoteRefresh(); };
      var seatEl = byId("seat-quantity");
      if (seatEl) {
        seatEl.onchange = function () { scheduleQuoteRefresh(); };
        seatEl.oninput = function () { scheduleQuoteRefresh(); };
      }
      var minusBtn = byId("seat-minus-btn");
      if (minusBtn) {
        minusBtn.onclick = function () {
          var el = byId("seat-quantity");
          if (!el) return;
          var next = Math.max(1, (Math.floor(Number(el.value)) || 1) - 1);
          el.value = String(next);
          scheduleQuoteRefresh();
        };
      }
      var plusBtn = byId("seat-plus-btn");
      if (plusBtn) {
        plusBtn.onclick = function () {
          var el = byId("seat-quantity");
          if (!el) return;
          var next = Math.min(1000, (Math.floor(Number(el.value)) || 1) + 1);
          el.value = String(next);
          scheduleQuoteRefresh();
        };
      }

      var checkoutBtn = byId("checkout-btn");
      if (checkoutBtn) checkoutBtn.onclick = function () { handleCheckoutClick().catch(function () {}); };
      var portalBtn = byId("ready-billing-portal-btn");
      if (portalBtn) portalBtn.onclick = function () { handleOpenBillingPortal().catch(function () {}); };
      var readyAnotherBtn = byId("ready-another-btn");
      if (readyAnotherBtn) readyAnotherBtn.onclick = function () {
        clearPendingIntent();
        storeRemove("checkout_return_state");
        showOrgRepoPicker("").catch(function () {});
      };
    }

    async function init() {
      if (flowOk) {
        var coherence = flow.checkPageCoherence({
          document: doc,
          requiredIds: ["auth-gate", "step-state", "step-checkout", "checkout-btn"]
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
          try { winHistory.replaceState(null, "", "/signup"); } catch (_) {}
        }
        hideAllProtectedPanels();
        var ghBtn = byId("auth-github");
        var googleBtn = byId("auth-google");
        var checkoutBtn = byId("checkout-btn");
        if (ghBtn) ghBtn.disabled = true;
        if (googleBtn) googleBtn.disabled = true;
        if (checkoutBtn) checkoutBtn.disabled = true;
        setStatus("A newer version of this page is required (" + (skewReason || "mismatch") + "). Reload to continue.", true);
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
            enrollInFlight = false;
            quoteInFlight = false;
            checkoutInFlight = false;
            syncAuthGateUi();
            if (session && activeOrganizationId && activeProjectId) {
              inspectProjectAccess(activeOrganizationId, activeProjectId, preselectedRepo || activeProjectId)
                .catch(function () {});
            }
          }
        });
      }

      bindEvents();
      var mySessionEpoch = ++sessionEpoch;
      resetSessionAbortController();
      try {
        syncAuthGateUi();
        await processIncomingUrlAndSession(mySessionEpoch);
      } catch (error) {
        if (error && error.name === "AbortError") return;
        if (mySessionEpoch !== sessionEpoch) return;
        try { syncAuthGateUi(); } catch (_) {}
        if (!skewBlocked && session && profile && flow.validateSessionRecord(session, profile.projectOrigin, nowSec())) {
          showDegradedApiState(error, preselectedRepo, true);
        } else {
          var initRef = formatSupportRef(error, null);
          setStatus("Sign-in could not be completed." + (initRef ? " " + initRef : ""), true);
        }
      }
    }

    return {
      init: init,
      beginAuth: beginAuth,
      verifyRepo: handleVerifyAndEnrollRepo,
      requestQuote: requestAutomaticQuote,
      startCheckout: handleCheckoutClick,
      pollFulfillment: runContinuationPoll,
      close: function () { abortAllInFlight(); coherenceChannel.close(); },
      getState: function () {
        return {
          authenticated: Boolean(!skewBlocked && flowOk && profile && flow.validateSessionRecord(session, profile.projectOrigin, nowSec())),
          skewBlocked: skewBlocked,
          skewReason: skewReason,
          preselectedRepo: preselectedRepo,
          preferredBilling: preferredBilling,
          preferredSeats: preferredSeats,
          activeProjectId: activeProjectId,
          activeOrganizationId: activeOrganizationId,
          backendAuthorized: backendAuthorized,
          stateKind: lastStateKind,
          checkoutInFlight: checkoutInFlight,
          enrollInFlight: enrollInFlight,
          quoteInFlight: quoteInFlight,
          siblingCheckoutActive: Boolean(siblingCheckout)
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
