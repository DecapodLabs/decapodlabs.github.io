# Browser Asset Release Coherence & API Skew Compatibility Matrix

**Scope:** Public static web applications (`pricing.html`, `pricing/index.html`, `signup/index.html`, `admin/index.html`, `cloud-flow.js`, `pricing.js`, `signup/signup.js`, `admin/admin.js`) hosted on GitHub Pages (`https://decapodlabs.ai`, `https://decapodlabs.github.io`) with `$0/mo` Cloudflare edge routing (`https://api.decapodlabs.ai`, `https://decapod-cloud-admin.pages.dev/`) and Supabase Edge runtime (`https://goyxpcmxetztjlrrcwew.supabase.co`).

**Normative Invariant:** Browser assets never grant purchase, enrollment, or organization administration authority. Under any CDN cache skew, partial deployment, rollback, or API contract mismatch, clients must either progress validly under a mutually compatible `CONTRACT_VERSION` or **fail closed** (zero authenticated/quote/checkout/admin calls, disabled CTAs, protected panels hidden, URL scrubbed).

---

## 1. Static Asset Versioning & Cache Policy

| Surface | Hosting | Observed Cache-Control | Coherence Mechanism |
| --- | --- | --- | --- |
| `/pricing/`, `/pricing.html`, `/signup/`, `/admin/` | GitHub Pages | `max-age=600` (10 min CDN/browser) | `<meta name="decapod-flow-contract" content="1">`, `<meta name="decapod-asset-release" content="20261124-p1">`, `<meta name="referrer" content="no-referrer">`, unified `?v=20261124-p1` script URLs |
| `/cloud-flow.js`, `/pricing.js`, `/signup/signup.js`, `/admin/admin.js` | GitHub Pages | `max-age=600` | Unified cache-busting query string `?v=20261124-p1` across all entrypoints; `DecapodCloudFlow.CONTRACT_VERSION = 1` and `DecapodCloudFlow.ASSET_RELEASE` verified before initialization |
| `https://decapod-cloud-admin.pages.dev/` | Cloudflare Pages (`$0/mo`) | `no-store` | Self-contained HTML/JS/CSS with strict SHA-256 CSP, `referrer-policy: no-referrer`, `x-content-type-options: nosniff`, `connect-src https://goyxpcmxetztjlrrcwew.supabase.co` |
| `https://api.decapodlabs.ai/auth/providers` | Cloudflare Worker + Supabase Edge | `no-store` (`cf-cache-status: DYNAMIC`) | `decapod-cloud-contract-version: 1.0`, `content-security-policy: default-src 'none'; frame-ancestors 'none'`, `referrer-policy: no-referrer`, `x-content-type-options: nosniff` |
| `https://api.decapodlabs.ai/functions/v1/decapod-onboarding/config?include_auth_providers=true` | Cloudflare Worker + Supabase Edge | `no-store` (`cf-cache-status: DYNAMIC`) | `decapod-cloud-contract-version: 1.0`, JSON `{ version: 1, schema: "dactyl_api", project_origin, publishable_key, auth_providers }` |
| Authenticated, quote, checkout, entitlement, and admin API calls | Propodus / Supabase Edge | `no-store` (server) + `cache: "no-store"` (client `fetch`) | Client enforces `cache: "no-store"`, `credentials: "omit"`, `redirect: "error"`, and rejects any response with unsupported `decapod-cloud-contract-version` or payload `version !== 1` |

**Service Worker & Persistent Cache Policy:**
- No Service Worker (`navigator.serviceWorker`), no `CacheStorage` (`caches`), and no `localStorage` are registered or written by any page.
- Transient PKCE `flow` state, short-lived `session` access token (`contract_version: 1`), and unverified `decapod:pending-repo-intent` live strictly in per-tab `sessionStorage`.
- Cross-tab skew detection and sign-out propagation use ephemeral in-memory `BroadcastChannel("decapod-cloud-coherence")` with zero disk persistence and zero user data/tokens/PII in messages.

---

## 2. Skew & Compatibility Matrix

| Scenario | Cause | Client Behavior | Authority & Safety Outcome |
| --- | --- | --- | --- |
| **Old HTML + New JS** (compatible DOM, no `<meta name="decapod-flow-contract">` or `content="1"`) | GitHub Pages 600s HTML cache hits CDN while new JS loads | `checkPageCoherence()` verifies all required security DOM anchors (`#auth-gate`, `#step-state`, `#step-checkout`, `#checkout-btn`, `#admin-auth-gate`, `#admin-denied-panel`, `#admin-workspace`, etc.) exist and `CONTRACT_VERSION === 1`. | **Valid progression**; `UNDER WRAPS` and fail-closed gates remain intact. |
| **Old HTML + New JS** (missing DOM anchor or retired contract `content="0"`) | Skewed ancient HTML missing required gate elements | `checkPageCoherence()` returns `{ ok: false }`; `init()` scrubs URL, disables auth/checkout buttons, hides protected panels, makes zero API calls, and prompts reload. | **Safe fail-closed refusal**. |
| **New HTML + Old JS** (`cloud-flow.js` missing `CONTRACT_VERSION`, missing required methods, or `CONTRACT_VERSION !== 1`) | Partial CDN purge or rollback of `cloud-flow.js` while HTML is newer | Page scripts run self-contained `hasCompatibleFlow(flow)` before `syncAuthGateUi()`; incompatible `flow` sets `skewBlocked = true`, scrubs URL, locks CTAs/panels, makes zero API calls. | **Safe fail-closed refusal**. |
| **New HTML (`content="2"`) + v1 JS** | Future breaking HTML release cached ahead of JS or partial rollback | `readDocumentContractMeta()` rejects `content !== "1"`; `init()` fails closed with zero API calls. | **Safe fail-closed refusal**. |
| **Old Page JS + New Breaking `cloud-flow.js` (`CONTRACT_VERSION: 2`)** | Future breaking `cloud-flow.js` deployed while old page JS cached | Strict equality check `candidate.CONTRACT_VERSION === 1` rejects `2`; page script fails closed with zero API calls. | **Safe fail-closed refusal**. |
| **Stale Cached Discovery vs `/auth/providers`** | Stale edge `/config` enables a provider that `/auth/providers` has disabled | `discoverRuntimeConfig` probes both with `cache: "no-store"`. When `/auth/providers` returns valid JSON, enabled providers are intersected conservatively (`config && providers`); if `/auth/providers` is non-2xx or corrupt, auth falls back to `/functions/v1/decapod-onboarding/auth` on `api.decapodlabs.ai`. | **Conservative fail-closed intersection**; never enables a disabled provider. |
| **API Contract Skew (`version: 2` or `decapod-cloud-contract-version: 2.0`)** | Backend upgrades to breaking v2 while browser runs v1 assets | `probeDiscoveryCandidate` returns `{ status: "incompatible" }`, preventing silent fallback to `FALLBACK_CLOUD_ORIGIN`. Mid-session `apiRequest` clears session, sets `skewBlocked = true`, and throws `contract_version_mismatch`. | **Safe fail-closed refusal**; never silently switches API authority. |
| **Primary Subdomain Outage (`api.decapodlabs.ai` 403/5xx/network error)** | Cloudflare worker/edge DNS outage without contract mismatch | `discoverRuntimeConfig` falls back to pinned `https://goyxpcmxetztjlrrcwew.supabase.co` only when primary did not return an incompatible contract version. | **Bounded resilience** within trusted origin pin set. |
| **Multi-Tab Version Skew** | Tab A opened on v1; Tab B loads breaking v2 and broadcasts `tab_hello` | `createCoherenceChannel` detects `msg.contractVersion !== CONTRACT_VERSION`, invokes `onSkew()`, locks checkout/admin UI, invalidates Tab A session state, and prompts reload. | **Safe fail-closed refusal** across open tabs. |
| **Multi-Tab Sign-Out / 401 Revocation** | User signs out or receives `401 invalid_token` in Tab A while Tab B is open | Tab A clears `sessionStorage` + in-memory caches (`githubReposCache`, `quoteRequestId`, `enrollRequestId`, form inputs) and broadcasts `auth_invalidated` (projectOrigin only, zero tokens/PII). Tab B locks protected panels immediately. | **Immediate cross-tab deauthorization**. |
| **Deep Links (`?repo=...`, `/admin/<org>`, `?invitation_id=...#invitation_secret=...`, hostile `#access_token=...`)** | User opens deep link or crafted callback URL | Valid `?repo=` is stored in `sessionStorage["decapod:pending-repo-intent"]` and immediately scrubbed from `location` via `history.replaceState`. Hostile fragment tokens (`access_token`, `refresh_token`, `provider_token`) or bad `return_to` are rejected, scrubbed immediately, and never populate `session` or URL history. | **Zero tokens/secrets/PII in URL or persistent cache**. |

---

## 3. Trusted Origin & Redirect Pins

- **Site origins (`isAllowedSiteOrigin`)**: `https://decapodlabs.ai`, `https://decapodlabs.github.io`
- **API / Auth origins (`isTrustedApiOrigin`, `isTrustedAuthUrl`)**:
  - `https://api.decapodlabs.ai` (`/auth` and `/functions/v1/decapod-onboarding/auth`)
  - `https://goyxpcmxetztjlrrcwew.supabase.co` (`/functions/v1/decapod-onboarding/auth`)
  - Note: `normalizeDiscoveryProfile` validates both `data.project_origin` AND caller-supplied `apiOrigin` / `authBaseUrl`; `initialProfile` injection is validated by `isValidProfile` in `signup.js` and `admin.js`.
- **Stripe Checkout / Billing Portal hosts (`isAllowedCheckoutUrl`)**:
  - `checkout.stripe.com`, `invoice.stripe.com`, `billing.stripe.com` (`https:` only, no credentials).
- **Standalone Pages Admin Console**:
  - `https://decapod-cloud-admin.pages.dev/` (independent Cloudflare Pages static app with `Cache-Control: no-store` and hash-pinned CSP).

---

## 4. Deployment & Rollback Procedure (`$0/mo` Infrastructure)

1. **Coherent Release Bump:** Whenever changing `cloud-flow.js`, `pricing.js`, `signup/signup.js`, or `admin/admin.js`, update `ASSET_RELEASE` in `cloud-flow.js` and the `?v=<release>` query string + `<meta name="decapod-asset-release">` across all four HTML entrypoints (`pricing.html`, `pricing/index.html`, `signup/index.html`, `admin/index.html`) in the same commit.
2. **Breaking Contract Bump:** Only increment `CONTRACT_VERSION` (and `decapod-flow-contract` meta) when wire payloads or required `DecapodCloudFlow` signatures break backward compatibility. Old clients automatically refuse v2 HTML/APIs without silent authority downgrade.
3. **Rollback:** Reverting the commit on `main` restores GitHub Pages within the 600s CDN window. Because `?v=` query strings change per release, browsers fetching rolled-back HTML immediately request the rolled-back JS without stale cache collisions; any tab caught mid-transition fails closed via `checkPageCoherence` / `hasCompatibleFlow`.
