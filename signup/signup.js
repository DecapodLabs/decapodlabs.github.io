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
    var originRepoSlug = null;
    var originProjectId = null;
    var sourceMode = null;
    var pricingReposCount = 1;
    var preferredBilling = "month";
    var preferredSeats = 1;
    var seatsExplicitInUrl = false;
    var checkoutReturned = false;
    var checkoutCanceled = false;
    var activeContinuation = null;

    var activeProjectId = null;
    var activeOrganizationId = null;
    var orderAllocations = [];
    var existingOrgCapacities = [];
    var orderReservations = [];
    var existingOrgReservations = [];
    var activeQuoteOrder = null;
    var quoteRequestId = null;
    var quotePayloadKey = null;
    var quoteDirty = false;
    var quoteTimer = null;
    var checkoutRequestId = null;
    var checkoutRequestKey = null;
    var enrollRequestId = null;
    var enrollRepoSlug = null;
    var addAllocRequestId = null;
    var addAllocRepoSlug = null;
    var githubReposCache = [];
    var sessionEpoch = 0;
    var viewGeneration = 0;
    var pollGeneration = 0;
    var quoteGeneration = 0;
    var sessionAbortController = null;
    var viewAbortController = null;
    var busy = false;
    var enrollInFlight = false;
    var addAllocInFlight = false;
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

    function clampSeats(n) {
      var v = Math.floor(Number(n));
      if (!Number.isSafeInteger(v) || v < 1) return 1;
      if (v > 1000) return 1000;
      return v;
    }

    function sanitizeDraftAllocations(list) {
      if (!Array.isArray(list)) return [];
      var seen = new Set();
      var out = [];
      for (var i = 0; i < list.length && out.length < 100; i++) {
        var row = list[i];
        if (!row || typeof row !== "object") continue;
        var pid = typeof row.project_id === "string" ? row.project_id.trim() : "";
        var slug = typeof row.slug === "string" ? row.slug.trim() : pid;
        if (!pid || seen.has(pid.toLowerCase())) continue;
        seen.add(pid.toLowerCase());
        out.push({
          project_id: pid,
          slug: slug || pid,
          capacity: clampSeats(row.capacity),
          currentCapacity: Number.isSafeInteger(row.currentCapacity) && row.currentCapacity > 0 ? row.currentCapacity : 0,
          isOrigin: Boolean(row.isOrigin)
        });
      }
      return out;
    }

    function sanitizeDraftReservations(list) {
      if (!Array.isArray(list)) return [];
      var seen = new Set();
      var out = [];
      for (var i = 0; i < list.length && out.length < 100; i++) {
        var row = list[i];
        if (!row || typeof row !== "object") continue;
        var rid = typeof row.reservation_id === "string" && flow.UUID_PATTERN.test(row.reservation_id.trim())
          ? row.reservation_id.trim().toLowerCase()
          : null;
        if (rid) {
          if (seen.has(rid)) continue;
          seen.add(rid);
        }
        out.push({
          reservation_id: rid,
          capacity: clampSeats(row.capacity),
          existing: Boolean(row.existing && rid)
        });
      }
      return out;
    }

    function savePendingIntent() {
      if (!storage) return;
      try {
        var repoToKeep = originRepoSlug || preselectedRepo;
        if (repoToKeep) {
          storage.setItem("decapod:pending-repo-intent", repoToKeep);
        } else {
          storage.removeItem("decapod:pending-repo-intent");
        }
        storage.setItem("decapod:pending-checkout-intent", JSON.stringify({
          repo: preselectedRepo || null,
          originRepo: originRepoSlug || preselectedRepo || null,
          reposCount: pricingReposCount,
          billing: preferredBilling === "year" ? "year" : "month",
          seats: preferredSeats,
          source: sourceMode || null,
          organizationId: activeOrganizationId || null,
          allocations: orderAllocations.map(function (a) {
            return {
              project_id: a.project_id,
              slug: a.slug,
              capacity: a.capacity,
              currentCapacity: a.currentCapacity || 0,
              isOrigin: Boolean(a.isOrigin)
            };
          }),
          reservations: orderReservations.map(function (r) {
            return {
              reservation_id: r.reservation_id || null,
              capacity: clampSeats(r.capacity),
              existing: Boolean(r.existing && r.reservation_id)
            };
          })
        }));
      } catch (_) {}
    }

    function clearPendingIntent() {
      preselectedRepo = null;
      originRepoSlug = null;
      originProjectId = null;
      sourceMode = null;
      pricingReposCount = 1;
      orderAllocations = [];
      existingOrgCapacities = [];
      orderReservations = [];
      existingOrgReservations = [];
      if (!storage) return;
      try {
        storage.removeItem("decapod:pending-repo-intent");
        storage.removeItem("decapod:pending-checkout-intent");
      } catch (_) {}
    }

    function renderAuthIntentPreview() {
      var box = byId("auth-intent-preview");
      var summary = byId("auth-intent-summary");
      if (!box || !summary) return;
      var parts = [];
      if (originRepoSlug || preselectedRepo) {
        parts.push(originRepoSlug || preselectedRepo);
      } else if (pricingReposCount > 1) {
        parts.push(pricingReposCount + " repositories");
      }
      if (sourceMode === "pricing" || pricingReposCount > 1 || preferredSeats > 1 || preferredBilling === "year") {
        parts.push(preferredSeats + (preferredSeats === 1 ? " seat/repo" : " seats/repo"));
        parts.push(preferredBilling === "year" ? "Annual ($552/yr)" : "Monthly ($50/mo)");
      }
      if (!parts.length) {
        box.hidden = true;
        summary.textContent = "";
        return;
      }
      summary.textContent = parts.join(" · ");
      box.hidden = false;
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
      var tbody = byId("allocations-tbody");
      if (tbody) tbody.replaceChildren();
      var readyList = byId("ready-allocations-list");
      if (readyList) readyList.replaceChildren();
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
      addAllocInFlight = false;
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
      addAllocRequestId = null;
      addAllocRepoSlug = null;
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
        renderAuthIntentPreview();
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

    function findOrgById(orgId) {
      if (!orgId || !accountSnapshot || !Array.isArray(accountSnapshot.organizations)) return null;
      var target = String(orgId).toLowerCase();
      if (flow.isObsoleteBootstrapOrgId && flow.isObsoleteBootstrapOrgId(target)) return null;
      return accountSnapshot.organizations.find(function (o) {
        if (!o) return false;
        if (typeof flow.isVerifiedCustomerOrganization === "function" && !flow.isVerifiedCustomerOrganization(o)) {
          return false;
        }
        return ((typeof o.id === "string" && o.id.toLowerCase() === target) ||
          (typeof o.cloud_org_id === "string" && o.cloud_org_id.toLowerCase() === target));
      }) || null;
    }

    function isOrgAdmin(orgId) {
      var orgs = (accountSnapshot && Array.isArray(accountSnapshot.organizations))
        ? accountSnapshot.organizations
        : [];
      var target = String(orgId || "").toLowerCase();
      if (flow.isObsoleteBootstrapOrgId && flow.isObsoleteBootstrapOrgId(target)) return false;
      return orgs.some(function (o) {
        if (!o || o.admin !== true) return false;
        if (typeof flow.isVerifiedCustomerOrganization === "function" && !flow.isVerifiedCustomerOrganization(o)) {
          return false;
        }
        return ((typeof o.id === "string" && o.id.toLowerCase() === target) ||
          (typeof o.cloud_org_id === "string" && o.cloud_org_id.toLowerCase() === target));
      });
    }

    function findExistingProject(slugOrId) {
      var projects = (accountSnapshot && Array.isArray(accountSnapshot.projects))
        ? accountSnapshot.projects
        : [];
      var target = String(slugOrId || "").toLowerCase();
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

    function renderReadyAllocations(meta) {
      var wrap = byId("ready-allocations-wrap");
      var tbody = byId("ready-allocations-list");
      if (!wrap || !tbody) return;
      tbody.replaceChildren();
      var rows = Array.isArray(meta && meta.allocations) ? meta.allocations : [];
      if (!rows.length && orderAllocations.length) {
        rows = orderAllocations.map(function (a) {
          return { project_id: a.project_id, project_slug: a.slug, capacity: a.capacity };
        });
      }
      if (!rows.length) {
        wrap.hidden = true;
        return;
      }
      for (var i = 0; i < rows.length; i++) {
        var r = rows[i];
        var tr = doc.createElement("tr");
        var tdRepo = doc.createElement("td");
        var slugSpan = doc.createElement("span");
        slugSpan.className = "ds-mono";
        slugSpan.textContent = resolveDisplayProjectSlug(r.project_id, r.project_slug);
        tdRepo.appendChild(slugSpan);
        var tdCap = doc.createElement("td");
        tdCap.className = "ds-tabular";
        var capNum = Number.isSafeInteger(r.capacity) ? r.capacity : 1;
        tdCap.textContent = capNum + (capNum === 1 ? " seat" : " seats");
        tr.appendChild(tdRepo);
        tr.appendChild(tdCap);
        tbody.appendChild(tr);
      }
      wrap.hidden = false;
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
      var targetId = originProjectId || (accessStatus && accessStatus.project_id) || projectId;
      var resolvedProject = resolveDisplayProjectSlug(
        targetId,
        originRepoSlug || (accessStatus && accessStatus.project_slug) || (meta && meta.project_slug)
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
      var cliInstruction = byId("ready-cli-instruction");
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
      if (cliInstruction && resolvedProject) {
        cliInstruction.textContent = "Return to your terminal — any waiting decapod init --backend cloud session for " +
          resolvedProject + " activates automatically with no manual Admin setup.";
      }
      renderReadyAllocations(lastReadyMeta);

      if (portalBtn) {
        portalBtn.hidden = !(activeOrganizationId && (lastReadyMeta.can_manage_billing !== false) && isOrgAdmin(activeOrganizationId));
      }
      if (adminLink) {
        var orgObj = findOrgById(activeOrganizationId);
        var slugCandidate = (lastReadyMeta && typeof lastReadyMeta.organization_slug === "string")
          ? lastReadyMeta.organization_slug.trim()
          : "";
        if (slugCandidate && ((flow.isObsoleteBootstrapOrgId && flow.isObsoleteBootstrapOrgId(slugCandidate)) || /^github-org:/i.test(slugCandidate))) {
          slugCandidate = "";
        }
        var orgSlug = slugCandidate ||
          (orgObj && typeof flow.formatOrganizationDisplayName === "function" ? flow.formatOrganizationDisplayName(orgObj) : "") ||
          (orgObj && orgObj.cloud_org_id) ||
          null;
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
      var targetProj = originProjectId || cont.project_id;
      var access = {
        status: cont.status === "ready" ? "active" : cont.status,
        backend_authorized: cont.backend_authorized === true,
        project_id: targetProj,
        project_slug: cont.project_slug || originRepoSlug || null,
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
          if ((!Array.isArray(cont.allocations) || !cont.allocations.length) && Array.isArray(bStatus.capacities)) {
            cont.allocations = bStatus.capacities.map(function (c) {
              return {
                project_id: c.project_id,
                project_slug: resolveDisplayProjectSlug(c.project_id, null),
                capacity: c.capacity
              };
            });
          }
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
      if (cont.project_slug && !originRepoSlug) preselectedRepo = cont.project_slug;
      else if (cont.project_id && !preselectedRepo) preselectedRepo = cont.project_id;
      if (cont.cadence === "month" || cont.cadence === "year") preferredBilling = cont.cadence;
      if (Number.isSafeInteger(cont.quantity) && cont.quantity >= 1 && cont.quantity <= 1000) {
        preferredSeats = cont.quantity;
      }
      if (cont.continuation) {
        activeContinuation = cont.continuation;
      }

      var displayProject = resolveDisplayProjectSlug(cont.project_id || activeProjectId, originRepoSlug || cont.project_slug);

      if (cont.status === "ready" && cont.backend_authorized === true) {
        var access = await fetchReadyDetails(cont);
        showReadyState(cont.project_id, access, {
          cadence: cont.cadence,
          quantity: cont.quantity,
          paid_until: cont.paid_until,
          can_manage_billing: cont.can_manage_billing,
          organization_slug: cont.organization_slug,
          project_slug: displayProject,
          allocations: cont.allocations || []
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
      var targetProjectRef = originProjectId || originRepoSlug || projectId;
      var repoLabel = resolveDisplayProjectSlug(targetProjectRef, displaySlug);
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
            if (contToken || !targetProjectRef) {
              var payload = { action: "continuation" };
              if (contToken) payload.continuation = contToken;
              if (targetProjectRef) payload.project_id = targetProjectRef;
              var res = await edgePost("billing-manage", payload, { sessionEpoch: mySessionEpoch, signal: mySignal });
              lastSnapshot = res;
              return res;
            }
            var accRes = await edgePost("account-status", {
              project_id: targetProjectRef,
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
          organization_slug: r.organization_slug || null,
          project_slug: r.project_slug || displaySlug || originRepoSlug || null,
          allocations: r.allocations || []
        };
        if ((r.project_id || targetProjectRef) && !r.paid_until && activeOrganizationId) {
          var hydrated = await fetchReadyDetails(r);
          showReadyState(r.project_id || targetProjectRef, hydrated, Object.assign(finalMeta, {
            paid_until: r.paid_until || null,
            allocations: r.allocations || finalMeta.allocations
          }));
          return;
        }
        showReadyState(r.project_id || targetProjectRef, r, finalMeta);
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
      var pendingRef = (outcome.lastError && outcome.lastError.correlationId) || targetProjectRef;
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
          projectId: targetProjectRef,
          state: "pending_timeout"
        });
      }
    }

    function totalOrderSeats() {
      var sum = 0;
      for (var i = 0; i < orderAllocations.length; i++) {
        sum += clampSeats(orderAllocations[i].capacity);
      }
      for (var j = 0; j < orderReservations.length; j++) {
        sum += clampSeats(orderReservations[j].capacity);
      }
      return (orderAllocations.length || orderReservations.length) ? sum : preferredSeats;
    }

    function totalExistingSeats() {
      var sum = 0;
      for (var i = 0; i < existingOrgCapacities.length; i++) {
        sum += Number.isSafeInteger(existingOrgCapacities[i].capacity) ? existingOrgCapacities[i].capacity : 0;
      }
      for (var j = 0; j < existingOrgReservations.length; j++) {
        sum += Number.isSafeInteger(existingOrgReservations[j].capacity) ? existingOrgReservations[j].capacity : 0;
      }
      return sum;
    }

    function updateSummarySelections(cadence, totalSeats) {
      var repoEl = byId("summary-repo");
      var planEl = byId("summary-plan");
      var seatsEl = byId("summary-seats");
      var existingRow = byId("summary-existing-row");
      var existingVal = byId("summary-existing");
      var count = orderAllocations.length;
      var resCount = orderReservations.length;
      if (repoEl) {
        var repoLabel = "";
        if (count > 1) {
          repoLabel = count + " repositories";
        } else if (count === 1) {
          repoLabel = orderAllocations[0].slug;
        } else {
          repoLabel = preselectedRepo || activeProjectId || (resCount ? "Reserved slots only" : "—");
        }
        if (resCount > 0 && count > 0) {
          repoLabel += " + " + resCount + " reserved slot" + (resCount === 1 ? "" : "s");
        } else if (resCount > 0 && count === 0) {
          repoLabel = resCount + " reserved slot" + (resCount === 1 ? "" : "s");
        }
        repoEl.textContent = repoLabel;
      }
      if (planEl) planEl.textContent = cadence === "year" ? "Decapod Cloud · Annual" : "Decapod Cloud · Monthly";
      if (seatsEl) seatsEl.textContent = String(totalSeats) + (totalSeats === 1 ? " seat" : " seats");
      var priorTotal = totalExistingSeats();
      if (existingRow && existingVal) {
        if (priorTotal > 0) {
          var existingSummary = existingOrgCapacities.length + " repo" + (existingOrgCapacities.length === 1 ? "" : "s");
          if (existingOrgReservations.length > 0) {
            existingSummary += " + " + existingOrgReservations.length + " reserved";
          }
          existingVal.textContent = existingSummary + " · " + priorTotal + (priorTotal === 1 ? " seat" : " seats");
          existingRow.hidden = false;
        } else {
          existingRow.hidden = true;
        }
      }
    }

    function renderReservationsTable() {
      var badge = byId("reservations-count-badge");
      var wrap = byId("reservations-table-wrap");
      var tbody = byId("reservations-tbody");
      var resCount = orderReservations.length;
      if (badge) badge.textContent = resCount + (resCount === 1 ? " slot" : " slots");
      if (wrap) wrap.hidden = resCount === 0;
      if (!tbody) return;
      tbody.replaceChildren();
      for (var i = 0; i < orderReservations.length; i++) {
        (function (row, idx) {
          var tr = doc.createElement("tr");
          var tdSlot = doc.createElement("td");
          tdSlot.className = "ds-mono";
          tdSlot.textContent = "Future slot #" + (idx + 1);
          var tdState = doc.createElement("td");
          tdState.textContent = row.existing ? "Active reservation" : "New reservation";
          var tdSeats = doc.createElement("td");
          var stepper = doc.createElement("div");
          stepper.className = "seat-stepper";
          var minus = doc.createElement("button");
          minus.type = "button";
          minus.className = "stepper-btn";
          minus.textContent = "−";
          minus.disabled = row.existing || row.capacity <= 1;
          minus.onclick = function () {
            if (row.existing) return;
            row.capacity = clampSeats(row.capacity - 1);
            renderReservationsTable();
            scheduleQuoteRefresh();
          };
          var inp = doc.createElement("input");
          inp.type = "number";
          inp.className = "ds-input ds-tabular";
          inp.min = "1";
          inp.max = "1000";
          inp.value = String(row.capacity);
          inp.disabled = Boolean(row.existing);
          inp.onchange = function () {
            if (row.existing) return;
            row.capacity = clampSeats(inp.value);
            inp.value = String(row.capacity);
            renderReservationsTable();
            scheduleQuoteRefresh();
          };
          var plus = doc.createElement("button");
          plus.type = "button";
          plus.className = "stepper-btn";
          plus.textContent = "+";
          plus.disabled = Boolean(row.existing);
          plus.onclick = function () {
            if (row.existing) return;
            row.capacity = clampSeats(row.capacity + 1);
            renderReservationsTable();
            scheduleQuoteRefresh();
          };
          stepper.appendChild(minus);
          stepper.appendChild(inp);
          stepper.appendChild(plus);
          tdSeats.appendChild(stepper);

          var tdAct = doc.createElement("td");
          tdAct.className = "alloc-col-act";
          var rem = doc.createElement("button");
          rem.type = "button";
          rem.className = "ds-btn ds-btn-ghost ds-btn-sm";
          rem.textContent = "Remove";
          rem.disabled = Boolean(row.existing);
          rem.onclick = function () {
            if (row.existing) return;
            orderReservations.splice(idx, 1);
            renderReservationsTable();
            savePendingIntent();
            scheduleQuoteRefresh();
          };
          tdAct.appendChild(rem);
          tr.appendChild(tdSlot);
          tr.appendChild(tdState);
          tr.appendChild(tdSeats);
          tr.appendChild(tdAct);
          tbody.appendChild(tr);
        })(orderReservations[i], i);
      }
    }

    function renderIntentCallout() {
      var callout = byId("signup-intent-callout");
      var titleEl = byId("signup-intent-title");
      var detailEl = byId("signup-intent-detail");
      if (!callout || !titleEl || !detailEl) return;
      if (pricingReposCount > orderAllocations.length && pricingReposCount > 1) {
        var remaining = pricingReposCount - orderAllocations.length;
        titleEl.textContent = "Pricing selection: " + pricingReposCount + " repositories × " + preferredSeats + (preferredSeats === 1 ? " seat" : " seats");
        detailEl.textContent = "Verify " + remaining + " more " + (remaining === 1 ? "repository" : "repositories") + " below before Stripe Checkout. Only verified repositories enter your quote.";
        callout.hidden = false;
      } else {
        callout.hidden = true;
      }
    }

    function renderAllocationsTable() {
      renderIntentCallout();
      var orgBadge = byId("alloc-org-badge");
      if (orgBadge) {
        var orgObj = findOrgById(activeOrganizationId);
        var orgSlugLabel = orgObj && typeof flow.formatOrganizationDisplayName === "function"
          ? flow.formatOrganizationDisplayName(orgObj)
          : "";
        orgBadge.textContent = orgSlugLabel ? ("Org: " + orgSlugLabel) : "Single organization order";
      }
      var tbody = byId("allocations-tbody");
      var seatCompatInput = byId("seat-quantity");
      if (seatCompatInput && orderAllocations.length > 0) {
        seatCompatInput.value = String(orderAllocations[0].capacity);
      }
      var addSeatInput = byId("add-alloc-seats-input");
      if (addSeatInput && !addAllocInFlight) {
        addSeatInput.value = String(sourceMode === "cli" ? 1 : preferredSeats);
      }
      if (!tbody) return;
      tbody.replaceChildren();
      for (var i = 0; i < orderAllocations.length; i++) {
        (function (row, idx) {
          var tr = doc.createElement("tr");

          var tdRepo = doc.createElement("td");
          var wrap = doc.createElement("div");
          wrap.className = "alloc-repo-cell";
          var slugEl = doc.createElement("span");
          slugEl.className = "ds-mono";
          slugEl.textContent = row.slug;
          wrap.appendChild(slugEl);
          if (row.isOrigin) {
            var originBadge = doc.createElement("span");
            originBadge.className = "ds-badge ds-badge-accent";
            originBadge.textContent = "Origin";
            wrap.appendChild(originBadge);
          }
          tdRepo.appendChild(wrap);

          var tdCurr = doc.createElement("td");
          tdCurr.className = "ds-tabular";
          tdCurr.textContent = row.currentCapacity > 0 ? (row.currentCapacity + " paid") : "New";

          var tdSeats = doc.createElement("td");
          var stepper = doc.createElement("div");
          stepper.className = "seat-stepper";

          var minus = doc.createElement("button");
          minus.type = "button";
          minus.className = "stepper-btn";
          minus.textContent = "−";
          minus.setAttribute("aria-label", "Decrease seats for " + row.slug);
          minus.disabled = row.capacity <= 1;
          minus.onclick = function () {
            row.capacity = clampSeats(row.capacity - 1);
            if (idx === 0 && seatCompatInput) seatCompatInput.value = String(row.capacity);
            renderAllocationsTable();
            scheduleQuoteRefresh();
          };

          var inp = doc.createElement("input");
          inp.type = "number";
          inp.className = "ds-input ds-tabular";
          inp.min = "1";
          inp.max = "1000";
          inp.step = "1";
          inp.value = String(row.capacity);
          inp.setAttribute("aria-label", "Seats for " + row.slug);
          inp.onchange = function () {
            row.capacity = clampSeats(inp.value);
            inp.value = String(row.capacity);
            if (idx === 0 && seatCompatInput) seatCompatInput.value = String(row.capacity);
            renderAllocationsTable();
            scheduleQuoteRefresh();
          };

          var plus = doc.createElement("button");
          plus.type = "button";
          plus.className = "stepper-btn";
          plus.textContent = "+";
          plus.setAttribute("aria-label", "Increase seats for " + row.slug);
          plus.onclick = function () {
            row.capacity = clampSeats(row.capacity + 1);
            if (idx === 0 && seatCompatInput) seatCompatInput.value = String(row.capacity);
            renderAllocationsTable();
            scheduleQuoteRefresh();
          };

          stepper.appendChild(minus);
          stepper.appendChild(inp);
          stepper.appendChild(plus);
          tdSeats.appendChild(stepper);

          var tdAct = doc.createElement("td");
          tdAct.className = "alloc-col-act";
          var rem = doc.createElement("button");
          rem.type = "button";
          rem.className = "ds-btn ds-btn-ghost ds-btn-sm";
          rem.textContent = "Remove";
          rem.disabled = orderAllocations.length <= 1 || row.currentCapacity > 0;
          rem.title = row.currentCapacity > 0 ? "Existing paid repositories remain covered through the current term" : "Remove repository from order";
          rem.onclick = function () {
            if (orderAllocations.length <= 1 || row.currentCapacity > 0) return;
            orderAllocations.splice(idx, 1);
            if (orderAllocations[0]) {
              activeProjectId = orderAllocations[0].project_id;
              preselectedRepo = orderAllocations[0].slug;
            }
            renderAllocationsTable();
            scheduleQuoteRefresh();
          };
          tdAct.appendChild(rem);

          tr.appendChild(tdRepo);
          tr.appendChild(tdCurr);
          tr.appendChild(tdSeats);
          tr.appendChild(tdAct);
          tbody.appendChild(tr);
        })(orderAllocations[i], i);
      }
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

    function renderQuoteSummary(quoted) {
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

      var qty = Number.isSafeInteger(quoted.quantity) ? quoted.quantity : totalOrderSeats();
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
          discVal.textContent = (cadence === "year" ? "Annual + verified volume discount (" + pct + "%)" : "Verified volume discount (" + pct + "%)");
          discRow.hidden = false;
        }
      } else {
        if (badgeEl) badgeEl.hidden = true;
        if (discRow) discRow.hidden = true;
      }

      commitEl.textContent = quoted.kind === "increase"
        ? "Prorated seat/repository expansion due today; ongoing renewal updates on the same schedule."
        : (cadence === "year"
          ? "Annual commitment billed upfront for 12 months. Cancel anytime before renewal."
          : "Monthly recurring subscription. Adjust or cancel anytime before renewal.");
      summary.hidden = false;
      if (quoteErr) { quoteErr.hidden = true; quoteErr.textContent = ""; }
      var blockedBySibling = Boolean(siblingCheckout && siblingCheckout.projectId === activeProjectId);
      checkoutBtn.disabled = quoteDirty || !quoted.quote_id || quoted.status === "scheduled" || checkoutInFlight || blockedBySibling;
    }

    function readSelectedPlanInputs() {
      var cadenceEl = byId("billing-cadence");
      var seatEl = byId("seat-quantity");
      var cadence = cadenceEl && cadenceEl.value === "year" ? "year" : "month";
      if (!orderAllocations.length && activeProjectId) {
        var rawSeats = seatEl ? clampSeats(seatEl.value) : preferredSeats;
        if (seatEl && String(rawSeats) !== seatEl.value) seatEl.value = String(rawSeats);
        orderAllocations = [{
          project_id: activeProjectId,
          slug: preselectedRepo || activeProjectId,
          capacity: rawSeats,
          currentCapacity: 0,
          isOrigin: Boolean(originRepoSlug && (preselectedRepo || activeProjectId).toLowerCase() === originRepoSlug.toLowerCase())
        }];
      } else if (orderAllocations.length === 1 && seatEl) {
        var compatSeats = clampSeats(seatEl.value);
        orderAllocations[0].capacity = compatSeats;
      }
      preferredBilling = cadence;
      if (orderAllocations.length === 1) {
        preferredSeats = orderAllocations[0].capacity;
      }
      savePendingIntent();
      return {
        cadence: cadence,
        allocations: orderAllocations.map(function (a) {
          return { project_id: a.project_id, capacity: clampSeats(a.capacity) };
        }),
        reservations: orderReservations.map(function (r) {
          return r.reservation_id
            ? { reservation_id: r.reservation_id, capacity: clampSeats(r.capacity) }
            : { capacity: clampSeats(r.capacity) };
        }),
        totalSeats: totalOrderSeats()
      };
    }

    async function requestAutomaticQuote() {
      if (!activeOrganizationId || (!activeProjectId && !orderAllocations.length && !orderReservations.length)) return null;
      var selected = readSelectedPlanInputs();
      if (!selected.allocations.length && !selected.reservations.length) return null;
      var targetOrgId = activeOrganizationId;
      var targetProjId = activeProjectId || (selected.allocations[0] ? selected.allocations[0].project_id : null);
      var payload = Object.assign({
        organization_id: targetOrgId,
        cadence: selected.cadence,
        allocations: selected.allocations
      }, selected.reservations.length ? { reservations: selected.reservations } : {});
      var canonical = JSON.stringify(payload);
      if (quotePayloadKey !== canonical || !quoteRequestId) {
        var savedQ = storeGet("quote_req", 4096);
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
      setQuoteUpdatingUi(selected.cadence, selected.totalSeats);
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
            activeOrganizationId !== targetOrgId) {
          return null;
        }
        quoteDirty = false;
        renderQuoteSummary(quoted);
        return quoted;
      } catch (error) {
        if ((error && error.name === "AbortError") || !isActiveView(mySessionEpoch, myViewGen) ||
            myQuoteGen !== quoteGeneration || activeOrganizationId !== targetOrgId) {
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
          try {
            var st = await edgePost("billing-manage", { action: "status", organization_id: targetOrgId }, {
              sessionEpoch: mySessionEpoch,
              signal: mySignal
            });
            if (!isActiveView(mySessionEpoch, myViewGen) || myQuoteGen !== quoteGeneration) return null;
            if (st && st.pending_order && st.pending_order.quote_id) {
              var po = st.pending_order;
              if (po.status === "checkout" || po.status === "paid" || po.status === "scheduled") {
                var contRes = await edgePost("billing-manage", {
                  action: "continuation",
                  organization_id: targetOrgId,
                  project_id: originProjectId || targetProjId
                }, {
                  sessionEpoch: mySessionEpoch,
                  signal: mySignal
                });
                if (await handleContinuationOutcome(contRes, false)) return null;
              }
              var sameAllocations = JSON.stringify((po.allocations || []).map(function (x) {
                return { project_id: x.project_id, capacity: x.capacity };
              }).sort(function (a, b) { return a.project_id < b.project_id ? -1 : 1; })) ===
                JSON.stringify(selected.allocations.slice().sort(function (a, b) { return a.project_id < b.project_id ? -1 : 1; }));
              if (po.cadence === selected.cadence && po.quantity === selected.totalSeats && sameAllocations) {
                quoteDirty = false;
                renderQuoteSummary(po);
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
                renderQuoteSummary(retried);
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
            : (code === "assignments_exceed_future_capacity"
              ? "Cannot reduce seats below currently assigned contributors."
              : "Could not calculate subscription price right now. Adjust seats or try again shortly." + (qRef ? " " + qRef : ""));
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
      setQuoteUpdatingUi(selected.cadence, selected.totalSeats);
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

    function mergeOrganizationAllocations(orgId, primaryProjectId, primarySlug, bStatus) {
      existingOrgCapacities = Array.isArray(bStatus && bStatus.capacities)
        ? bStatus.capacities.filter(function (c) { return c && c.project_id && Number.isSafeInteger(c.capacity) && c.capacity > 0; })
        : [];
      var existingMap = new Map();
      for (var i = 0; i < existingOrgCapacities.length; i++) {
        existingMap.set(existingOrgCapacities[i].project_id.toLowerCase(), existingOrgCapacities[i].capacity);
      }

      var merged = new Map();
      var orgProjects = (accountSnapshot && Array.isArray(accountSnapshot.projects))
        ? accountSnapshot.projects.filter(function (p) {
            return p && (String(p.organization_id || p.organization || "").toLowerCase() === String(orgId).toLowerCase());
          })
        : [];
      var isOrgProj = function (pid) {
        if (!orgProjects.length) return true;
        return orgProjects.some(function (p) { return String(p.project_id || "").toLowerCase() === String(pid).toLowerCase(); });
      };

      // 1. Existing paid capacities MUST be preserved unconditionally (#260)
      for (var e = 0; e < existingOrgCapacities.length; e++) {
        var ec = existingOrgCapacities[e];
        var eSlug = resolveDisplayProjectSlug(ec.project_id, null);
        merged.set(ec.project_id.toLowerCase(), {
          project_id: ec.project_id,
          slug: eSlug,
          capacity: ec.capacity,
          currentCapacity: ec.capacity,
          isOrigin: Boolean(originRepoSlug && eSlug.toLowerCase() === originRepoSlug.toLowerCase())
        });
      }

      // 2. Restore any previously verified draft allocations belonging to the same organization
      for (var dIdx = 0; dIdx < orderAllocations.length; dIdx++) {
        var draftRow = orderAllocations[dIdx];
        if (!draftRow || !draftRow.project_id || !isOrgProj(draftRow.project_id)) continue;
        var dKey = draftRow.project_id.toLowerCase();
        var prev = merged.get(dKey);
        if (prev) {
          prev.capacity = Math.max(prev.currentCapacity, clampSeats(draftRow.capacity));
        } else {
          merged.set(dKey, {
            project_id: draftRow.project_id,
            slug: draftRow.slug || resolveDisplayProjectSlug(draftRow.project_id, null),
            capacity: clampSeats(draftRow.capacity),
            currentCapacity: 0,
            isOrigin: Boolean(originRepoSlug && (draftRow.slug || "").toLowerCase() === originRepoSlug.toLowerCase())
          });
        }
      }

      // 3. Ensure primaryProjectId is included
      if (primaryProjectId) {
        var pKey = primaryProjectId.toLowerCase();
        var resolvedSlug = resolveDisplayProjectSlug(primaryProjectId, primarySlug);
        var defaultSeats = (sourceMode === "cli" && !seatsExplicitInUrl) ? 1 : preferredSeats;
        if (merged.has(pKey)) {
          var existingEntry = merged.get(pKey);
          existingEntry.slug = resolvedSlug;
          if (existingEntry.currentCapacity > 0 && seatsExplicitInUrl) {
            existingEntry.capacity = Math.max(existingEntry.currentCapacity, preferredSeats);
          }
          if (originRepoSlug && resolvedSlug.toLowerCase() === originRepoSlug.toLowerCase()) {
            existingEntry.isOrigin = true;
          }
        } else {
          merged.set(pKey, {
            project_id: primaryProjectId,
            slug: resolvedSlug,
            capacity: clampSeats(defaultSeats),
            currentCapacity: existingMap.get(pKey) || 0,
            isOrigin: Boolean(originRepoSlug && resolvedSlug.toLowerCase() === originRepoSlug.toLowerCase())
          });
        }
      }

      orderAllocations = Array.from(merged.values());

      existingOrgReservations = Array.isArray(bStatus && bStatus.reservations)
        ? bStatus.reservations.filter(function (r) { return r && r.status === "available" && r.reservation_id && Number.isSafeInteger(r.capacity) && r.capacity > 0; })
        : [];
      var mergedRes = new Map();
      var draftNewRes = [];
      for (var er = 0; er < existingOrgReservations.length; er++) {
        var rRow = existingOrgReservations[er];
        mergedRes.set(rRow.reservation_id.toLowerCase(), {
          reservation_id: rRow.reservation_id,
          capacity: clampSeats(rRow.capacity),
          existing: true
        });
      }
      for (var dr = 0; dr < orderReservations.length; dr++) {
        var dRow = orderReservations[dr];
        if (!dRow || typeof dRow !== "object") continue;
        if (!dRow.reservation_id) {
          draftNewRes.push({ reservation_id: null, capacity: clampSeats(dRow.capacity), existing: false });
        }
      }
      orderReservations = Array.from(mergedRes.values()).concat(draftNewRes);
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
        label.textContent = "Primary repository: " + (repoLabel || projectId);
      }
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

        mergeOrganizationAllocations(orgId, projectId, repoLabel, bStatus);
        if (bStatus && (bStatus.cadence === "month" || bStatus.cadence === "year") && !seatsExplicitInUrl) {
          preferredBilling = bStatus.cadence;
          if (cadenceSelect) cadenceSelect.value = preferredBilling;
        }
        renderAllocationsTable();
        renderReservationsTable();

        if (closedBox) closedBox.hidden = true;
        if (quoteControls) quoteControls.hidden = false;
        card.hidden = false;
        setStatus(customStatus || "", false);
        loadGitHubOrgsAndRepos(mySessionEpoch, myViewGen).catch(function () {});

        var po = bStatus && bStatus.pending_order ? bStatus.pending_order : null;
        if (po && (po.status === "checkout" || po.status === "paid" || po.status === "scheduled")) {
          var contRes = await edgePost("billing-manage", {
            action: "continuation",
            organization_id: orgId,
            project_id: originProjectId || projectId
          }, { sessionEpoch: mySessionEpoch, signal: mySignal });
          if (await handleContinuationOutcome(contRes, false)) return;
        }
        if (po && po.quote_id && po.status === "quoted" && po.cadence === preferredBilling &&
            po.quantity === totalOrderSeats() &&
            Array.isArray(po.allocations) && po.allocations.length === orderAllocations.length &&
            orderAllocations.every(function (row) {
              return po.allocations.some(function (pa) { return pa.project_id === row.project_id && pa.capacity === row.capacity; });
            })) {
          quoteDirty = false;
          renderQuoteSummary(po);
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
      if (originRepoSlug && (repoLabel || "").toLowerCase() === originRepoSlug.toLowerCase()) {
        originProjectId = projectId;
      }
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
          await runContinuationPoll(activeContinuation, projectId, repoLabel);
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
        // Hydrate ready details via billing status when available so multi-repo allocations show accurately
        var meta = { cadence: preferredBilling, quantity: preferredSeats };
        if (isOrgAdmin(access.organization_id || orgId)) {
          try {
            var bs = await edgePost("billing-manage", { action: "status", organization_id: access.organization_id || orgId }, {
              sessionEpoch: mySessionEpoch,
              signal: mySignal
            });
            if (bs && typeof bs === "object") {
              meta.cadence = bs.cadence || meta.cadence;
              meta.quantity = Number.isSafeInteger(bs.quantity) && bs.quantity > 0 ? bs.quantity : meta.quantity;
              meta.paid_until = bs.paid_until || null;
              if (Array.isArray(bs.capacities)) {
                meta.allocations = bs.capacities.map(function (c) {
                  return { project_id: c.project_id, project_slug: resolveDisplayProjectSlug(c.project_id, null), capacity: c.capacity };
                });
              }
            }
          } catch (_) {}
        }
        showReadyState(projectId, access, meta);
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
        await runContinuationPoll(activeContinuation, projectId, repoLabel);
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
          "Contact your organization administrator to request access to this repository.",
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
        if (!originRepoSlug) originRepoSlug = parsed.slug;
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
        if (originRepoSlug && parsed.slug.toLowerCase() === originRepoSlug.toLowerCase()) {
          originProjectId = resolvedProj;
        }
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

    async function handleAddAllocationRepo() {
      if (addAllocInFlight || !activeOrganizationId) return;
      var repoInput = byId("add-alloc-repo-input");
      var seatsInput = byId("add-alloc-seats-input");
      var hintEl = byId("add-alloc-hint");
      var addBtn = byId("add-alloc-btn");
      var parsed = flow.parseRepoSlug(repoInput ? repoInput.value : "");
      if (!parsed) {
        if (hintEl) {
          hintEl.classList.add("is-error");
          hintEl.textContent = "Enter a valid GitHub repository slug (owner/repo).";
        }
        return;
      }
      if (orderAllocations.some(function (a) { return a.slug.toLowerCase() === parsed.slug.toLowerCase(); })) {
        if (hintEl) {
          hintEl.classList.add("is-error");
          hintEl.textContent = parsed.slug + " is already in this subscription order.";
        }
        return;
      }

      var addSeats = clampSeats(seatsInput ? seatsInput.value : preferredSeats);
      var existing = findExistingProject(parsed.slug);
      if (existing) {
        var exOrg = existing.organization_id || existing.organization || "";
        if (String(exOrg).toLowerCase() !== String(activeOrganizationId).toLowerCase()) {
          if (hintEl) {
            hintEl.classList.add("is-error");
            hintEl.textContent = parsed.slug + " belongs to a different organization. Subscriptions are scoped to one organization per order.";
          }
          return;
        }
        orderAllocations.push({
          project_id: existing.project_id,
          slug: existing.name || parsed.slug,
          capacity: addSeats,
          currentCapacity: 0,
          isOrigin: Boolean(originRepoSlug && parsed.slug.toLowerCase() === originRepoSlug.toLowerCase())
        });
        if (repoInput) repoInput.value = "";
        if (hintEl) {
          hintEl.classList.remove("is-error");
          hintEl.textContent = "Added " + (existing.name || parsed.slug) + " to order.";
        }
        renderAllocationsTable();
        savePendingIntent();
        await requestAutomaticQuote();
        return;
      }

      if (!inMemoryProviderToken) {
        savePendingIntent();
        if (hintEl) {
          hintEl.classList.remove("is-error");
          hintEl.textContent = "Re-authenticating GitHub repository access to verify " + parsed.slug + "…";
        }
        await beginAuth("github", "sign_in", true);
        return;
      }

      addAllocInFlight = true;
      if (addBtn) addBtn.disabled = true;
      var mySessionEpoch = sessionEpoch;
      var myViewGen = viewGeneration;
      var mySignal = viewAbortController ? viewAbortController.signal : (sessionAbortController ? sessionAbortController.signal : null);
      try {
        if (addAllocRepoSlug !== parsed.slug || !addAllocRequestId) {
          addAllocRepoSlug = parsed.slug;
          addAllocRequestId = makeRequestId();
        }
        if (hintEl) {
          hintEl.classList.remove("is-error");
          hintEl.textContent = "Verifying GitHub admin access for " + parsed.slug + "…";
        }
        var enrolled = await edgePost("repository-enroll", {
          request_id: addAllocRequestId,
          provider: "github",
          repository: parsed.slug,
          provider_token: inMemoryProviderToken,
          organization_id: activeOrganizationId
        }, { sessionEpoch: mySessionEpoch, signal: mySignal });
        if (!isActiveView(mySessionEpoch, myViewGen)) return;

        addAllocRequestId = null;
        addAllocRepoSlug = null;

        var refreshed = await edgePost("account-register", { operation: "account" }, {
          sessionEpoch: mySessionEpoch,
          signal: mySignal
        });
        if (!isActiveView(mySessionEpoch, myViewGen)) return;
        accountSnapshot = refreshed;

        if (enrolled && String(enrolled.organization_id || "").toLowerCase() !== String(activeOrganizationId).toLowerCase()) {
          if (hintEl) {
            hintEl.classList.add("is-error");
            hintEl.textContent = parsed.slug + " belongs to a different organization and requires its own subscription.";
          }
          return;
        }

        var projId = (enrolled && enrolled.project_id) || parsed.slug;
        orderAllocations.push({
          project_id: projId,
          slug: parsed.slug,
          capacity: addSeats,
          currentCapacity: 0,
          isOrigin: Boolean(originRepoSlug && parsed.slug.toLowerCase() === originRepoSlug.toLowerCase())
        });
        if (repoInput) repoInput.value = "";
        if (hintEl) {
          hintEl.classList.remove("is-error");
          hintEl.textContent = "Verified and added " + parsed.slug + ".";
        }
        renderAllocationsTable();
        savePendingIntent();
        await requestAutomaticQuote();
      } catch (err) {
        if ((err && err.name === "AbortError") || !isActiveView(mySessionEpoch, myViewGen)) return;
        var errCode = err && err.message ? err.message : "verification_failed";
        if (hintEl) {
          hintEl.classList.add("is-error");
          hintEl.textContent = (
            errCode === "repository_identity_conflict" ||
            errCode === "repository_organization_mismatch" ||
            errCode === "organization_already_enrolled" ||
            errCode === "repository_already_enrolled"
          )
            ? (parsed.slug + " belongs to a different organization and cannot be added to this subscription. Start a separate subscription for that organization.")
            : ("Could not verify admin permission for " + parsed.slug + ". Check the owner/repo slug and try again.");
        }
      } finally {
        addAllocInFlight = false;
        if (addBtn) addBtn.disabled = false;
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
      var targetProjId = originProjectId || activeProjectId;
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
        savePendingIntent();
        var result = await edgePost("billing-checkout", {
          request_id: checkoutRequestId,
          organization_id: targetOrgId,
          order_id: targetOrderId,
          quote_id: targetQuoteId
        }, { sessionEpoch: mySessionEpoch, signal: mySignal });
        if (!isActiveView(mySessionEpoch, myViewGen)) return;
        if (result.continuation) activeContinuation = result.continuation;
        if (result.checkout_url) {
          if (!flow.isAllowedCheckoutUrl(result.checkout_url)) {
            throw new Error("invalid_response");
          }
          storeSet("checkout_pending", {
            organization_id: targetOrgId,
            project_id: targetProjId,
            origin_project_id: originProjectId || null,
            origin_repo: originRepoSlug || preselectedRepo || null,
            order_id: targetOrderId,
            quote_id: targetQuoteId,
            request_id: checkoutRequestId,
            continuation: result.continuation || null,
            repo: originRepoSlug || preselectedRepo || targetProjId,
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
            origin_project_id: originProjectId || null,
            origin_repo: originRepoSlug || preselectedRepo || null,
            order_id: targetOrderId,
            quote_id: targetQuoteId,
            request_id: checkoutRequestId,
            continuation: result.continuation || null,
            repo: originRepoSlug || preselectedRepo || targetProjId,
            returned: true,
            started_at: nowSec()
          });
          await runContinuationPoll(result.continuation || activeContinuation, targetProjId, originRepoSlug || preselectedRepo);
          return;
        }
        await inspectProjectAccess(targetOrgId, targetProjId, originRepoSlug || preselectedRepo || targetProjId, myViewGen);
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

      if (originRepoSlug && !originProjectId) {
        var matchedOrig = findExistingProject(originRepoSlug);
        if (matchedOrig) originProjectId = matchedOrig.project_id;
      }

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

      var returnState = storeGet("checkout_return_state", 2048);
      var pendingCheckout = storeGet("checkout_pending", 4096);
      var isReturnFlow = Boolean(checkoutReturned || checkoutCanceled || (returnState && returnState.mode));
      var contRef = activeContinuation ||
        (returnState && returnState.continuation) ||
        (pendingCheckout && pendingCheckout.continuation) ||
        null;
      var checkSession = Boolean(checkoutCanceled || (returnState && returnState.mode === "canceled"));
      var contProjRef = originProjectId ||
        originRepoSlug ||
        (pendingCheckout && (pendingCheckout.origin_project_id || pendingCheckout.project_id)) ||
        null;

      if (isReturnFlow || !preselectedRepo) {
        try {
          var contPayload = { action: "continuation" };
          if (contRef) contPayload.continuation = contRef;
          if (contProjRef) contPayload.project_id = contProjRef;
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
          if (isReturnFlow && !contRef && pendingCheckout && (pendingCheckout.repo || pendingCheckout.project_id)) {
            await runContinuationPoll(null, pendingCheckout.origin_project_id || pendingCheckout.project_id, pendingCheckout.origin_repo || pendingCheckout.repo);
            return;
          }
        }
      }

      var targetLookup = originRepoSlug || preselectedRepo;
      if (!targetLookup && pendingCheckout && Number.isSafeInteger(pendingCheckout.started_at) && (nowSec() - pendingCheckout.started_at) < 1800) {
        targetLookup = pendingCheckout.origin_repo || pendingCheckout.repo || pendingCheckout.project_id || null;
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

      try {
        var savedCheckoutIntentRaw = storage ? storage.getItem("decapod:pending-checkout-intent") : null;
        if (savedCheckoutIntentRaw && savedCheckoutIntentRaw.length < 16384) {
          var savedCheckoutIntent = JSON.parse(savedCheckoutIntentRaw);
          if (savedCheckoutIntent && typeof savedCheckoutIntent === "object") {
            if (savedCheckoutIntent.billing === "year" || savedCheckoutIntent.billing === "month") {
              preferredBilling = savedCheckoutIntent.billing;
            }
            if (Number.isSafeInteger(savedCheckoutIntent.seats) && savedCheckoutIntent.seats >= 1 && savedCheckoutIntent.seats <= 1000) {
              preferredSeats = savedCheckoutIntent.seats;
            }
            if (Number.isSafeInteger(savedCheckoutIntent.reposCount) && savedCheckoutIntent.reposCount >= 1 && savedCheckoutIntent.reposCount <= 100) {
              pricingReposCount = savedCheckoutIntent.reposCount;
            }
            if (typeof savedCheckoutIntent.source === "string" && ["pricing", "cli", "admin"].includes(savedCheckoutIntent.source)) {
              sourceMode = savedCheckoutIntent.source;
            }
            if (savedCheckoutIntent.originRepo) {
              var parsedOrig = flow.parseRepoSlug(savedCheckoutIntent.originRepo);
              if (parsedOrig) originRepoSlug = parsedOrig.slug;
            }
            if (savedCheckoutIntent.repo) {
              var parsedSavedRepo = flow.parseRepoSlug(savedCheckoutIntent.repo);
              if (parsedSavedRepo) preselectedRepo = parsedSavedRepo.slug;
            }
            if (Array.isArray(savedCheckoutIntent.allocations)) {
              orderAllocations = sanitizeDraftAllocations(savedCheckoutIntent.allocations);
            }
            if (Array.isArray(savedCheckoutIntent.reservations)) {
              orderReservations = sanitizeDraftReservations(savedCheckoutIntent.reservations);
            }
          }
        }
      } catch (_) {}

      var repoCheck = flow.parseRepoSearch(query);
      if (repoCheck.status === "valid") {
        preselectedRepo = repoCheck.slug;
        originRepoSlug = repoCheck.slug;
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
            if (!originRepoSlug) originRepoSlug = parsedLegacy.slug;
          }
        } catch (_) {}
      }

      var billingCheck = flow.parseBillingParam(query);
      if (billingCheck.status === "valid") preferredBilling = billingCheck.billing;
      var seatCheck = flow.parseSeatParam(query);
      if (seatCheck.status === "valid") {
        preferredSeats = seatCheck.seats;
        seatsExplicitInUrl = true;
      }
      var repoCountCheck = typeof flow.parseRepoCountParam === "function"
        ? flow.parseRepoCountParam(query)
        : { status: "absent" };
      if (repoCountCheck.status === "valid") pricingReposCount = repoCountCheck.repos;
      var sourceCheck = typeof flow.parseSourceParam === "function"
        ? flow.parseSourceParam(query)
        : { status: "absent" };
      if (sourceCheck.status === "valid") {
        sourceMode = sourceCheck.source;
        if (sourceMode === "cli" && !seatsExplicitInUrl) {
          preferredSeats = 1;
        }
      }
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
        } else {
          if (!originRepoSlug && storedPendingCheckout.origin_repo) {
            originRepoSlug = storedPendingCheckout.origin_repo;
          }
          if (!originProjectId && storedPendingCheckout.origin_project_id) {
            originProjectId = storedPendingCheckout.origin_project_id;
          }
          if (checkoutReturned) {
            storedPendingCheckout.returned = true;
            if (!storedPendingCheckout.repo && preselectedRepo) storedPendingCheckout.repo = preselectedRepo;
            if (!storedPendingCheckout.continuation && activeContinuation) storedPendingCheckout.continuation = activeContinuation;
            storeSet("checkout_pending", storedPendingCheckout);
          }
        }
      } else if (checkoutReturned) {
        storeSet("checkout_pending", {
          project_id: originProjectId || preselectedRepo || null,
          origin_project_id: originProjectId || null,
          origin_repo: originRepoSlug || preselectedRepo || null,
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
      var addAllocForm = byId("add-alloc-form");
      if (addAllocForm) {
        addAllocForm.onsubmit = function (ev) {
          if (ev && typeof ev.preventDefault === "function") ev.preventDefault();
          handleAddAllocationRepo().catch(function () { setStatus("Could not verify repository.", true); });
        };
      }
      var addAllocBtn = byId("add-alloc-btn");
      if (addAllocBtn) {
        addAllocBtn.onclick = function (ev) {
          if (ev && typeof ev.preventDefault === "function") ev.preventDefault();
          handleAddAllocationRepo().catch(function () { setStatus("Could not verify repository.", true); });
        };
      }
      var authReposBtn = byId("authorize-github-repos-btn");
      if (authReposBtn) authReposBtn.onclick = function () { beginAuth("github", "sign_in", true).catch(function () { setStatus("Could not open GitHub authorization.", true); }); };
      var stateRetryBtn = byId("state-retry-btn");
      if (stateRetryBtn) {
        stateRetryBtn.onclick = function () {
          if (lastStateKind === "pending_fulfillment") {
            runContinuationPoll(activeContinuation, originProjectId || activeProjectId, originRepoSlug || preselectedRepo).catch(function () {});
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
        seatEl.onchange = function () {
          if (orderAllocations.length > 0) orderAllocations[0].capacity = clampSeats(seatEl.value);
          renderAllocationsTable();
          scheduleQuoteRefresh();
        };
        seatEl.oninput = function () {
          if (orderAllocations.length > 0) orderAllocations[0].capacity = clampSeats(seatEl.value);
          scheduleQuoteRefresh();
        };
      }
      var minusBtn = byId("seat-minus-btn");
      if (minusBtn) {
        minusBtn.onclick = function () {
          var el = byId("seat-quantity");
          if (!el) return;
          var next = Math.max(1, (Math.floor(Number(el.value)) || 1) - 1);
          el.value = String(next);
          if (orderAllocations.length > 0) orderAllocations[0].capacity = next;
          renderAllocationsTable();
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
          if (orderAllocations.length > 0) orderAllocations[0].capacity = next;
          renderAllocationsTable();
          scheduleQuoteRefresh();
        };
      }

      var addResBtn = byId("add-reservation-btn");
      if (addResBtn) {
        addResBtn.onclick = function () {
          var seatInp = byId("add-reservation-seats-input");
          var hintEl = byId("add-reservation-hint");
          var cap = clampSeats(seatInp ? seatInp.value : 1);
          if (orderAllocations.length + orderReservations.length >= 100) {
            if (hintEl) hintEl.textContent = "Maximum 100 repositories and slots per subscription.";
            return;
          }
          orderReservations.push({ reservation_id: null, capacity: cap, existing: false });
          if (hintEl) hintEl.textContent = "Added future repository slot (" + cap + (cap === 1 ? " seat" : " seats") + ").";
          renderReservationsTable();
          savePendingIntent();
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
            addAllocInFlight = false;
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
      addAllocationRepo: handleAddAllocationRepo,
      setAllocationCapacity: function (projectId, capacity) {
        var row = orderAllocations.find(function (a) { return a.project_id === projectId || a.slug === projectId; });
        if (!row) return false;
        row.capacity = clampSeats(capacity);
        renderAllocationsTable();
        savePendingIntent();
        scheduleQuoteRefresh();
        return true;
      },
      removeAllocationRepo: function (projectId) {
        if (orderAllocations.length <= 1 && orderReservations.length === 0) return false;
        var idx = orderAllocations.findIndex(function (a) { return a.project_id === projectId || a.slug === projectId; });
        if (idx === -1 || orderAllocations[idx].currentCapacity > 0) return false;
        orderAllocations.splice(idx, 1);
        renderAllocationsTable();
        savePendingIntent();
        scheduleQuoteRefresh();
        return true;
      },
      addReservationSlot: function (capacity) {
        if (orderAllocations.length + orderReservations.length >= 100) return false;
        orderReservations.push({ reservation_id: null, capacity: clampSeats(capacity), existing: false });
        renderReservationsTable();
        savePendingIntent();
        scheduleQuoteRefresh();
        return true;
      },
      removeReservationSlot: function (idx) {
        if (!orderReservations[idx] || orderReservations[idx].existing) return false;
        orderReservations.splice(idx, 1);
        renderReservationsTable();
        savePendingIntent();
        scheduleQuoteRefresh();
        return true;
      },
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
          originRepoSlug: originRepoSlug,
          sourceMode: sourceMode,
          pricingReposCount: pricingReposCount,
          preferredBilling: preferredBilling,
          preferredSeats: preferredSeats,
          activeProjectId: activeProjectId,
          activeOrganizationId: activeOrganizationId,
          allocations: orderAllocations.map(function (a) {
            return { project_id: a.project_id, slug: a.slug, capacity: a.capacity, currentCapacity: a.currentCapacity, isOrigin: a.isOrigin };
          }),
          reservations: orderReservations.map(function (r) {
            return { reservation_id: r.reservation_id || null, capacity: r.capacity, existing: Boolean(r.existing) };
          }),
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
