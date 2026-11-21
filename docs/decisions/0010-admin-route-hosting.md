# 0010: Organization-Scoped `/admin/<org>` Static Hosting & Optional Subpath Router

## Status
Accepted (Website #55)

## Context
The public website (`DecapodLabs/decapodlabs.github.io`) is hosted statically on GitHub Pages at `https://decapodlabs.ai` (`CNAME: decapodlabs.ai`). GitHub Pages serves static directory index files (`admin/index.html` at `/admin/` and `301` `/admin` → `/admin/`), and cannot dynamically rewrite arbitrary multi-path URLs such as `/admin/DecapodLabs` to `admin/index.html` with HTTP `200` on its own.

At the same time, customer organization administration must:
- Support canonical `/admin/<org>` URLs when routed through an edge adapter, plus GitHub Pages-native `/admin/?org=<org>` resolution without resorting to a `404.html` fallback-as-success hack.
- Fail closed before rendering or calling administrative APIs when unauthenticated, unaffiliated, or lacking a verified organization administrator grant.
- Resolve untrusted `<org>` locators exclusively via authenticated Propodus server APIs to an immutable canonical `cloud_org_id` UUID.
- Preserve existing public routes (`/`, `/pricing`, `/signup`, `/tecr.html`, `/proof.html`, `/assets/*`) without breaking static links or introducing a second identity provider.

## Decision

1. **GitHub Pages Static Application (`admin/index.html`, `admin/admin.js`, `admin/admin.css`, `cloud-flow.js`)**
   - `admin/index.html` is served directly with HTTP `200` at `https://decapodlabs.ai/admin/`.
   - `DecapodCloudFlow.parseAdminRoute` accepts both clean single-segment subpaths (`/admin/<org>`) and query-based locators (`/admin/?org=<org>`), rejecting traversal (`..`, `%2e`), encoded slashes (`%2f`, `%5c`), XSS characters, multi-segment subpaths (`/admin/<org>/extra`), and conflicting path-vs-query values.
   - When loaded from `/admin/` (unproxied GitHub Pages), `DecapodCloudFlow.buildAdminBrowserPath` preserves `/admin/?org=<org>` on organization selection and reload so browser refreshes always receive HTTP `200` directly from GitHub Pages. When loaded from `/admin/<org>` (subpath-routed edge), it preserves `/admin/<org>`.
   - PKCE S256 sign-in always targets `https://api.decapodlabs.ai/auth` (fallback `https://goyxpcmxetztjlrrcwew.supabase.co/functions/v1/decapod-onboarding/auth`) with strictly validated same-origin `return_to` (`https://decapodlabs.ai/admin/`), storing `requested_org` and `route_mode` in per-tab `sessionStorage` and immediately scrubbing callback query parameters and fragments via `history.replaceState`.

2. **Optional Edge Subpath Router Adapter (for `/admin/<org>` clean URLs)**
   - If clean `/admin/<org>` URLs are served directly on `https://decapodlabs.ai` in front of GitHub Pages (for example via a narrow Cloudflare Worker / proxy route mounted strictly on `decapodlabs.ai/admin/*`):
     - Match only single-segment valid locators (`^/admin/[A-Za-z0-9](?:[A-Za-z0-9._-]{0,98}[A-Za-z0-9])?/?$` or canonical UUIDs, rejecting `.` / `..` / multi-segment paths with HTTP `404`).
     - Rewrite the upstream origin request internally to `https://decapodlabs.ai/admin/index.html` while keeping the browser request URL at `/admin/<org>` and returning HTTP `200` with `Cache-Control: no-store`, `Referrer-Policy: no-referrer`, and `X-Robots-Tag: noindex, nofollow`.
     - Forward zero credentials, cookies, or service secrets; never mount on `/`, `/pricing*`, `/signup*`, `/assets/*`, or `/decapod/*`.
   - Managed Auth configuration requires `https://decapodlabs.ai/admin/`, `https://decapodlabs.ai/admin/*`, and `https://decapodlabs.ai/admin?*` in the Supabase redirect allowlist and `https://decapodlabs.ai` in onboarding CORS allowed origins.

3. **Zero-Seat Orthogonality & Public-Repo Confidentiality**
   - Admin UI displays and operates on organization settings, member directory, invitations, admin delegation, repository registry/seat assignments, resource limits, paid-overage spend caps, enrolled device inventory/revocation, recovery contacts, cross-org policy templates, and Stripe Billing Portal deep-links.
   - Admin UI never invokes repository governance-data query/batch endpoints and embeds zero database credentials, SQL statements, internal backend filenames/migration numbers, or Stripe secret/object IDs.

## Deployment & Rollback
- **Deploy (Static GitHub Pages)**: Merge to `main`; GitHub Pages publishes `admin/index.html`, `admin/admin.js`, `admin/admin.css`, and `cloud-flow.js` automatically. Verify `HTTP 200` on `https://decapodlabs.ai/admin/` and `/admin/?org=DecapodLabs`.
- **Deploy (Optional Subpath Router)**: Bind the narrow `/admin/*` worker/proxy route after verifying `admin/index.html` is live on GitHub Pages.
- **Rollback**: Remove or disable the `/admin/*` worker/proxy route (if enabled), or revert the static `admin/` commit on `main`. Disabling the edge subpath route immediately restores direct GitHub Pages serving on `/admin/` and `/admin/?org=<org>` with zero downtime and zero impact to `/`, `/pricing`, or `/signup`.
