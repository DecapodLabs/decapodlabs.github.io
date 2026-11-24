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
      typeof candidate.parseRepoSearch === "function" &&
      typeof candidate.parseRepoSlug === "function" &&
      typeof candidate.parseSafeReturnParam === "function" &&
      typeof candidate.validateSessionRecord === "function" &&
      typeof candidate.hasHostileFragmentTokens === "function" &&
      typeof candidate.listVerifiedProviders === "function" &&
      typeof candidate.hasVerifiedProvider === "function" &&
      typeof candidate.classifyAccessState === "function" &&
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
    var sleepFn = d.sleepFn || function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
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
    var preselectedRepo = null;
    var preferredBilling = "month";
    var checkoutReturned = false;
    var activeProjectId = null;
    var activeOrganizationId = null;
    var activeQuoteOrder = null;
    var quoteRequestId = null;
    var quotePayloadKey = null;
    var checkoutRequestId = null;
    var checkoutRequestKey = null;
    var enrollRequestId = null;
    var enrollRepoSlug = null;
    var githubReposCache = [];
    var githubOrgsCache = [];
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
    var siblingCheckout = null;
    var backendAuthorized = false;
    var lastStateKind = null;
    var coherenceChannel = flowOk
      ? flow.createCoherenceChannel({
          BroadcastChannel: d.broadcastChannel,
          onSkew: function () {
            skewBlocked = true;
            skewReason = "multi_tab_release_skew";
            invalidateSessionState("A newer release of Decapod Cloud is active in another tab. Reload this page to continue safely.", true, false);
          },
          onAuthInvalidated: function (msg) {
            if (msg && msg.projectOrigin && profile && msg.projectOrigin !== profile.projectOrigin) return;
            invalidateSessionState("Signed out in another tab. Authenticate again to continue.", false, false);
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
                setStatus("Checkout is already open in another tab for " + msg.projectId + ". Complete it there or refresh status before starting another.", false);
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
      backendAuthorized = false;
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
      siblingCheckout = null;
      backendAuthorized = false;
      lastStateKind = null;
      checkoutReturned = false;
      storeRemove("flow");
      storeRemove("session");
      storeRemove("checkout_pending");
      storeRemove("checkout_req");
      storeRemove("enroll_req");
      session = null;
      currentUser = null;
      accountSnapshot = null;
      inMemoryProviderToken = null;
      pendingStepupProvider = null;
      quoteRequestId = null;
      quotePayloadKey = null;
      checkoutRequestId = null;
      checkoutRequestKey = null;
      enrollRequestId = null;
      enrollRepoSlug = null;
      githubReposCache = [];
      githubOrgsCache = [];
      var repoInput = byId("repo-input");
      if (repoInput) repoInput.value = "";
      syncAuthGateUi();
      if (broadcast !== false && flowOk && profile) {
        coherenceChannel.broadcastAuthInvalidated(profile.projectOrigin);
      }
      if (statusMessage) {
        setStatus(statusMessage, Boolean(isError));
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
      }
      var providers = profile ? profile.authProviders : { github: true, google: false };
      var ghBtn = byId("auth-github");
      var googleBtn = byId("auth-google");
      if (ghBtn) ghBtn.disabled = skewBlocked || busy || !providers.github;
      if (googleBtn) {
        googleBtn.disabled = skewBlocked || busy || !providers.google;
      }
      var noteEl = byId("auth-provider-note");
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

    function formatSupportRef(err, fallbackId) {
      var ref = (err && typeof err.correlationId === "string" && err.correlationId) ||
        (typeof fallbackId === "string" && fallbackId ? fallbackId : null);
      return ref ? "Support ref: " + ref : "";
    }

    function statusCodeToFailureKind(err) {
      if (!err) return "backend_unavailable";
      var msg = err.message || "";
      if (err.status === 403 || msg === "admin_required" || msg === "organization_access_denied" || msg === "forbidden") {
        return "access_denied";
      }
      if (err.status === 429 || msg === "rate_limited") {
        return "rate_limited";
      }
      return "backend_unavailable";
    }

    function showDegradedApiState(err, fallbackRef, allowRetry) {
      var kind = statusCodeToFailureKind(err);
      var refText = formatSupportRef(err, fallbackRef);
      var retryWait = err && Number.isSafeInteger(err.retryAfterSec) && err.retryAfterSec > 0
        ? " Wait at least " + err.retryAfterSec + "s before retrying."
        : "";
      if (kind === "access_denied") {
        showFailClosedState(
          "access_denied",
          "ACCESS DENIED",
          "Authorization denied by server",
          "The server denied access to this organization or repository (" + (err && err.message ? err.message : "forbidden") + ").",
          refText || "Contact an organization administrator to verify your access.",
          false
        );
        setStatus("Access denied (" + (err && err.message ? err.message : "forbidden") + ")." + (refText ? " " + refText + "." : ""), true);
        return;
      }
      if (kind === "rate_limited") {
        showFailClosedState(
          "rate_limited",
          "RATE LIMITED (429)",
          "Too many requests — please wait",
          "Cloud API rate limit reached. Do not submit duplicate payments or repeated checkouts." + retryWait,
          (refText ? refText + ". " : "") + "Use Check status now after waiting.",
          allowRetry !== false
        );
        setStatus("Rate-limited (429)." + retryWait + (refText ? " " + refText + "." : ""), true);
        return;
      }
      showFailClosedState(
        "backend_unavailable",
        "SERVICE UNAVAILABLE",
        "Cloud backend temporarily unavailable",
        "The Decapod Cloud API could not be reached or returned an error. Your repository intent remains preserved and no duplicate payment was created.",
        (refText ? refText + ". " : "") + "Use Check status now once connectivity recovers.",
        allowRetry !== false
      );
      setStatus("Cloud backend unavailable (" + (err && err.message ? err.message : "service_unavailable") + ")." + (refText ? " " + refText + "." : ""), true);
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
        invalidateSessionState("API contract version mismatch. Reload this page to continue safely.", true, false);
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
        invalidateSessionState("API payload version mismatch. Reload this page to continue safely.", true, false);
        throw new Error("contract_version_mismatch");
      }
      if (!response.ok) {
        var errCode = data && ((data.error && data.error.code) || data.error_code || data.code) ||
          (response.status === 429 ? "rate_limited" : response.status === 403 ? "forbidden" : response.status >= 500 ? "service_unavailable" : "request_failed");
        if ((response.status === 401 || errCode === "invalid_token") && expectedSessionEpoch === sessionEpoch) {
          invalidateSessionState("Your session expired or was revoked. Sign in again to continue.", true, true);
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

    function requireToken() {
      if (skewBlocked || !flowOk || !profile || !flow.validateSessionRecord(session, profile.projectOrigin, nowSec())) {
        throw new Error("sign_in_required");
      }
      return session.access_token;
    }

    async function edgePost(action, body, reqOptions) {
      var bearer = requireToken();
      return await apiRequest(profile.onboardingPrefix + "/" + action, Object.assign({ version: 1 }, body || {}), bearer, "POST", reqOptions);
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
        var returnTarget = new URL(origin + "/signup");
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
      backendAuthorized = false;
      lastStateKind = kind;
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
      if (!accessStatus || accessStatus.backend_authorized !== true || accessStatus.status !== "active") {
        throw new Error("invalid_response");
      }
      pollGeneration++;
      hideAllProtectedPanels();
      backendAuthorized = true;
      lastStateKind = "ready";
      siblingCheckout = null;
      storeRemove("checkout_pending");
      storeRemove("checkout_req");
      checkoutRequestId = null;
      checkoutRequestKey = null;
      renderAccountBar();
      var card = byId("step-ready");
      var summary = byId("ready-summary");
      if (!card || !summary) return;
      var resolvedProject = accessStatus.project_id || projectId;
      var roleLabel = accessStatus.admin ? "workspace administrator" : "assigned repository contributor";
      summary.textContent = "Repository " + resolvedProject +
        " is active and server-authorized (" + roleLabel + ").";
      card.hidden = false;
      setStatus("Ready: backend_authorized=true for " + resolvedProject + ".", false);
      if (flowOk && profile) {
        coherenceChannel.broadcastCheckoutEvent("fulfillment_status", {
          projectOrigin: profile.projectOrigin,
          organizationId: activeOrganizationId,
          projectId: resolvedProject,
          state: "ready"
        });
      }
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

    async function loadGitHubOrgsAndRepos(expectedSessionEpoch, expectedViewGen) {
      var mySessionEpoch = typeof expectedSessionEpoch === "number" ? expectedSessionEpoch : sessionEpoch;
      var myViewGen = typeof expectedViewGen === "number" ? expectedViewGen : viewGeneration;
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
        var sig = viewAbortController ? viewAbortController.signal : (sessionAbortController ? sessionAbortController.signal : undefined);
        var userRes = await fetchFn("https://api.github.com/user", {
          method: "GET",
          redirect: "error",
          signal: sig,
          headers: headers
        });
        if (!isActiveView(mySessionEpoch, myViewGen)) return;
        var orgsRes = await fetchFn("https://api.github.com/user/orgs?per_page=100", {
          method: "GET",
          redirect: "error",
          signal: sig,
          headers: headers
        });
        if (!isActiveView(mySessionEpoch, myViewGen)) return;
        var reposRes = await fetchFn("https://api.github.com/user/repos?per_page=100&affiliation=owner,organization_member", {
          method: "GET",
          redirect: "error",
          signal: sig,
          headers: headers
        });
        if (!isActiveView(mySessionEpoch, myViewGen)) return;
        if (!userRes.ok || !reposRes.ok) {
          if (authBtn) authBtn.hidden = false;
          var ghHint = byId("org-repo-hint");
          var ghStatus = !userRes.ok ? userRes.status : reposRes.status;
          if (ghHint) {
            ghHint.textContent = ghStatus === 429
              ? "GitHub repository lookup was rate-limited (429). Enter owner/repo manually or retry shortly."
              : "GitHub repository lookup is temporarily unavailable (" + ghStatus + "). Enter owner/repo manually or re-authorize lookup.";
          }
          return;
        }
        var ghUser = await userRes.json();
        var ghOrgs = orgsRes.ok ? await orgsRes.json() : [];
        var ghRepos = await reposRes.json();
        if (!isActiveView(mySessionEpoch, myViewGen)) return;
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
        if (!isActiveView(mySessionEpoch, myViewGen)) return;
        if (authBtn) authBtn.hidden = false;
        var ghCatchHint = byId("org-repo-hint");
        if (ghCatchHint) {
          ghCatchHint.textContent = "GitHub repository lookup could not be reached. Enter owner/repo manually or retry.";
        }
      }
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
      var panel = byId("step-org-repo");
      var input = byId("repo-input");
      var hint = byId("org-repo-hint");
      if (!panel) return;
      if (preselectedRepo && input && !input.value) {
        input.value = preselectedRepo;
      }
      if (hint) hint.textContent = note || "";
      panel.hidden = false;
      await loadGitHubOrgsAndRepos(mySessionEpoch, myViewGen);
    }

    async function runPendingFulfillmentPoll(projectId) {
      var mySessionEpoch = sessionEpoch;
      var myViewGen = viewGeneration;
      var myGen = ++pollGeneration;
      var mySignal = viewAbortController ? viewAbortController.signal : (sessionAbortController ? sessionAbortController.signal : null);
      showFailClosedState(
        "pending_fulfillment",
        "FULFILLMENT IN PROGRESS",
        "Confirming payment & repository seat",
        "Checkout redirect alone never grants access. Waiting for server-verified payment settlement and repository seat activation.",
        "Checking fulfillment status…",
        true
      );
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
              ? "Checking server fulfillment (attempt " + info.attempt + " of " + info.maxAttempts + ")…"
              : "Still waiting on settlement (attempt " + info.attempt + " of " + info.maxAttempts + ")…";
          },
          checkFn: async function () {
            return await edgePost("account-status", {
              project_id: projectId,
              operation: "access_details"
            }, { sessionEpoch: mySessionEpoch, signal: mySignal });
          }
        });
      } catch (err) {
        if ((err && err.name === "AbortError") || myGen !== pollGeneration || mySessionEpoch !== sessionEpoch || myViewGen !== viewGeneration) {
          return;
        }
        if (err && (err.status === 403 || err.message === "admin_required" || err.message === "organization_access_denied" || err.message === "forbidden")) {
          storeRemove("checkout_pending");
          showDegradedApiState(err, checkoutRequestId, false);
          return;
        }
        throw err;
      }

      if (myGen !== pollGeneration || mySessionEpoch !== sessionEpoch || myViewGen !== viewGeneration) return;
      if (outcome.outcome === "cancelled") return;
      if (outcome.outcome === "ready") {
        showReadyState(projectId, outcome.result);
        return;
      }
      if (outcome.outcome === "admin_approval_required") {
        storeRemove("checkout_pending");
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
        storeRemove("checkout_pending");
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
      var pendingCheckoutMeta = storeGet("checkout_pending", 4096);
      var pendingCorr = (outcome.lastError && outcome.lastError.correlationId) ||
        (pendingCheckoutMeta && (pendingCheckoutMeta.order_id || pendingCheckoutMeta.request_id)) ||
        checkoutRequestId ||
        projectId;
      var refDetail = pendingCorr ? (" Support ref: " + pendingCorr + ".") : "";
      showFailClosedState(
        "pending_timeout",
        "CONFIRMATION TIMED OUT",
        "Payment confirmation still pending",
        "Checkout redirect alone never grants access. Server fulfillment has not confirmed settlement yet (backend_authorized=false). Do not start a duplicate payment while settlement is pending.",
        "Fulfillment is still pending after " + outcome.attempts +
          " checks. Access remains locked until settlement completes. Use Check status now to retry." + refDetail,
        true
      );
      setStatus("Fulfillment confirmation timed out (pending_timeout). Access remains locked (backend_authorized=false)." + refDetail, true);
      if (flowOk && profile) {
        coherenceChannel.broadcastCheckoutEvent("fulfillment_status", {
          projectOrigin: profile.projectOrigin,
          organizationId: activeOrganizationId,
          projectId: projectId,
          state: "pending_timeout"
        });
      }
    }

    async function showCheckoutPanel(orgId, projectId, repoLabel, expectedViewGen, customStatus) {
      var mySessionEpoch = sessionEpoch;
      var myViewGen = typeof expectedViewGen === "number" ? expectedViewGen : viewGeneration;
      var mySignal = viewAbortController ? viewAbortController.signal : (sessionAbortController ? sessionAbortController.signal : null);
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
        }, { sessionEpoch: mySessionEpoch, signal: mySignal });
        if (!isActiveView(mySessionEpoch, myViewGen) || activeProjectId !== projectId) return;
        if (closedBox) closedBox.hidden = true;
        if (quoteControls) quoteControls.hidden = false;
        card.hidden = false;
        setStatus(customStatus || "Organization and repository verified. Request an authoritative server quote to continue.", false);
        if (bStatus && bStatus.pending_order && bStatus.pending_order.quote_id) {
          renderQuoteSummary(bStatus.pending_order, repoLabel || projectId);
        }
      } catch (error) {
        if ((error && error.name === "AbortError") || !isActiveView(mySessionEpoch, myViewGen) || activeProjectId !== projectId) return;
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
      var blockedBySibling = Boolean(siblingCheckout && siblingCheckout.projectId === activeProjectId);
      checkoutBtn.disabled = !quoted.quote_id || quoted.status === "scheduled" || checkoutInFlight || blockedBySibling;
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
      var access = null;
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
          await runPendingFulfillmentPoll(projectId);
          return;
        }
        if (err && (err.status === 401 || err.message === "invalid_token" || err.message === "contract_version_mismatch" || err.message === "client_version_skew")) {
          throw err;
        }
        showDegradedApiState(err, (pendingCheckout && pendingCheckout.order_id) || projectId, true);
        return;
      }
      if (!isActiveView(mySessionEpoch, myViewGen) || activeProjectId !== projectId) return;
      var state = flow.classifyAccessState(access);
      if (state === "ready") {
        showReadyState(projectId, access);
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
        await runPendingFulfillmentPoll(projectId);
        return;
      }
      if (state === "organization_already_enrolled") {
        storeRemove("checkout_pending");
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
        storeRemove("checkout_pending");
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
        var returnedFromBack = matchingPending && !checkoutReturned && !pendingReturned;
        if (returnedFromBack) {
          storeRemove("checkout_pending");
          siblingCheckout = null;
        }
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
        await showCheckoutPanel(
          access.organization_id || orgId,
          projectId,
          repoLabel,
          myViewGen,
          returnedFromBack ? "Returned from Checkout before completion. Request or confirm a fresh server quote to continue." : null
        );
        return;
      }
      await showOrgRepoPicker("Complete repository verification to continue.");
    }

    async function handleVerifyAndEnrollRepo() {
      if (enrollInFlight) return;
      var input = byId("repo-input");
      var hint = byId("org-repo-hint");
      var verifyBtn = byId("verify-repo-btn");
      var rawSlug = input ? input.value : "";
      var parsed = flow.parseRepoSlug(rawSlug);
      if (!parsed) {
        if (hint) hint.textContent = "Enter a valid repository as owner/repo (letters, digits, ., _, - only).";
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
        storeSet("pending-repo", parsed.slug);

        var existing = findExistingProject(parsed.slug);
        if (existing) {
          await inspectProjectAccess(existing.organization_id || existing.organization, existing.project_id, parsed.slug, myViewGen);
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
        var enrolled = await edgePost("repository-enroll", enrollBody, { sessionEpoch: mySessionEpoch, signal: mySignal });
        if (!isActiveView(mySessionEpoch, myViewGen)) return;
        if (enrolled.status !== "repository_enrolled" || typeof enrolled.project_id !== "string") {
          throw new Error(enrolled.status || "repository_verification_required");
        }
        enrollRequestId = null;
        enrollRepoSlug = null;
        storeRemove("enroll_req");
        await loadAuthenticatedAccount(mySessionEpoch, myViewGen);
        if (!isActiveView(mySessionEpoch, myViewGen)) return;
        await inspectProjectAccess(enrolled.organization_id, enrolled.project_id, parsed.slug, myViewGen);
      } catch (error) {
        if ((error && error.name === "AbortError") || !isActiveView(mySessionEpoch, myViewGen)) return;
        var code = error && error.message ? error.message : "repository_verification_required";
        if (code === "organization_already_enrolled") {
          enrollRequestId = null;
          enrollRepoSlug = null;
          storeRemove("enroll_req");
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
          enrollRequestId = null;
          enrollRepoSlug = null;
          storeRemove("enroll_req");
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
          enrollRequestId = null;
          enrollRepoSlug = null;
          storeRemove("enroll_req");
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
      } finally {
        enrollInFlight = false;
        if (verifyBtn) verifyBtn.disabled = false;
      }
    }

    async function handleQuoteClick() {
      if (quoteInFlight || !activeOrganizationId || !activeProjectId) return;
      var cadenceEl = byId("billing-cadence");
      var seatEl = byId("seat-quantity");
      var quoteBtn = byId("quote-btn");
      var cadence = cadenceEl && cadenceEl.value === "year" ? "year" : "month";
      var capacity = Math.floor(Number(seatEl ? seatEl.value : 1));
      if (!Number.isSafeInteger(capacity) || capacity < 1 || capacity > 1000) {
        setStatus("Enter a seat count between 1 and 1000.", true);
        return;
      }
      var targetOrgId = activeOrganizationId;
      var targetProjId = activeProjectId;
      var payload = {
        organization_id: targetOrgId,
        cadence: cadence,
        allocations: [{ project_id: targetProjId, capacity: capacity }]
      };
      var canonical = JSON.stringify(payload);
      if (quotePayloadKey !== canonical || !quoteRequestId) {
        quotePayloadKey = canonical;
        quoteRequestId = makeRequestId();
      }
      quoteInFlight = true;
      if (quoteBtn) quoteBtn.disabled = true;
      var mySessionEpoch = sessionEpoch;
      var myViewGen = viewGeneration;
      var myQuoteGen = ++quoteGeneration;
      var mySignal = viewAbortController ? viewAbortController.signal : (sessionAbortController ? sessionAbortController.signal : null);
      try {
        setStatus("Requesting authoritative quote from server…", false);
        var quoted = await edgePost("billing-quote", Object.assign({ request_id: quoteRequestId }, payload), {
          sessionEpoch: mySessionEpoch,
          signal: mySignal
        });
        if (!isActiveView(mySessionEpoch, myViewGen) || myQuoteGen !== quoteGeneration ||
            activeOrganizationId !== targetOrgId || activeProjectId !== targetProjId) {
          return;
        }
        renderQuoteSummary(quoted, preselectedRepo || targetProjId);
        setStatus("Server quote ready. Review exact amount and terms before opening Stripe Checkout.", false);
      } catch (error) {
        if ((error && error.name === "AbortError") || !isActiveView(mySessionEpoch, myViewGen) ||
            myQuoteGen !== quoteGeneration || activeProjectId !== targetProjId) {
          return;
        }
        var code = error && error.message ? error.message : "billing_quote_unavailable";
        if (code === "billing_not_configured" || code === "live_sale_disabled") {
          await showCheckoutPanel(targetOrgId, targetProjId, preselectedRepo || targetProjId, myViewGen);
          return;
        }
        var quoteRef = formatSupportRef(error, quoteRequestId);
        var quoteWait = error && Number.isSafeInteger(error.retryAfterSec) && error.retryAfterSec > 0
          ? " Wait " + error.retryAfterSec + "s before retrying."
          : "";
        setStatus("Quote unavailable (" + code + ")." + quoteWait + (quoteRef ? " " + quoteRef + "." : ""), true);
      } finally {
        quoteInFlight = false;
        if (quoteBtn) quoteBtn.disabled = false;
      }
    }

    async function handleCheckoutClick() {
      if (checkoutInFlight) return;
      if (!activeOrganizationId || !activeQuoteOrder || !activeQuoteOrder.quote_id) {
        setStatus("Request a valid server quote before proceeding to Checkout.", true);
        return;
      }
      if (siblingCheckout && siblingCheckout.projectId === activeProjectId) {
        setStatus("Checkout is already open in another tab for " + activeProjectId + ". Complete it there or refresh status before starting another.", true);
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
        setStatus("Creating server-bound Checkout session…", false);
        var result = await edgePost("billing-checkout", {
          request_id: checkoutRequestId,
          organization_id: targetOrgId,
          order_id: targetOrderId,
          quote_id: targetQuoteId
        }, { sessionEpoch: mySessionEpoch, signal: mySignal });
        if (!isActiveView(mySessionEpoch, myViewGen) || activeProjectId !== targetProjId) return;
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
            repo: preselectedRepo || targetProjId,
            returned: true,
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
          await runPendingFulfillmentPoll(targetProjId);
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
          var quoteSummary = byId("quote-summary");
          if (quoteSummary) quoteSummary.hidden = true;
          if (checkoutBtn) checkoutBtn.disabled = true;
          setStatus("Quote expired or changed (" + errCode + "). Request a fresh server quote before continuing.", true);
          return;
        }
        var checkoutRef = formatSupportRef(error, checkoutRequestId);
        if (error && (error.status === 429 || errCode === "rate_limited")) {
          var waitSec = Number.isSafeInteger(error.retryAfterSec) && error.retryAfterSec > 0
            ? " Wait " + error.retryAfterSec + "s before retrying."
            : " Wait briefly before retrying.";
          setStatus("Checkout request rate-limited (429)." + waitSec + " Do not start a duplicate payment." + (checkoutRef ? " " + checkoutRef + "." : ""), true);
        } else if (error && (error.status >= 500 || errCode === "service_unavailable" || errCode === "request_timeout")) {
          setStatus("Checkout acknowledgement unavailable (" + errCode + "). Do not submit a duplicate payment; check status or retry with the same quote." + (checkoutRef ? " " + checkoutRef + "." : ""), true);
        } else {
          setStatus("Checkout could not be started (" + errCode + ")." + (checkoutRef ? " " + checkoutRef + "." : ""), true);
        }
        if (checkoutBtn && activeQuoteOrder && activeQuoteOrder.quote_id &&
            !(siblingCheckout && siblingCheckout.projectId === activeProjectId)) {
          checkoutBtn.disabled = false;
        }
      } finally {
        checkoutInFlight = false;
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
      var targetLookup = preselectedRepo;
      if (!targetLookup) {
        var pendingCheckout = storeGet("checkout_pending", 4096);
        if (pendingCheckout && Number.isSafeInteger(pendingCheckout.started_at) && (nowSec() - pendingCheckout.started_at) < 1800) {
          targetLookup = pendingCheckout.repo || pendingCheckout.project_id || null;
        }
      }
      if (targetLookup) {
        var existing = findExistingProject(targetLookup);
        if (existing) {
          await inspectProjectAccess(existing.organization_id || existing.organization, existing.project_id, targetLookup, myViewGen);
          return;
        }
      }
      await showOrgRepoPicker(
        preselectedRepo
          ? "Verify GitHub administration for " + preselectedRepo + " to continue."
          : "Select an organization and repository to enroll or check access."
      );
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

      var storedPendingCheckout = storeGet("checkout_pending", 4096);
      if (storedPendingCheckout) {
        if (!Number.isSafeInteger(storedPendingCheckout.started_at) || (nowSec() - storedPendingCheckout.started_at) >= 1800) {
          storeRemove("checkout_pending");
        } else if (checkoutReturned) {
          storedPendingCheckout.returned = true;
          if (!storedPendingCheckout.repo && preselectedRepo) storedPendingCheckout.repo = preselectedRepo;
          storeSet("checkout_pending", storedPendingCheckout);
        }
      } else if (checkoutReturned) {
        storeSet("checkout_pending", {
          project_id: preselectedRepo || null,
          repo: preselectedRepo || null,
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
        setStatus("Rejected URL fragment tokens. Sign in through the managed PKCE button below.", true);
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
          if (session) await loadAuthenticatedAccount(mySessionEpoch, viewGeneration);
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
        setStatus("Sign in with GitHub or Google to verify your organization and repository.", false);
        return;
      }
      await loadAuthenticatedAccount(mySessionEpoch, viewGeneration);
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
          preselectedRepo = null;
          try {
            if (storage) storage.removeItem("decapod:pending-repo-intent");
          } catch (_) {}
          invalidateSessionState("Signed out. Authenticate to continue.", false, true);
        };
      }
      var refreshBtn = byId("refresh-account-btn");
      if (refreshBtn) refreshBtn.onclick = function () { loadAuthenticatedAccount(sessionEpoch, viewGeneration).catch(function (e) { if (e && e.name !== "AbortError") setStatus("Refresh failed: " + e.message, true); }); };
      var linkGhBtn = byId("link-github-btn");
      if (linkGhBtn) linkGhBtn.onclick = function () { beginAuth("github", "link", true).catch(function (e) { setStatus("GitHub linking failed: " + e.message, true); }); };
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
            .catch(function (e) { if (e && e.name !== "AbortError" && myEpoch === sessionEpoch) setStatus("Provider confirmation failed: " + e.message, true); });
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
            .catch(function (e) { if (e && e.name !== "AbortError" && myEpoch === sessionEpoch) setStatus("Provider revocation failed: " + e.message, true); });
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
              .catch(function (e) { if (e && e.name !== "AbortError") showDegradedApiState(e, preselectedRepo || activeProjectId, true); });
          } else if (session) {
            loadAuthenticatedAccount(sessionEpoch, viewGeneration)
              .catch(function (e) { if (e && e.name !== "AbortError") showDegradedApiState(e, preselectedRepo, true); });
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
      if (flowOk) {
        var coherence = flow.checkPageCoherence({
          document: doc,
          requiredIds: ["auth-gate", "step-state", "step-checkout", "checkout-btn", "signup-status"]
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
          setStatus("Authentication could not be completed (" + (error && error.message ? error.message : "error") + ")." + (initRef ? " " + initRef + "." : ""), true);
        }
      }
    }

    return {
      init: init,
      beginAuth: beginAuth,
      verifyRepo: handleVerifyAndEnrollRepo,
      requestQuote: handleQuoteClick,
      startCheckout: handleCheckoutClick,
      pollFulfillment: runPendingFulfillmentPoll,
      close: function () { abortAllInFlight(); coherenceChannel.close(); },
      getState: function () {
        return {
          authenticated: Boolean(!skewBlocked && flowOk && profile && flow.validateSessionRecord(session, profile.projectOrigin, nowSec())),
          skewBlocked: skewBlocked,
          skewReason: skewReason,
          preselectedRepo: preselectedRepo,
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
