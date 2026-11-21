(function (root) {
  "use strict";

  var CANONICAL_SITE_ORIGIN = "https://decapodlabs.ai";
  var CANONICAL_AUTH_ORIGIN = "https://api.decapodlabs.ai";
  var FALLBACK_CLOUD_ORIGIN = "https://goyxpcmxetztjlrrcwew.supabase.co";
  var CANONICAL_ONBOARDING_PREFIX = "/functions/v1/decapod-onboarding";
  var TRUSTED_API_ORIGINS = Object.freeze([
    CANONICAL_AUTH_ORIGIN,
    FALLBACK_CLOUD_ORIGIN
  ]);
  var TRUSTED_CHECKOUT_HOSTS = Object.freeze([
    "checkout.stripe.com",
    "invoice.stripe.com",
    "billing.stripe.com"
  ]);
  var OWNER_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,98}[A-Za-z0-9])?$/;
  var REPO_PATTERN = /^(?!\.{1,2}$)(?!.*\.\.)[A-Za-z0-9._-]{1,100}$/;
  var UUID_PATTERN = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
  var PKCE_HASH_PATTERN = /^[A-Za-z0-9_-]{43}$/;
  var PROVIDERS = Object.freeze(["github", "google", "gitlab"]);

  function nowSeconds() {
    return Math.floor(Date.now() / 1000);
  }

  function hasControlOrSpace(value) {
    return /[\s\u0000-\u001f\u007f]/.test(value);
  }

  function parseRepoSlug(raw) {
    if (typeof raw !== "string") return null;
    var trimmed = raw.trim();
    if (!trimmed || trimmed.length > 201 || hasControlOrSpace(trimmed)) return null;
    if (trimmed.includes("%") || trimmed.includes("?") || trimmed.includes("#") || trimmed.includes("\\")) {
      return null;
    }
    var parts = trimmed.split("/");
    if (parts.length !== 2) return null;
    var owner = parts[0];
    var repo = parts[1];
    if (!OWNER_PATTERN.test(owner) || owner.includes("..")) return null;
    if (!REPO_PATTERN.test(repo)) return null;
    if (repo.endsWith(".git")) return null;
    return {
      owner: owner,
      repo: repo,
      slug: owner + "/" + repo
    };
  }

  function parseRepoSearch(search) {
    var params = search instanceof URLSearchParams
      ? search
      : new URLSearchParams(typeof search === "string" ? search : "");
    var values = params.getAll("repo");
    if (values.length === 0) {
      return { status: "absent", slug: null, valid: false };
    }
    if (values.length !== 1) {
      return { status: "invalid", slug: null, valid: false };
    }
    var parsed = parseRepoSlug(values[0]);
    if (!parsed) {
      return { status: "invalid", slug: null, valid: false };
    }
    return { status: "valid", slug: parsed.slug, owner: parsed.owner, repo: parsed.repo, valid: true };
  }

  function isAllowedSiteOrigin(origin) {
    return typeof origin === "string" && (
      origin === CANONICAL_SITE_ORIGIN ||
      origin === "https://decapodlabs.github.io"
    );
  }

  function sanitizeReturnUrl(rawUrl, expectedOrigin, allowedPaths) {
    if (typeof rawUrl !== "string" || !rawUrl || rawUrl.length > 2048 || hasControlOrSpace(rawUrl)) {
      return null;
    }
    var target;
    try {
      target = new URL(rawUrl);
    } catch (_) {
      return null;
    }
    if (target.protocol !== "https:") return null;
    if (target.username || target.password || target.hash) return null;
    var originToMatch = typeof expectedOrigin === "string" && expectedOrigin
      ? expectedOrigin
      : CANONICAL_SITE_ORIGIN;
    if (target.origin !== originToMatch) return null;
    var paths = Array.isArray(allowedPaths) && allowedPaths.length
      ? allowedPaths
      : ["/signup", "/signup/"];
    if (!paths.includes(target.pathname)) return null;
    return target.href;
  }

  function parseSafeReturnParam(search, expectedOrigin) {
    var params = search instanceof URLSearchParams
      ? search
      : new URLSearchParams(typeof search === "string" ? search : "");
    var rawValues = params.getAll("return_to").concat(params.getAll("redirect_to"));
    if (rawValues.length === 0) {
      return { status: "absent", url: null, valid: false };
    }
    if (rawValues.length !== 1) {
      return { status: "rejected", url: null, valid: false };
    }
    var safe = sanitizeReturnUrl(rawValues[0], expectedOrigin, ["/signup", "/signup/", "/pricing", "/pricing/"]);
    if (!safe) {
      return { status: "rejected", url: null, valid: false };
    }
    return { status: "valid", url: safe, valid: true };
  }

  function isTrustedApiOrigin(origin) {
    return typeof origin === "string" && TRUSTED_API_ORIGINS.includes(origin);
  }

  function isTrustedAuthUrl(rawUrl) {
    if (typeof rawUrl !== "string" || !rawUrl || rawUrl.length > 2048 || hasControlOrSpace(rawUrl)) {
      return false;
    }
    var parsed;
    try {
      parsed = new URL(rawUrl);
    } catch (_) {
      return false;
    }
    if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.hash) {
      return false;
    }
    if (!isTrustedApiOrigin(parsed.origin)) return false;
    return parsed.pathname === "/auth" || parsed.pathname === CANONICAL_ONBOARDING_PREFIX + "/auth";
  }

  function isAllowedCheckoutUrl(rawUrl) {
    if (typeof rawUrl !== "string" || !rawUrl || rawUrl.length > 4096 || hasControlOrSpace(rawUrl)) {
      return false;
    }
    var parsed;
    try {
      parsed = new URL(rawUrl);
    } catch (_) {
      return false;
    }
    if (parsed.protocol !== "https:" || parsed.username || parsed.password) return false;
    return TRUSTED_CHECKOUT_HOSTS.includes(parsed.hostname);
  }

  function buildAuthAuthorizeUrl(options) {
    var opts = options || {};
    var authBaseUrl = opts.authBaseUrl || (CANONICAL_AUTH_ORIGIN + "/auth");
    if (!isTrustedAuthUrl(authBaseUrl)) {
      throw new Error("untrusted_auth_origin");
    }
    var provider = opts.provider || "github";
    if (!["github", "google", "gitlab"].includes(provider)) {
      throw new Error("invalid_provider");
    }
    var expectedOrigin = opts.expectedOrigin || CANONICAL_SITE_ORIGIN;
    var safeReturn = sanitizeReturnUrl(
      opts.returnTo || (expectedOrigin + "/signup"),
      expectedOrigin,
      ["/signup", "/signup/"]
    );
    if (!safeReturn) {
      throw new Error("hostile_return_url");
    }
    var url = new URL(authBaseUrl);
    var params = new URLSearchParams({
      provider: provider,
      return_to: safeReturn
    });
    if (opts.codeChallenge !== undefined && opts.codeChallenge !== null) {
      if (typeof opts.codeChallenge !== "string" || !PKCE_HASH_PATTERN.test(opts.codeChallenge)) {
        throw new Error("invalid_pkce_challenge");
      }
      params.set("code_challenge", opts.codeChallenge);
      params.set("code_challenge_method", "s256");
    }
    url.search = params.toString();
    return url.href;
  }

  function buildSignupHandoffUrl(options) {
    var opts = options || {};
    var origin = opts.origin || CANONICAL_SITE_ORIGIN;
    var base = sanitizeReturnUrl(origin + "/signup", origin, ["/signup"]);
    if (!base) {
      throw new Error("hostile_return_url");
    }
    var url = new URL(base);
    if (opts.repo) {
      var parsed = parseRepoSlug(opts.repo);
      if (parsed) {
        url.searchParams.set("repo", parsed.slug);
      }
    }
    if (opts.billing === "month" || opts.billing === "year") {
      url.searchParams.set("billing", opts.billing);
    }
    return url.href;
  }

  function validateSessionRecord(value, expectedProjectOrigin, currentUnixSeconds) {
    var now = Number.isSafeInteger(currentUnixSeconds) ? currentUnixSeconds : nowSeconds();
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    if (!isTrustedApiOrigin(value.origin)) return false;
    if (expectedProjectOrigin && value.origin !== expectedProjectOrigin) return false;
    if (typeof value.access_token !== "string" || value.access_token.length === 0 || value.access_token.length > 16384) {
      return false;
    }
    if (/\s/.test(value.access_token)) return false;
    if (!Number.isSafeInteger(value.expires_at) || value.expires_at <= now + 15) return false;
    return true;
  }

  function hasHostileFragmentTokens(fragmentString) {
    var fragment = new URLSearchParams(
      typeof fragmentString === "string" && fragmentString.startsWith("#")
        ? fragmentString.slice(1)
        : (typeof fragmentString === "string" ? fragmentString : "")
    );
    return fragment.has("access_token") || fragment.has("refresh_token") || fragment.has("provider_token");
  }

  function listVerifiedProviders(user) {
    if (!user || !Array.isArray(user.identities)) return [];
    var out = [];
    for (var i = 0; i < user.identities.length; i++) {
      var item = user.identities[i];
      if (!item || typeof item !== "object" || Array.isArray(item)) continue;
      if (item.user_id && user.id && item.user_id !== user.id) continue;
      if (PROVIDERS.includes(item.provider) && !out.includes(item.provider)) {
        out.push(item.provider);
      }
    }
    return out;
  }

  function hasVerifiedProvider(user, provider) {
    return listVerifiedProviders(user).includes(provider);
  }

  function classifyAccessState(payload, errorCode) {
    if (errorCode) {
      if (errorCode === "organization_already_enrolled") return "organization_already_enrolled";
      if (errorCode === "repository_already_enrolled") return "repository_already_enrolled";
      if (errorCode === "admin_approval_required" || errorCode === "admin_required") {
        return "admin_approval_required";
      }
      if (errorCode === "code_host_link_required") return "code_host_link_required";
      if (errorCode === "provider_link_stepup_required") return "provider_link_stepup_required";
      if (errorCode === "pending_fulfillment" || errorCode === "payment_pending") {
        return "pending_fulfillment";
      }
      if (errorCode === "billing_not_configured" || errorCode === "live_sale_disabled") {
        return "billing_disabled";
      }
    }
    if (!payload || typeof payload !== "object") return "unauthenticated";
    if (payload.status === "provider_link_stepup_required" || payload.identity_state === "stepup_required") {
      return "provider_link_stepup_required";
    }
    if (payload.status === "code_host_link_required") return "code_host_link_required";
    if (payload.status === "organization_already_enrolled") return "organization_already_enrolled";
    if (payload.status === "admin_approval_required") return "admin_approval_required";
    if (payload.status === "pending_fulfillment") return "pending_fulfillment";
    if (payload.backend_authorized === true && payload.status === "active") return "ready";
    if (payload.status === "entitlement_required") return "entitlement_required";
    if (payload.status === "registration_required") return "registration_required";
    return "pending_verification";
  }

  function defaultSleep(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  async function createBoundedPoller(options) {
    var opts = options || {};
    var maxAttempts = Number.isSafeInteger(opts.maxAttempts) && opts.maxAttempts > 0 ? opts.maxAttempts : 12;
    var intervalMs = Number.isSafeInteger(opts.intervalMs) && opts.intervalMs >= 0 ? opts.intervalMs : 2500;
    var checkFn = opts.checkFn;
    var onUpdate = typeof opts.onUpdate === "function" ? opts.onUpdate : function () {};
    var sleepFn = typeof opts.sleepFn === "function" ? opts.sleepFn : defaultSleep;
    var isCancelled = typeof opts.isCancelled === "function" ? opts.isCancelled : function () { return false; };

    for (var attempt = 1; attempt <= maxAttempts; attempt++) {
      if (isCancelled()) return { outcome: "cancelled", attempts: attempt - 1 };
      onUpdate({ phase: "checking", attempt: attempt, maxAttempts: maxAttempts });
      var result = await checkFn(attempt);
      if (isCancelled()) return { outcome: "cancelled", attempts: attempt };
      var state = classifyAccessState(result);
      if (state === "ready") {
        return { outcome: "ready", attempts: attempt, result: result };
      }
      if (state === "organization_already_enrolled" || state === "admin_approval_required") {
        return { outcome: state, attempts: attempt, result: result };
      }
      if (attempt < maxAttempts) {
        onUpdate({ phase: "waiting", attempt: attempt, maxAttempts: maxAttempts, result: result });
        await sleepFn(intervalMs);
      }
    }
    return { outcome: "pending_timeout", attempts: maxAttempts };
  }

  function normalizeDiscoveryProfile(data, apiOrigin, authBaseUrl) {
    if (!data || typeof data !== "object" || Array.isArray(data)) return null;
    if (typeof data.project_origin !== "string" || !isTrustedApiOrigin(data.project_origin)) return null;
    if (typeof data.publishable_key !== "string" || !data.publishable_key.startsWith("sb_publishable_") || /[^A-Za-z0-9_-]/.test(data.publishable_key)) {
      return null;
    }
    var rawProviders = data.auth_providers;
    var providers = {
      github: rawProviders ? Boolean(rawProviders.github) : true,
      google: rawProviders ? Boolean(rawProviders.google) : false,
      gitlab: rawProviders ? Boolean(rawProviders.gitlab) : false
    };
    return {
      apiOrigin: apiOrigin,
      onboardingPrefix: apiOrigin + CANONICAL_ONBOARDING_PREFIX,
      authBaseUrl: authBaseUrl,
      projectOrigin: data.project_origin,
      publishableKey: data.publishable_key,
      authProviders: providers,
      liveSaleEnabled: data.live_sale_enabled === true && data.billing_enabled === true
    };
  }

  async function probeDiscoveryCandidate(fetchFn, candidate) {
    try {
      var res = await fetchFn(candidate.configUrl, {
        method: "GET",
        redirect: "error",
        credentials: "omit",
        signal: typeof AbortSignal !== "undefined" && AbortSignal.timeout ? AbortSignal.timeout(6000) : undefined
      });
      if (!res.ok) {
        if (res.body && typeof res.body.cancel === "function") await res.body.cancel().catch(function () {});
        return null;
      }
      var data = await res.json();
      return normalizeDiscoveryProfile(data, candidate.apiOrigin, candidate.authBaseUrl);
    } catch (_) {
      return null;
    }
  }

  async function discoverRuntimeConfig(fetchFn) {
    var fetcher = fetchFn || root.fetch;
    if (typeof fetcher !== "function") return null;
    var candidates = [
      {
        apiOrigin: CANONICAL_AUTH_ORIGIN,
        configUrl: CANONICAL_AUTH_ORIGIN + CANONICAL_ONBOARDING_PREFIX + "/config?include_auth_providers=true",
        authBaseUrl: CANONICAL_AUTH_ORIGIN + "/auth"
      },
      {
        apiOrigin: FALLBACK_CLOUD_ORIGIN,
        configUrl: FALLBACK_CLOUD_ORIGIN + CANONICAL_ONBOARDING_PREFIX + "/config?include_auth_providers=true",
        authBaseUrl: FALLBACK_CLOUD_ORIGIN + CANONICAL_ONBOARDING_PREFIX + "/auth"
      }
    ];
    for (var i = 0; i < candidates.length; i++) {
      var profile = await probeDiscoveryCandidate(fetcher, candidates[i]);
      if (profile) {
        if (profile.apiOrigin === CANONICAL_AUTH_ORIGIN) {
          try {
            var rootAuthCheck = await fetcher(CANONICAL_AUTH_ORIGIN + "/auth/providers", {
              method: "GET",
              redirect: "error",
              credentials: "omit",
              signal: typeof AbortSignal !== "undefined" && AbortSignal.timeout ? AbortSignal.timeout(4000) : undefined
            });
            if (!rootAuthCheck.ok) {
              profile.authBaseUrl = CANONICAL_AUTH_ORIGIN + CANONICAL_ONBOARDING_PREFIX + "/auth";
            }
            if (rootAuthCheck.body && typeof rootAuthCheck.body.cancel === "function") {
              await rootAuthCheck.body.cancel().catch(function () {});
            }
          } catch (_) {
            profile.authBaseUrl = CANONICAL_AUTH_ORIGIN + CANONICAL_ONBOARDING_PREFIX + "/auth";
          }
        }
        return profile;
      }
    }
    return null;
  }

  function encodeBase64Url(bytes) {
    var bin = "";
    for (var i = 0; i < bytes.length; i++) {
      bin += String.fromCharCode(bytes[i]);
    }
    return btoa(bin).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
  }

  function randomSecret() {
    var bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    return encodeBase64Url(bytes);
  }

  async function sha256Base64Url(value) {
    var encoded = new TextEncoder().encode(value);
    var digest = await crypto.subtle.digest("SHA-256", encoded);
    return encodeBase64Url(new Uint8Array(digest));
  }

  root.DecapodCloudFlow = Object.freeze({
    CANONICAL_SITE_ORIGIN: CANONICAL_SITE_ORIGIN,
    CANONICAL_AUTH_ORIGIN: CANONICAL_AUTH_ORIGIN,
    FALLBACK_CLOUD_ORIGIN: FALLBACK_CLOUD_ORIGIN,
    CANONICAL_ONBOARDING_PREFIX: CANONICAL_ONBOARDING_PREFIX,
    UUID_PATTERN: UUID_PATTERN,
    PKCE_HASH_PATTERN: PKCE_HASH_PATTERN,
    parseRepoSlug: parseRepoSlug,
    parseRepoSearch: parseRepoSearch,
    isAllowedSiteOrigin: isAllowedSiteOrigin,
    sanitizeReturnUrl: sanitizeReturnUrl,
    parseSafeReturnParam: parseSafeReturnParam,
    isTrustedApiOrigin: isTrustedApiOrigin,
    isTrustedAuthUrl: isTrustedAuthUrl,
    isAllowedCheckoutUrl: isAllowedCheckoutUrl,
    buildAuthAuthorizeUrl: buildAuthAuthorizeUrl,
    buildSignupHandoffUrl: buildSignupHandoffUrl,
    validateSessionRecord: validateSessionRecord,
    hasHostileFragmentTokens: hasHostileFragmentTokens,
    listVerifiedProviders: listVerifiedProviders,
    hasVerifiedProvider: hasVerifiedProvider,
    classifyAccessState: classifyAccessState,
    createBoundedPoller: createBoundedPoller,
    normalizeDiscoveryProfile: normalizeDiscoveryProfile,
    discoverRuntimeConfig: discoverRuntimeConfig,
    randomSecret: randomSecret,
    sha256Base64Url: sha256Base64Url
  });
})(typeof globalThis !== "undefined" ? globalThis : window);
