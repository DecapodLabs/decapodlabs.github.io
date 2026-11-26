(function (root) {
  "use strict";

  var ASSET_RELEASE = "20261125-commercial";
  var CONTRACT_VERSION = 1;
  var SUPPORTED_API_CONTRACT_MAJORS = Object.freeze([1]);
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
  var CONTINUATION_PATTERN = /^v1\.[a-f0-9]{32}\.[A-Za-z0-9_-]{22}$/;
  var PKCE_HASH_PATTERN = /^[A-Za-z0-9_-]{43}$/;
  var PROVIDERS = Object.freeze(["github", "google", "gitlab"]);
  var SENSITIVE_QUERY_PARAMS = Object.freeze([
    "repo",
    "billing",
    "seats",
    "checkout",
    "continuation",
    "return_to",
    "redirect_to",
    "code",
    "login_nonce",
    "access_token",
    "refresh_token",
    "provider_token",
    "token",
    "invitation_id",
    "invitation_secret",
    "error",
    "error_description"
  ]);

  function nowSeconds() {
    return Math.floor(Date.now() / 1000);
  }

  function hasControlOrSpace(value) {
    return /[\s\u0000-\u001f\u007f]/.test(value);
  }

  function parseOrgSlug(raw) {
    if (typeof raw !== "string") return null;
    var trimmed = raw.trim();
    if (!trimmed || trimmed.length > 100 || hasControlOrSpace(trimmed)) return null;
    if (trimmed === "." || trimmed === "..") return null;
    if (trimmed.includes("%") || trimmed.includes("?") || trimmed.includes("#") ||
        trimmed.includes("\\") || trimmed.includes("/") || trimmed.includes("..") ||
        trimmed.includes("<") || trimmed.includes(">") || trimmed.includes("\"") ||
        trimmed.includes("'")) {
      return null;
    }
    if (trimmed.endsWith(".git")) return null;
    if (UUID_PATTERN.test(trimmed)) {
      return { slug: trimmed.toLowerCase(), isUuid: true };
    }
    if (!OWNER_PATTERN.test(trimmed)) return null;
    return { slug: trimmed, isUuid: false };
  }

  function parseAdminRoute(pathname, search) {
    if (typeof pathname !== "string" || !pathname || pathname.length > 512 || hasControlOrSpace(pathname)) {
      return { status: "invalid", reason: "invalid_route", org: null, isUuid: false, source: "none", valid: false };
    }
    if (pathname.includes("\\") || pathname.includes("?") || pathname.includes("#") ||
        pathname.includes("<") || pathname.includes(">") || pathname.includes("//")) {
      return { status: "invalid", reason: "malformed_route", org: null, isUuid: false, source: "none", valid: false };
    }
    var params = search instanceof URLSearchParams
      ? search
      : new URLSearchParams(typeof search === "string" ? search : "");

    if (pathname === "/admin" || pathname === "/admin/") {
      var orgValues = params.getAll("org");
      if (orgValues.length === 0) {
        return { status: "absent", reason: null, org: null, isUuid: false, source: "none", valid: false };
      }
      if (orgValues.length > 1) {
        return { status: "invalid", reason: "duplicate_org", org: null, isUuid: false, source: "query", valid: false };
      }
      var queryOrg = parseOrgSlug(orgValues[0]);
      if (!queryOrg) {
        return { status: "invalid", reason: "invalid_org", org: null, isUuid: false, source: "query", valid: false };
      }
      return { status: "valid", reason: null, org: queryOrg.slug, isUuid: queryOrg.isUuid, source: "query", valid: true };
    }

    if (!pathname.startsWith("/admin/")) {
      return { status: "invalid", reason: "invalid_route", org: null, isUuid: false, source: "none", valid: false };
    }

    var rest = pathname.slice("/admin/".length);
    if (rest.endsWith("/")) rest = rest.slice(0, -1);
    if (!rest || rest.includes("/")) {
      return { status: "invalid", reason: "malformed_route", org: null, isUuid: false, source: "path", valid: false };
    }
    if (/%2e|%2f|%5c|%00|%3c|%3e/i.test(rest)) {
      return { status: "invalid", reason: "invalid_org", org: null, isUuid: false, source: "path", valid: false };
    }
    var decoded;
    try {
      decoded = decodeURIComponent(rest);
    } catch (_) {
      return { status: "invalid", reason: "invalid_org", org: null, isUuid: false, source: "path", valid: false };
    }
    var pathOrg = parseOrgSlug(decoded);
    if (!pathOrg) {
      return { status: "invalid", reason: "invalid_org", org: null, isUuid: false, source: "path", valid: false };
    }
    if (params.has("org")) {
      var qVals = params.getAll("org");
      if (qVals.length !== 1) {
        return { status: "invalid", reason: "conflicting_org", org: null, isUuid: false, source: "path", valid: false };
      }
      var qMatch = parseOrgSlug(qVals[0]);
      if (!qMatch || qMatch.slug.toLowerCase() !== pathOrg.slug.toLowerCase()) {
        return { status: "invalid", reason: "conflicting_org", org: null, isUuid: false, source: "path", valid: false };
      }
    }
    return { status: "valid", reason: null, org: pathOrg.slug, isUuid: pathOrg.isUuid, source: "path", valid: true };
  }

  function isAllowedAdminPathname(pathname) {
    var parsed = parseAdminRoute(pathname, "");
    return parsed.status === "absent" || parsed.status === "valid";
  }

  function buildAdminBrowserPath(currentPathname, orgSlug) {
    var parsed = parseOrgSlug(orgSlug);
    if (!parsed) return "/admin/";
    var isSubpathMode = typeof currentPathname === "string" &&
      currentPathname.startsWith("/admin/") &&
      currentPathname !== "/admin/";
    if (isSubpathMode) {
      return "/admin/" + encodeURIComponent(parsed.slug);
    }
    return "/admin/?org=" + encodeURIComponent(parsed.slug);
  }

  function listAdminOrganizations(organizations) {
    if (!Array.isArray(organizations)) return [];
    var out = [];
    for (var i = 0; i < organizations.length; i++) {
      var item = organizations[i];
      if (!item || typeof item !== "object" || Array.isArray(item)) continue;
      if (item.admin !== true) continue;
      if (typeof item.id !== "string" || !item.id || item.id.length > 512) continue;
      if (typeof item.cloud_org_id !== "string" || !UUID_PATTERN.test(item.cloud_org_id)) continue;
      out.push({
        id: item.id,
        cloud_org_id: item.cloud_org_id.toLowerCase(),
        scm_provider: typeof item.scm_provider === "string" ? item.scm_provider : null,
        scm_owner_id: typeof item.scm_owner_id === "string" ? item.scm_owner_id : null,
        scm_owner_slug: typeof item.scm_owner_slug === "string" ? item.scm_owner_slug : null,
        admin: true
      });
    }
    return out;
  }

  function resolveAdminOrganization(organizations, requestedOrg) {
    if (!Array.isArray(organizations)) {
      return { status: "denied", reason: "organization_access_denied", org: null };
    }
    var parsed = parseOrgSlug(requestedOrg);
    if (!parsed) {
      return { status: "denied", reason: "invalid_org", org: null };
    }
    var targetLower = parsed.slug.toLowerCase();
    var matches = [];
    for (var i = 0; i < organizations.length; i++) {
      var item = organizations[i];
      if (!item || typeof item !== "object" || Array.isArray(item)) continue;
      var matchesUuid = typeof item.cloud_org_id === "string" && item.cloud_org_id.toLowerCase() === targetLower;
      var matchesId = typeof item.id === "string" && item.id === parsed.slug;
      var matchesSlug = typeof item.scm_owner_slug === "string" && item.scm_owner_slug.toLowerCase() === targetLower;
      if (matchesUuid || matchesId || matchesSlug) {
        matches.push(item);
      }
    }
    if (matches.length === 0) {
      return { status: "denied", reason: "organization_access_denied", org: null };
    }
    if (matches.length > 1) {
      return { status: "denied", reason: "ambiguous_organization", org: null };
    }
    var match = matches[0];
    if (match.admin !== true) {
      return { status: "denied", reason: "admin_required", org: null };
    }
    if (typeof match.id !== "string" || !match.id || match.id.length > 512 ||
        typeof match.cloud_org_id !== "string" || !UUID_PATTERN.test(match.cloud_org_id)) {
      return { status: "denied", reason: "invalid_org_identity", org: null };
    }
    return {
      status: "authorized",
      reason: null,
      org: {
        id: match.id,
        cloud_org_id: match.cloud_org_id.toLowerCase(),
        scm_provider: typeof match.scm_provider === "string" ? match.scm_provider : null,
        scm_owner_id: typeof match.scm_owner_id === "string" ? match.scm_owner_id : null,
        scm_owner_slug: typeof match.scm_owner_slug === "string" ? match.scm_owner_slug : null,
        admin: true
      }
    };
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

  function sanitizeAdminReturnUrl(rawUrl, expectedOrigin) {
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
    var parsedRoute = parseAdminRoute(target.pathname, target.search);
    if (parsedRoute.status === "invalid") return null;
    return target.href;
  }

  function parseSafeAdminReturnParam(search, expectedOrigin) {
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
    var safe = sanitizeAdminReturnUrl(rawValues[0], expectedOrigin);
    if (!safe) {
      return { status: "rejected", url: null, valid: false };
    }
    return { status: "valid", url: safe, valid: true };
  }

  function buildAdminAuthAuthorizeUrl(options) {
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
    var safeReturn = sanitizeAdminReturnUrl(
      opts.returnTo || (expectedOrigin + "/admin/"),
      expectedOrigin
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

  function parseSeatParam(search) {
    var params = search instanceof URLSearchParams
      ? search
      : new URLSearchParams(typeof search === "string" ? search : "");
    var values = params.getAll("seats");
    if (values.length === 0) return { status: "absent", seats: null, valid: false };
    if (values.length !== 1) return { status: "invalid", seats: null, valid: false };
    var raw = String(values[0] || "").trim();
    if (!/^[1-9][0-9]{0,3}$/.test(raw)) return { status: "invalid", seats: null, valid: false };
    var count = Number(raw);
    if (!Number.isSafeInteger(count) || count < 1 || count > 1000) {
      return { status: "invalid", seats: null, valid: false };
    }
    return { status: "valid", seats: count, valid: true };
  }

  function parseBillingParam(search) {
    var params = search instanceof URLSearchParams
      ? search
      : new URLSearchParams(typeof search === "string" ? search : "");
    var values = params.getAll("billing");
    if (values.length === 0) return { status: "absent", billing: null, valid: false };
    if (values.length !== 1) return { status: "invalid", billing: null, valid: false };
    var val = String(values[0] || "").trim();
    if (val !== "month" && val !== "year") return { status: "invalid", billing: null, valid: false };
    return { status: "valid", billing: val, valid: true };
  }

  function parseContinuationParam(search) {
    var params = search instanceof URLSearchParams
      ? search
      : new URLSearchParams(typeof search === "string" ? search : "");
    var values = params.getAll("continuation");
    if (values.length === 0) return { status: "absent", continuation: null, valid: false };
    if (values.length !== 1) return { status: "invalid", continuation: null, valid: false };
    var val = String(values[0] || "").trim();
    if (!CONTINUATION_PATTERN.test(val)) return { status: "invalid", continuation: null, valid: false };
    return { status: "valid", continuation: val, valid: true };
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
    var normalizedBilling = opts.billing === "annual" ? "year" : opts.billing;
    if (normalizedBilling === "month" || normalizedBilling === "year") {
      url.searchParams.set("billing", normalizedBilling);
    }
    if (opts.seats !== undefined && opts.seats !== null) {
      var seatNum = Math.floor(Number(opts.seats));
      if (Number.isSafeInteger(seatNum) && seatNum >= 1 && seatNum <= 1000) {
        url.searchParams.set("seats", String(seatNum));
      }
    }
    return url.href;
  }

  function isSupportedApiContractVersion(raw) {
    if (raw === undefined || raw === null || raw === "") return true;
    if (typeof raw === "number") return Number.isSafeInteger(raw) && SUPPORTED_API_CONTRACT_MAJORS.includes(raw);
    if (typeof raw !== "string") return false;
    var trimmed = raw.trim();
    if (!trimmed || trimmed.length > 32) return false;
    var match = /^(\d+)(?:\.\d+)?$/.exec(trimmed);
    if (!match) return false;
    return SUPPORTED_API_CONTRACT_MAJORS.includes(Number(match[1]));
  }

  function readDocumentContractMeta(doc) {
    if (!doc || typeof doc.querySelector !== "function") {
      return { status: "compatible", contractVersion: CONTRACT_VERSION, assetRelease: null, legacy: true };
    }
    var contractMeta = doc.querySelector('meta[name="decapod-flow-contract"]');
    if (contractMeta) {
      var rawContract = typeof contractMeta.getAttribute === "function"
        ? contractMeta.getAttribute("content")
        : contractMeta.content;
      if (String(rawContract || "").trim() !== String(CONTRACT_VERSION)) {
        return {
          status: "incompatible",
          reason: "unsupported_html_contract",
          contractVersion: rawContract || null,
          assetRelease: null,
          legacy: false
        };
      }
    }
    var releaseMeta = doc.querySelector('meta[name="decapod-asset-release"]');
    var releaseVal = releaseMeta
      ? (typeof releaseMeta.getAttribute === "function" ? releaseMeta.getAttribute("content") : releaseMeta.content)
      : null;
    return {
      status: "compatible",
      contractVersion: CONTRACT_VERSION,
      assetRelease: typeof releaseVal === "string" && releaseVal ? releaseVal.trim() : null,
      legacy: !contractMeta
    };
  }

  function checkPageCoherence(options) {
    var opts = options || {};
    var doc = opts.document || root.document;
    var requiredIds = Array.isArray(opts.requiredIds) ? opts.requiredIds : [];
    var docMeta = readDocumentContractMeta(doc);
    if (docMeta.status !== "compatible") {
      return { ok: false, reason: docMeta.reason || "unsupported_html_contract", meta: docMeta };
    }
    if (opts.strictRelease === true && docMeta.assetRelease && docMeta.assetRelease !== ASSET_RELEASE) {
      return { ok: false, reason: "asset_release_skew", meta: docMeta };
    }
    if (!doc || typeof doc.getElementById !== "function") {
      return { ok: false, reason: "missing_document", meta: docMeta };
    }
    for (var i = 0; i < requiredIds.length; i++) {
      if (!doc.getElementById(requiredIds[i])) {
        return { ok: false, reason: "missing_required_dom_anchor:" + requiredIds[i], meta: docMeta };
      }
    }
    return { ok: true, reason: null, meta: docMeta };
  }

  function scrubSensitiveLocation(loc, hist, options) {
    if (!loc || !hist || typeof hist.replaceState !== "function") return false;
    var opts = options || {};
    var extraKeys = Array.isArray(opts.extraKeys) ? opts.extraKeys : [];
    var keys = SENSITIVE_QUERY_PARAMS.concat(extraKeys);
    var searchStr = typeof loc.search === "string" ? loc.search : "";
    var hashStr = typeof loc.hash === "string" ? loc.hash : "";
    var pathname = typeof loc.pathname === "string" && loc.pathname ? loc.pathname : "/";
    var params = new URLSearchParams(searchStr);
    var changed = false;

    for (var i = 0; i < keys.length; i++) {
      if (params.has(keys[i])) {
        params.delete(keys[i]);
        changed = true;
      }
    }
    var nextHash = hashStr;
    if (hashStr && (hasHostileFragmentTokens(hashStr) || opts.stripAllHash === true)) {
      nextHash = "";
      changed = true;
    }
    if (!changed) return false;
    var nextQuery = params.toString();
    var target = pathname + (nextQuery ? "?" + nextQuery : "") + nextHash;
    try {
      hist.replaceState(null, "", target);
      return true;
    } catch (_) {
      return false;
    }
  }

  function createCoherenceChannel(options) {
    var opts = options || {};
    var ChannelCtor = opts.BroadcastChannel ||
      (typeof window !== "undefined" && typeof BroadcastChannel === "function" ? BroadcastChannel : null);
    if (typeof ChannelCtor !== "function") {
      return {
        announceReady: function () {},
        broadcastAuthInvalidated: function () {},
        broadcastIntentSync: function () {},
        broadcastCheckoutEvent: function () {},
        close: function () {}
      };
    }
    var channel;
    try {
      channel = new ChannelCtor("decapod-cloud-coherence");
    } catch (_) {
      return {
        announceReady: function () {},
        broadcastAuthInvalidated: function () {},
        broadcastIntentSync: function () {},
        broadcastCheckoutEvent: function () {},
        close: function () {}
      };
    }
    var tabId = randomSecret();
    var onSkew = typeof opts.onSkew === "function" ? opts.onSkew : function () {};
    var onAuthInvalidated = typeof opts.onAuthInvalidated === "function" ? opts.onAuthInvalidated : function () {};
    var onIntentSync = typeof opts.onIntentSync === "function" ? opts.onIntentSync : function () {};
    var onCheckoutEvent = typeof opts.onCheckoutEvent === "function" ? opts.onCheckoutEvent : function () {};

    channel.onmessage = function (ev) {
      var msg = ev && ev.data;
      if (!msg || typeof msg !== "object" || msg.tabId === tabId) return;
      if (msg.type === "tab_hello" || msg.type === "release_skew") {
        if ((typeof msg.contractVersion === "number" && msg.contractVersion !== CONTRACT_VERSION) ||
            (typeof msg.assetRelease === "string" && msg.assetRelease && msg.assetRelease !== ASSET_RELEASE)) {
          onSkew(msg);
        }
        return;
      }
      if (msg.type === "auth_invalidated") {
        onAuthInvalidated(msg);
        return;
      }
      if (msg.type === "intent_sync") {
        onIntentSync(msg);
        return;
      }
      if (msg.type === "checkout_started" || msg.type === "checkout_returned" || msg.type === "fulfillment_status") {
        onCheckoutEvent(msg);
      }
    };

    function safePost(payload) {
      try {
        channel.postMessage(Object.assign({ tabId: tabId }, payload));
      } catch (_) {}
    }

    return {
      announceReady: function () {
        safePost({
          type: "tab_hello",
          contractVersion: CONTRACT_VERSION,
          assetRelease: ASSET_RELEASE
        });
      },
      broadcastAuthInvalidated: function (projectOrigin) {
        safePost({
          type: "auth_invalidated",
          projectOrigin: typeof projectOrigin === "string" ? projectOrigin : null,
          contractVersion: CONTRACT_VERSION
        });
      },
      broadcastIntentSync: function (payload) {
        var p = payload && typeof payload === "object" ? payload : {};
        var repoParsed = typeof p.repo === "string" ? parseRepoSlug(p.repo) : null;
        safePost({
          type: "intent_sync",
          page: typeof p.page === "string" ? p.page : null,
          repo: repoParsed ? repoParsed.slug : null,
          billing: p.billing === "year" || p.billing === "month" ? p.billing : null,
          contractVersion: CONTRACT_VERSION,
          assetRelease: ASSET_RELEASE
        });
      },
      broadcastCheckoutEvent: function (eventType, payload) {
        if (!["checkout_started", "checkout_returned", "fulfillment_status"].includes(eventType)) return;
        var p = payload && typeof payload === "object" ? payload : {};
        safePost({
          type: eventType,
          projectOrigin: typeof p.projectOrigin === "string" ? p.projectOrigin : null,
          organizationId: typeof p.organizationId === "string" ? p.organizationId : null,
          projectId: typeof p.projectId === "string" ? p.projectId : null,
          orderId: typeof p.orderId === "string" ? p.orderId : null,
          quoteId: typeof p.quoteId === "string" ? p.quoteId : null,
          requestId: typeof p.requestId === "string" ? p.requestId : null,
          state: typeof p.state === "string" ? p.state : null,
          contractVersion: CONTRACT_VERSION,
          assetRelease: ASSET_RELEASE
        });
      },
      close: function () {
        try {
          if (typeof channel.close === "function") channel.close();
        } catch (_) {}
      }
    };
  }

  function validateSessionRecord(value, expectedProjectOrigin, currentUnixSeconds) {
    var now = Number.isSafeInteger(currentUnixSeconds) ? currentUnixSeconds : nowSeconds();
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    if (value.contract_version !== undefined && value.contract_version !== CONTRACT_VERSION) return false;
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
    if (payload.status === "pending_fulfillment" || payload.status === "payment_pending") return "pending_fulfillment";
    if (payload.backend_authorized === true && (payload.status === "active" || payload.status === "ready")) return "ready";
    if (payload.status === "entitlement_required") return "entitlement_required";
    if (payload.status === "registration_required") return "registration_required";
    return "pending_verification";
  }

  var CORRELATION_ID_PATTERN = /^[A-Za-z0-9_.:-]{4,128}$/;

  function sanitizeCorrelationId(raw) {
    if (typeof raw !== "string") return null;
    var trimmed = raw.trim();
    if (!CORRELATION_ID_PATTERN.test(trimmed)) return null;
    // Never accept JWT-shaped strings (three base64url segments) or secret prefixes as support refs.
    if (/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(trimmed)) return null;
    if (/^(?:gh[pousr]_|github_pat_|[sr]k_(?:live|test)_|sb_secret_)/i.test(trimmed)) return null;
    return trimmed;
  }

  function extractCorrelationRef(response, data, fallbackRequestId) {
    var headers = response && response.headers && typeof response.headers.get === "function"
      ? response.headers
      : null;
    var headerCandidates = headers
      ? [headers.get("x-request-id"), headers.get("x-correlation-id"), headers.get("cf-ray")]
      : [];
    for (var i = 0; i < headerCandidates.length; i++) {
      var cleanHeader = sanitizeCorrelationId(headerCandidates[i]);
      if (cleanHeader) return cleanHeader;
    }
    if (data && typeof data === "object" && !Array.isArray(data)) {
      var dataCandidates = [
        data.request_id,
        data.correlation_id,
        data.trace_id,
        data.error && typeof data.error === "object" ? data.error.request_id : null
      ];
      for (var j = 0; j < dataCandidates.length; j++) {
        var cleanData = sanitizeCorrelationId(dataCandidates[j]);
        if (cleanData) return cleanData;
      }
    }
    return sanitizeCorrelationId(fallbackRequestId);
  }

  function parseRetryAfterSeconds(rawHeader) {
    if (typeof rawHeader !== "string") return null;
    var trimmed = rawHeader.trim();
    if (!trimmed || trimmed.length > 64) return null;
    if (/^\d+$/.test(trimmed)) {
      var secs = Number(trimmed);
      if (Number.isSafeInteger(secs) && secs >= 1) return Math.min(secs, 3600);
      return null;
    }
    var parsedMs = Date.parse(trimmed);
    if (!Number.isFinite(parsedMs)) return null;
    var deltaSec = Math.ceil((parsedMs - Date.now()) / 1000);
    if (deltaSec < 1) return 1;
    return Math.min(deltaSec, 3600);
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
    var lastError = null;

    for (var attempt = 1; attempt <= maxAttempts; attempt++) {
      if (isCancelled()) return { outcome: "cancelled", attempts: attempt - 1 };
      onUpdate({ phase: "checking", attempt: attempt, maxAttempts: maxAttempts });
      var result = null;
      try {
        result = await checkFn(attempt);
      } catch (err) {
        if (err && (
          err.status === 401 ||
          err.status === 403 ||
          err.name === "AbortError" ||
          err.message === "invalid_token" ||
          err.message === "admin_required" ||
          err.message === "organization_access_denied" ||
          err.message === "forbidden" ||
          err.message === "contract_version_mismatch" ||
          err.message === "client_version_skew" ||
          err.message === "sign_in_required" ||
          err.message === "auth_account_changed"
        )) {
          throw err;
        }
        lastError = err;
        if (isCancelled()) return { outcome: "cancelled", attempts: attempt };
        if (attempt < maxAttempts) {
          var retryWaitMs = intervalMs;
          if (err && (err.status === 429 || err.message === "rate_limited") &&
              Number.isSafeInteger(err.retryAfterMs) && err.retryAfterMs > 0) {
            retryWaitMs = Math.max(intervalMs, Math.min(err.retryAfterMs, 15000));
          }
          onUpdate({ phase: "waiting", attempt: attempt, maxAttempts: maxAttempts, error: err, retryWaitMs: retryWaitMs });
          await sleepFn(retryWaitMs);
        }
        continue;
      }
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
    return { outcome: "pending_timeout", attempts: maxAttempts, lastError: lastError };
  }

  async function readBoundedResponseJson(res, maxBytes) {
    var limit = maxBytes || 16384;
    if (!res.body || typeof res.body.getReader !== "function") {
      return await res.json();
    }
    var reader = res.body.getReader();
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
    return JSON.parse(text);
  }

  function normalizeDiscoveryProfile(data, apiOrigin, authBaseUrl) {
    if (!data || typeof data !== "object" || Array.isArray(data)) return null;
    if (!isTrustedApiOrigin(apiOrigin) || !isTrustedAuthUrl(authBaseUrl)) return null;
    if (data.version !== undefined && data.version !== CONTRACT_VERSION) return null;
    if (data.schema !== undefined && data.schema !== "dactyl_api") return null;
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
      contractVersion: CONTRACT_VERSION,
      discoveredAt: nowSeconds(),
      apiOrigin: apiOrigin,
      onboardingPrefix: apiOrigin + CANONICAL_ONBOARDING_PREFIX,
      authBaseUrl: authBaseUrl,
      projectOrigin: data.project_origin,
      publishableKey: data.publishable_key,
      authProviders: providers,
      liveSaleEnabled: data.live_sale_enabled === true && data.billing_enabled === true,
      pricingVersion: typeof data.pricing_version === "string" && data.pricing_version ? data.pricing_version : null
    };
  }

  async function probeDiscoveryCandidate(fetchFn, candidate) {
    try {
      var res = await fetchFn(candidate.configUrl, {
        method: "GET",
        redirect: "error",
        credentials: "omit",
        cache: "no-store",
        signal: typeof AbortSignal !== "undefined" && AbortSignal.timeout ? AbortSignal.timeout(6000) : undefined
      });
      var contractHeader = res.headers && typeof res.headers.get === "function"
        ? res.headers.get("decapod-cloud-contract-version")
        : null;
      var corrId = extractCorrelationRef(res, null, null);
      if (!isSupportedApiContractVersion(contractHeader)) {
        if (res.body && typeof res.body.cancel === "function") await res.body.cancel().catch(function () {});
        return { status: "incompatible", profile: null, httpStatus: res.status, correlationId: corrId, retryAfterSec: null };
      }
      if (!res.ok) {
        var retryAfterSec = res.status === 429 || res.status === 503
          ? parseRetryAfterSeconds(res.headers && typeof res.headers.get === "function" ? res.headers.get("retry-after") : null)
          : null;
        if (res.body && typeof res.body.cancel === "function") await res.body.cancel().catch(function () {});
        return {
          status: res.status === 429 ? "rate_limited" : "unavailable",
          profile: null,
          httpStatus: res.status,
          correlationId: corrId,
          retryAfterSec: retryAfterSec
        };
      }
      var data;
      try {
        data = await readBoundedResponseJson(res, 16384);
      } catch (_) {
        return { status: "invalid", profile: null, httpStatus: res.status, correlationId: corrId, retryAfterSec: null };
      }
      corrId = extractCorrelationRef(res, data, null) || corrId;
      if (data && typeof data === "object" && !Array.isArray(data) &&
          data.version !== undefined && data.version !== CONTRACT_VERSION) {
        return { status: "incompatible", profile: null, httpStatus: res.status, correlationId: corrId, retryAfterSec: null };
      }
      var normalized = normalizeDiscoveryProfile(data, candidate.apiOrigin, candidate.authBaseUrl);
      if (!normalized) {
        return { status: "invalid", profile: null, httpStatus: res.status, correlationId: corrId, retryAfterSec: null };
      }
      return { status: "ok", profile: normalized, httpStatus: res.status, correlationId: corrId, retryAfterSec: null };
    } catch (_) {
      return { status: "unavailable", profile: null, httpStatus: 0, correlationId: null, retryAfterSec: null };
    }
  }

  async function discoverRuntimeStatus(fetchFn) {
    var fetcher = fetchFn || root.fetch;
    if (typeof fetcher !== "function") {
      return { status: "unavailable", profile: null, reason: "fetch_unavailable", correlationId: null, retryAfterSec: null };
    }
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
    var lastStatus = "unavailable";
    var lastCorrId = null;
    var lastRetryAfter = null;
    for (var i = 0; i < candidates.length; i++) {
      var probe = await probeDiscoveryCandidate(fetcher, candidates[i]);
      if (probe.correlationId) lastCorrId = probe.correlationId;
      if (probe.retryAfterSec !== null) lastRetryAfter = probe.retryAfterSec;
      if (probe.status === "incompatible") {
        // Never silently downgrade or switch authority when an origin reports an incompatible contract version.
        return {
          status: "incompatible",
          profile: null,
          reason: "contract_version_mismatch",
          correlationId: probe.correlationId,
          retryAfterSec: null
        };
      }
      if (probe.status === "invalid") {
        // Fail closed on malformed/untrusted 200 config responses instead of silently falling back.
        return {
          status: "invalid",
          profile: null,
          reason: "malformed_runtime_config",
          correlationId: probe.correlationId,
          retryAfterSec: null
        };
      }
      if (probe.status === "ok" && probe.profile) {
        var profile = probe.profile;
        if (profile.apiOrigin === CANONICAL_AUTH_ORIGIN) {
          try {
            var rootAuthCheck = await fetcher(CANONICAL_AUTH_ORIGIN + "/auth/providers", {
              method: "GET",
              redirect: "error",
              credentials: "omit",
              cache: "no-store",
              signal: typeof AbortSignal !== "undefined" && AbortSignal.timeout ? AbortSignal.timeout(4000) : undefined
            });
            var authHeader = rootAuthCheck.headers && typeof rootAuthCheck.headers.get === "function"
              ? rootAuthCheck.headers.get("decapod-cloud-contract-version")
              : null;
            if (!isSupportedApiContractVersion(authHeader)) {
              if (rootAuthCheck.body && typeof rootAuthCheck.body.cancel === "function") {
                await rootAuthCheck.body.cancel().catch(function () {});
              }
              return {
                status: "incompatible",
                profile: null,
                reason: "auth_providers_contract_mismatch",
                correlationId: extractCorrelationRef(rootAuthCheck, null, null),
                retryAfterSec: null
              };
            }
            if (!rootAuthCheck.ok) {
              if (rootAuthCheck.body && typeof rootAuthCheck.body.cancel === "function") {
                await rootAuthCheck.body.cancel().catch(function () {});
              }
              profile.authBaseUrl = CANONICAL_AUTH_ORIGIN + CANONICAL_ONBOARDING_PREFIX + "/auth";
              profile.authProvidersDegraded = true;
            } else {
              try {
                var authData = await readBoundedResponseJson(rootAuthCheck, 16384);
                if (!authData || typeof authData !== "object" || Array.isArray(authData)) {
                  profile.authBaseUrl = CANONICAL_AUTH_ORIGIN + CANONICAL_ONBOARDING_PREFIX + "/auth";
                  profile.authProvidersDegraded = true;
                } else {
                  if (authData.version !== undefined && authData.version !== CONTRACT_VERSION) {
                    return {
                      status: "incompatible",
                      profile: null,
                      reason: "auth_providers_payload_mismatch",
                      correlationId: extractCorrelationRef(rootAuthCheck, authData, null),
                      retryAfterSec: null
                    };
                  }
                  if (authData.auth_providers && typeof authData.auth_providers === "object") {
                    for (var p = 0; p < PROVIDERS.length; p++) {
                      var prov = PROVIDERS[p];
                      if (Object.prototype.hasOwnProperty.call(authData.auth_providers, prov)) {
                        profile.authProviders[prov] = Boolean(profile.authProviders[prov]) && Boolean(authData.auth_providers[prov]);
                      }
                    }
                  }
                }
              } catch (_) {
                profile.authBaseUrl = CANONICAL_AUTH_ORIGIN + CANONICAL_ONBOARDING_PREFIX + "/auth";
                profile.authProvidersDegraded = true;
              }
            }
          } catch (_) {
            profile.authBaseUrl = CANONICAL_AUTH_ORIGIN + CANONICAL_ONBOARDING_PREFIX + "/auth";
            profile.authProvidersDegraded = true;
          }
        }
        return {
          status: "ok",
          profile: profile,
          reason: null,
          correlationId: probe.correlationId,
          retryAfterSec: null
        };
      }
      lastStatus = probe.status;
    }
    return {
      status: lastStatus,
      profile: null,
      reason: lastStatus === "rate_limited" ? "rate_limited" : "discovery_unavailable",
      correlationId: lastCorrId,
      retryAfterSec: lastRetryAfter
    };
  }

  async function discoverRuntimeConfig(fetchFn) {
    var result = await discoverRuntimeStatus(fetchFn);
    return result && result.status === "ok" ? result.profile : null;
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
    ASSET_RELEASE: ASSET_RELEASE,
    CONTRACT_VERSION: CONTRACT_VERSION,
    SUPPORTED_API_CONTRACT_MAJORS: SUPPORTED_API_CONTRACT_MAJORS,
    SENSITIVE_QUERY_PARAMS: SENSITIVE_QUERY_PARAMS,
    CANONICAL_SITE_ORIGIN: CANONICAL_SITE_ORIGIN,
    CANONICAL_AUTH_ORIGIN: CANONICAL_AUTH_ORIGIN,
    FALLBACK_CLOUD_ORIGIN: FALLBACK_CLOUD_ORIGIN,
    CANONICAL_ONBOARDING_PREFIX: CANONICAL_ONBOARDING_PREFIX,
    UUID_PATTERN: UUID_PATTERN,
    CONTINUATION_PATTERN: CONTINUATION_PATTERN,
    PKCE_HASH_PATTERN: PKCE_HASH_PATTERN,
    isSupportedApiContractVersion: isSupportedApiContractVersion,
    readDocumentContractMeta: readDocumentContractMeta,
    checkPageCoherence: checkPageCoherence,
    scrubSensitiveLocation: scrubSensitiveLocation,
    createCoherenceChannel: createCoherenceChannel,
    parseOrgSlug: parseOrgSlug,
    parseSeatParam: parseSeatParam,
    parseBillingParam: parseBillingParam,
    parseContinuationParam: parseContinuationParam,
    parseAdminRoute: parseAdminRoute,
    isAllowedAdminPathname: isAllowedAdminPathname,
    buildAdminBrowserPath: buildAdminBrowserPath,
    listAdminOrganizations: listAdminOrganizations,
    resolveAdminOrganization: resolveAdminOrganization,
    sanitizeAdminReturnUrl: sanitizeAdminReturnUrl,
    parseSafeAdminReturnParam: parseSafeAdminReturnParam,
    buildAdminAuthAuthorizeUrl: buildAdminAuthAuthorizeUrl,
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
    extractCorrelationRef: extractCorrelationRef,
    parseRetryAfterSeconds: parseRetryAfterSeconds,
    createBoundedPoller: createBoundedPoller,
    normalizeDiscoveryProfile: normalizeDiscoveryProfile,
    discoverRuntimeStatus: discoverRuntimeStatus,
    discoverRuntimeConfig: discoverRuntimeConfig,
    randomSecret: randomSecret,
    sha256Base64Url: sha256Base64Url
  });

  var is404Page = typeof document !== "undefined" && document.body && (
    (typeof document.body.getAttribute === "function" && document.body.getAttribute("data-decapod-404") === "true") ||
    (document.body.dataset && (document.body.dataset["decapod-404"] === "true" || document.body.dataset.decapod404 === "true"))
  );
  if (is404Page && typeof location !== "undefined") {
    var deepParsed = parseAdminRoute(location.pathname || "/", "");
    if (deepParsed && deepParsed.status === "valid" && deepParsed.source === "path" && deepParsed.org) {
      location.replace("/admin/?org=" + encodeURIComponent(deepParsed.org));
    }
  }
})(typeof globalThis !== "undefined" ? globalThis : window);
