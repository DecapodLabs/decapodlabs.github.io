# Degraded Availability, SLO Thresholds & Read-Only Synthetic Readiness

**Scope:** Public static web (`https://decapodlabs.ai`, `https://decapodlabs.github.io`), Cloudflare/Supabase Auth & Onboarding API (`https://api.decapodlabs.ai`, fallback `https://goyxpcmxetztjlrrcwew.supabase.co`), Cloudflare Pages Admin (`https://decapod-cloud-admin.pages.dev/`), and Billing/Entitlement fulfillment state (`cloud-flow.js`, `pricing.js`, `signup/signup.js`, `admin/admin.js`, `tests/synthetic_readiness.ts`).

**Cost & Credential Invariant:** All synthetic readiness checks use strictly read-only HTTP `GET` requests (`credentials: "omit"`, `cache: "no-store"`, zero Stripe checkout/billing mutations, zero stored credentials, `$0/mo` infrastructure only).

---

## 1. Operational Planes & Reviewed SLO / Latency / Alerting Thresholds

| Plane | Endpoints / Surfaces | Request Timeout | Latency Warn / Crit | Availability & Header Contract |
| --- | --- | --- | --- | --- |
| **1. GitHub Pages Static Web** | `GET https://decapodlabs.ai/`, `/pricing/`, `/signup/`, `/admin/` | `8000 ms` | `> 1500 ms` warn / `> 5000 ms` crit | `HTTP 200`, `decapod-flow-contract=1`, coherent `decapod-asset-release`, `no-referrer`, `noindex,nofollow` on `/signup/` & `/admin/`, `UNDER WRAPS` preserved when live sale off |
| **2. Auth & Onboarding Discovery / API** | `GET https://api.decapodlabs.ai/auth/providers`, `GET .../functions/v1/decapod-onboarding/config?include_auth_providers=true`; authenticated calls `POST/GET` | Discovery: `6000 ms` (`/config`), `4000 ms` (`/auth/providers`); Auth/Edge API: `15000 ms` | `> 1500 ms` warn / `> 4000 ms` crit | `HTTP 200`, `Cache-Control: no-store`, `decapod-cloud-contract-version: 1.x`, `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`, `project_origin` pinned to `https://goyxpcmxetztjlrrcwew.supabase.co` |
| **3. Cloudflare Pages Admin** | `GET https://decapod-cloud-admin.pages.dev/` | `6000 ms` | `> 1500 ms` warn / `> 4000 ms` crit | `HTTP 200`, `Cache-Control: no-store`, `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`, CSP includes `frame-ancestors 'none'` & `connect-src https://goyxpcmxetztjlrrcwew.supabase.co` |
| **4. Billing & Entitlement Health** | Read-only posture from `/config` (`live_sale_enabled`, `billing_enabled`, `pricing_version`); runtime `billing-quote`, `billing-checkout`, `account-status` | API call `15000 ms`; Fulfillment poller `12` attempts × `2500 ms` (`~30 s` nominal, `429 Retry-After` capped at `15000 ms`/wait) | Poller `> 30 s` -> `pending_timeout` | Never trusts redirect params; `backend_authorized === true && status === "active"` required; zero repeat-payment nudges on lost ack or timeout |

---

## 2. Propodus & Dactyl Contract Coordination

Client retry, timeout, and correlation behavior aligns with Propodus (`docs/propodus-adapter-contract.md`, `docs/supabase-rpc-v1.md`) and Dactyl transport semantics:

- **`429 rate_limited`:** Server supplies `Retry-After`. Browser callers (`cloud-flow.js`, `signup.js`, `admin.js`) honor `Retry-After` (bounded in `createBoundedPoller` up to `15000 ms`), surface wait guidance + safe `correlationId`, and **never** rotate `checkoutRequestId` / `quoteRequestId` / `enrollRequestId`.
- **`503 storage_unavailable` / `service_unavailable` & `504 request_timeout` (PostgreSQL `57014` statement timeout / `25006` read-only):** Browser callers keep idempotency keys stable, lock or disable unverified actions, surface `Support ref: <correlationId>`, and do not claim purchase success or suggest duplicate payment.
- **`401 invalid_token`:** Immediate session invalidation (`sessionStorage` cleared, `auth_invalidated` broadcast across tabs, protected panels hidden).
- **`403 admin_required` / `forbidden` (PostgreSQL `42501`):** Immediate fail-closed stop (`createBoundedPoller` aborts polling immediately; `admin.js` revokes workspace view; `signup.js` locks checkout/ready views).

---

## 3. Degraded-State Triage Separation

| Affected Plane | Observed Symptoms | Client Fail-Closed Behavior | Triage & Support Correlation |
| --- | --- | --- | --- |
| **GitHub Pages Static Web** | `5xx`/DNS failure on `decapodlabs.ai`, or HTML/JS `ASSET_RELEASE` / `CONTRACT_VERSION` mismatch | `checkPageCoherence` / `hasCompatibleFlow` sets `skewBlocked=true`, scrubs URL, disables auth & checkout CTAs, makes zero API calls | Check GitHub Pages status & `tests/synthetic_readiness.ts`; wait for 600s CDN propagation or revert commit |
| **Auth / Discovery (`api.decapodlabs.ai`)** | `403` (`1014` DNS error), `5xx`, network error, or `/auth/providers` degraded | `discoverRuntimeStatus` distinguishes `unavailable` / `rate_limited` / `invalid` / `incompatible`. Falls back to `goyxpcmxetztjlrrcwew.supabase.co` **only** on `unavailable`/`rate_limited` (never on `200` `invalid` malformed config or `2.0` contract skew). `/auth/providers` outage falls back to `/functions/v1/decapod-onboarding/auth`. | Inspect `api_auth_discovery` plane in `tests/synthetic_readiness.ts`; verify Cloudflare Worker & Supabase Edge health using `x-request-id` / `cf-ray` |
| **Provider Outage (GitHub / Google)** | `/auth/providers` disables provider or `api.github.com` returns `429`/`5xx` | Disabled provider button stays locked (`auth-provider-note` updated); `api.github.com` outage shows non-blocking hint in `#org-repo-hint` while allowing manual `owner/repo` input (still verified server-side) | Verify `/auth/providers` JSON flags and GitHub API rate-limit status |
| **Cloudflare Pages Admin (`decapod-cloud-admin.pages.dev`)** | Non-200 or missing `no-store` / CSP / `nosniff` headers | Standalone Admin refuses unsafe framing (`frame-ancestors 'none'`) and stays isolated from `decapodlabs.ai` | Check `cloudflare_pages_admin` plane in `tests/synthetic_readiness.ts` |
| **Billing / Entitlement Lag or Lost Checkout Ack** | `billing-checkout` `5xx`/timeout, `?checkout=returned` without settlement, or `429` during polling | `checkoutRequestId` and `checkout_pending` remain preserved in `sessionStorage`; `runPendingFulfillmentPoll` bounds to 12 checks and transitions to `pending_timeout` (`backend_authorized=false`) with `Support ref: <order_id/request_id/x-request-id>` and explicit warning **not** to submit duplicate payment | Correlate `Support ref` (`request_id`, `order_id`, or `x-request-id`) in Propodus/Stripe webhook ledger; never tell customer to pay again |

---

## 4. Safe Correlation Reference Policy

`DecapodCloudFlow.extractCorrelationRef(response, data, fallbackRequestId)` accepts only opaque identifiers matching `/^[A-Za-z0-9_.:-]{4,128}$/` from `x-request-id`, `x-correlation-id`, `cf-ray`, JSON `request_id` / `correlation_id` / `trace_id`, or client-generated `request_id` UUIDs. JWTs (3-segment tokens), API keys (`ghp_`, `gho_`, `sk_live_`, `sb_secret_`), and PII are explicitly rejected so support references shown in UI or synthetic logs never leak secrets.

---

## 5. Running the Read-Only Synthetic Probe

```sh
deno run --no-remote --no-npm \
  --allow-net=decapodlabs.ai,api.decapodlabs.ai,decapod-cloud-admin.pages.dev,goyxpcmxetztjlrrcwew.supabase.co \
  tests/synthetic_readiness.ts
```

Exit status is `0` when all four planes report `"healthy"` or `"degraded"` (within hard failure thresholds), and non-zero if any plane reports `"unavailable"` or violates security/contract invariants.
