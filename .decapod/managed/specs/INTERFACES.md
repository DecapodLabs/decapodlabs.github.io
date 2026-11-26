# Interfaces

## Public Pricing Handoff & Published Cloud Bundle Manifest (`pricing.js`, `cloud-app-manifest.json`)

- **`pricing.js` & `pricing/index.html`**: Emits `?repo=`, `billing` (`month`/`year`), and `seats` (`1..1000`) through `DecapodCloudFlow.buildSignupHandoffUrl`, preserves selection across `/auth` PKCE `return_to`, uses HTTPS custom-plan issue links (`github.com/DecapodLabs/decapod/issues/new`) instead of raw `mailto:` hrefs to preserve byte-identical CDN delivery, and links cleanly to live Cloud purchase initiation.
- **`cloud-app-manifest.json`**: Exposes SHA-256 digests (`files`), clean upstream source revision (`ac2124c0`, `source_clean: true`), and `asset_release: "20261126-brand"` verified offline by `tests/publication_provenance_test.ts`.
- **`admin/*` Presentation Surface (Propodus PRs #266 & #267)**: Preserves all existing DOM IDs (`#admin-auth-gate`, `#tab-btn-{overview,repositories,people,billing,usage,settings}`, `#tab-panel-*`, `#admin-avail-res-count`, `#admin-repos-list`, `#admin-billing-*`), wires Overview `#overview-qa-*` quick actions in `bindEvents()` with zero inline scripts, title-cases `formatProviderName("github")` to `"GitHub"`, and constrains `.admin-shell`/`.admin-workspace`/`.admin-panel`/`.ds-card` grid tracks with `minmax(0, 1fr)` and `min-width: 0` for `390px` horizontal table scrolling.

## Behavioral Privacy & Trust Contract Interface (`/trust/index.html`)

- **Version Metadata:** `<meta name="decapod-trust-contract-version" content="1.0.0">` and `<meta name="decapod-trust-effective-date" content="2026-11-24">` plus visible contract metadata, change-control guarantee, and changelog section.
- **Footer Navigation:** All primary site pages (`index.html`, `pricing.html`, `pricing/index.html`, `signup/index.html`, `clack/index.html`, `tecr.html`, `admin/index.html`, `trust/index.html`) include `<a href="/trust/index.html">Trust &amp; Privacy ↗</a>` inside `.footer-grid`.

index.html links to pricing.html from navigation and its highlighted hero entry. The dedicated document loads shared commercial Geist styling (`shared/commercial-ui.css`, `pricing.css`), self-hosted Geist fonts (`assets/fonts/*`), and `pricing.js` displaying live $50/mo and $552/yr Cloud rates alongside the compact Decapod Local free tier. Get started links for Local point to `https://decapodlabs.github.io/decapod/quickstart.html`.

## Inbound Contracts
Public GET requests return static documents/assets. Existing homepage fragment and media/install controls remain intact. A future purchase integration requires a separate reviewed change and service acceptance.

## Outbound Dependencies
Local onboarding uses the exact public quickstart URL. Documentation, GitHub and existing public font links remain ordinary navigation/assets. The pricing preview calls no Auth, checkout or payment API.

## Data Ownership
This repository owns public presentation and brand media. The Cloud API owns identity, organizations, stable repositories, assigned seats, subscriptions, and hosted Decapod state.

## Failure Semantics
An unavailable documentation link does not create an account, charge, grant, retry or backend fallback. Cloud remains visibly unavailable. Existing film/clipboard failure behavior is unchanged.

## Launch film and evidence interface

The source contract is decapod.agent-acceptance.v1, exported read-only by the Rust observer. Public sibling witnesses bind actual model requests, host execution, native check plans/observations/receipts and independent Git/GitHub identities by SHA-256. They do not import publication authority. Controls have decapod.post-run-controls.v1 with explicit controller ownership, real rejection codes and separate historical/current applicability.

The renderer requires an actually correlated autonomous arc and rejects missing controls or changed witness digests. Its decapod.launch-render.v1 output declares editorial scene text and source IDs alongside actual MP4/VTT hashes. Main and vertical durations are56 seconds; social is12. Native HTML video controls supply play/pause, mute, seek, fullscreen and optional captions, with playsinline, preload=none and no autoplay. Every narrative sentence is already visible for sound-off comprehension. No Cloud authorization call is introduced.

## Publication proof inspection links

proof.html links directly to the actual retained publication-time native receipt, unchanged canonical completion record and historical readback wrapper in the evidence directory. Readers can distinguish these from the standalone validation shown before publication in the film. The supplement exposes digest and subject verification without importing live admission or merge authority.

## Reproduction source link

The public evidence README links directly to the immutable fixture archive capture-tools directory. Those opt-in experiment adapters remain separately identified as portable derivatives; the website does not claim to host a second executable observer or silently substitute their bytes for the original run.

## Native publication evidence presentation

The offline presentation gate pins the independently observed T7sSlC native record digest and receipt hash. It compares the publication plan with the Rust-verified standalone plan and checks native suite/plan references, exact subject and publisher timing. Rust typed digests are not generic sorted-JSON digests; this website does not replace the kernel verifier. Two read-only adversarial controls reject an altered execution-output digest with recomputed wrapper hashes and false present authority. The unchanged original native record/receipt and movie assets remain retained. Presentation review is not native publication readiness; accepted verification-source policy still requires independent maintainer acceptance.

## Launch objective authorship

The controller selected the single Pi task under the human-authorized mission; direct human authorship of that prompt is not attested. The separately pinned retrospective objective-provenance disclosure preserves the original runtime/capture/manifest bytes. Rendered language says ONE ENGINEERING OBJECTIVE, and both presentation guards reject a substituted authorship claim. This correction requires rerendered media, source inventory review and fresh native admission; prior film/validation bytes cannot authorize it.

## Cross-document navigation contract

The static-source checker resolves every reference relative to its referring document. A root-relative /#kernel link from pricing.html targets index.html; #main targets pricing.html itself. Fragment existence is checked against the resolved target document, not the referring page. Four controls cover both valid cases and swapped-document false positives. Accepted pricing now conceals actual currency amounts and provides repository/contributor volume and annual-savings previews; all purchasing remains disabled.

## Explicit maintainer source-policy acceptance

The human maintainer authorized the exact025eee→7482eb verification-source transition in response to the concrete review request. GitHub commitcd2c05dfc70fe01fa374bd62110717fc4761b718 independently confirms only that one config line changed; concurrent accepted BYOA/on-demand invocation copy, Cloud limits/alerts and exact8-percent annual preview changes were preserved at its parent3e4b4ce4. The feature integrates the actual accepted target and retains its pricing bytes exactly. All eight verification-source definitions remain unchanged from reviewed759ba58b. This policy acceptance is separate from candidate proof; fresh full native validation and publication/readback remain mandatory. It is not a post-objective intervention in the archived Pi experiment.

## Stable media inputs and actual transfer-lineage recovery

The existing main-triggered media workflow re-encoded the original teaser at5fd0476f even though its creative source was unchanged. The exact accepted pre-launch teaser is restored. The workflow now compares actual before/head Git objects: copy-only changes retain all film bytes; changed witnesses regenerate only the launch review; shared renderer/font/mascot changes regenerate applicable outputs; unknown history and explicit manual runs regenerate for review. Existing committed evidence/media are always verified, and generated launch revisions remain temporary artifacts. Five actual shell/Git decision cases plus nine evidence controls pass (14 total). No new package or service is introduced.

New-task validation exposed missing commitment lineage for the actually imported launch task after its historical completion. Native federation search found its real decision and observation, but no transferred commitment. A present-time imported commitment was recorded through Decapod, explicitly labelled reconstruction with event/issue/accepted-commit sources; no node was backdated, no missing historic proof manufactured, and no validation outcome waived. The rejected report is retained.

Only the existing workflow and Python evidence-test definitions changed among the eight verification sources. The candidate inventory issha256:4e9f04d9ec00b3c9d93dbc1637340f04436f4a0acc53d7c522fe358c260b0499. Existing command/tool/argument/environment/timeout/coverage declarations are unchanged. Exact target-policy acceptance remains separate; prior7482 acceptance does not authorize this new source inventory. Native complete validation/publication and public teaser-byte readback remain required.

## Live Pi recording and case study

The proof renderer accepts reviewed decapod.pi-terminal-excerpts.v1 data with actual tool starts, returned results, Pi and Decapod versions, capture offsets, and exact published head and base. Desktop and mobile H.264 outputs share ten WebVTT cues. The case-study variants preserve 56/12/56-second timing and the original audio tracks. The homepage links to the case study, recorded evidence, and the independently matched PR.

## Native Pi terminal recording at /#proofs

The proof uses one 1440 × 924 H.264 recording with native playback, ten WebVTT descriptions and a captured poster. The viewer can use fullscreen on a phone. The capture metadata, frame ledger, evidence and linked PR expose the same independently observed head and accepted base. The offline presentation guard checks the native witness chain and exact reviewed media bytes. The media workflow verifies the live footage by digest and renders the case-study cuts from the approved manifest.

## High-contrast Pi recording and chapter links

The proof ledger binds visible terminal states to ordered byte offsets and the selected original-speed footage ranges. Three accessible chapter links point to failure, fresh validation and publication. The proof page and case study use the same observed fixture PR #7, with head a063de9040c458204eace1929d1e8536ad048a88 and accepted base ada3eb89c3707801a5b86265dccc899fdabe5e1c.

## Public `/pricing` and Authenticated `/signup` Route Interfaces (November 21, 2026)

- **Inbound Browser Routes**:
  - `GET /pricing` (`pricing/index.html`) and `GET /pricing.html` (`pricing.html`): Publicly readable plan comparison and team estimator accepting optional `?repo=<percent-encoded-owner%2Frepo>`. Rejects invalid/hostile `?repo=` or `?return_to=` values without DOM HTML injection.
  - `GET /signup` (`signup/index.html`): Authenticated Cloud purchasing sub-application (`noindex,nofollow`, `referrer=no-referrer`). Accepts optional `?repo=<owner%2Frepo>` preselection intent and OAuth PKCE callback parameters (`?code=...&login_nonce=...`), immediately scrubbing query and fragment state via `history.replaceState` and rejecting URL fragment tokens (`access_token`, `refresh_token`, `provider_token`).
- **Outbound Managed Auth & Edge Onboarding Interfaces**:
  - Runtime discovery probes public discovery configuration on `https://api.decapodlabs.ai` and validates public gateway configuration.
  - Unauthenticated sign-in initiates PKCE S256 via `https://api.decapodlabs.ai/auth` (or discovered `/functions/v1/decapod-onboarding/auth`) with strictly same-origin validated `return_to` (`/signup`).
  - Authenticated `/signup` communicates exclusively via HTTPS (`redirect: 'error'`, `credentials: 'omit'`) with `/auth/v1/token?grant_type=pkce`, `/auth/v1/user`, `/auth/v1/user/identities/authorize`, `/auth/v1/authorize`, and `/functions/v1/decapod-onboarding/{account-register,account-status,repository-enroll,billing-manage,billing-quote,billing-checkout}`, plus read-only `https://api.github.com/{user,user/orgs,user/repos}` when an in-memory GitHub provider token is present.
  - Stripe Checkout redirects are accepted only for `https:` URLs on `checkout.stripe.com`, `invoice.stripe.com`, or `billing.stripe.com`, strictly after server-side quote generation; client slider math never authorizes quotes or charges.
- **Failure & State Semantics**:
  - Public `/pricing` renders Cloud-first pricing controls ($50/mo, $552/yr) and initiates PKCE authentication toward `/signup`.
  - `/signup` fails closed on `billing_not_configured` / `live_sale_disabled`, `organization_already_enrolled`, `repository_already_enrolled`, `admin_approval_required`, `code_host_link_required`, `provider_link_stepup_required`, and bounded `pending_fulfillment` polling (12 checks max before manual retry), unlocking CLI-ready instructions only when server `account-status` returns `backend_authorized: true`.

## Release-Coherent Discovery, Deep-Link Scrubbing & Multi-Tab Coherence (#70, #54, #55, #56) — November 24, 2026

- **Static Asset & Contract Headers**: `pricing.html`, `pricing/index.html`, `signup/index.html`, and `admin/index.html` declare `decapod-flow-contract=1`, `decapod-asset-release=20261124-p3`, `referrer=no-referrer`, and `?v=20261124-p3` on `cloud-flow.js`, `pricing.js`, `signup/signup.js`, and `admin/admin.js`.
- **Discovery & Edge Contract Verification**: `DecapodCloudFlow.discoverRuntimeStatus` / `discoverRuntimeConfig` probes `/functions/v1/decapod-onboarding/config?include_auth_providers=true` and `/auth/providers` with `cache: "no-store"`, checks `decapod-cloud-contract-version` (`1.x`) and payload `version === 1` (`schema === "dactyl_api"`), conservatively intersects provider flags, distinguishes `unavailable` / `rate_limited` / `invalid` / `incompatible`, and refuses untrusted `apiOrigin`, `authBaseUrl`, or `project_origin` without silent fallback on malformed `200` configs.
- **Cross-Tab Coherence Channel & Idempotent Request Contracts**: `DecapodCloudFlow.createCoherenceChannel` supports `tab_hello`, `release_skew`, `auth_invalidated`, `intent_sync`, and checkout coordination events (`checkout_started`, `checkout_returned`, `fulfillment_status`) with zero tokens/PII. `signup/signup.js` passes stable `request_id` values on `repository-enroll`, `billing-quote`, and `billing-checkout` (retaining `checkoutRequestId` across `429`/`5xx`/lost-ack retries); `admin/admin.js` passes `expected_revision` on `org-admins`, `org-recovery`, `resource-limits`, and `billing-overage-policy`, re-fetches authoritative state on `409` conflicts, and separates `5xx`/`429` verification outages from `403` admin revocations.
- **Publication & Trust Receipt Interfaces (`tests/publication_provenance_test.ts`, `tests/trust_privacy_contract_test.ts`)**: Verify SHA-256 manifest fidelity for release `20261126-geist`, absence of pre-launch placeholders or internal operational files, strict no-tracker privacy posture, and valid public footer trust links.

## Authenticated `/admin/<org>` Organization Admin Route Interfaces (November 21, 2026)

- **Inbound Browser Routes**:
  - `GET /admin/` (`admin/index.html`, supporting `/admin/?org=<org>` natively on GitHub Pages and `/admin/<org>` via clean subpath routing): Authenticated organization-scoped Admin UI (`noindex,nofollow`, `referrer=no-referrer`). Accepts optional OAuth PKCE callback parameters (`?code=...&login_nonce=...`), immediately scrubbing query and fragment state via `history.replaceState` and failing closed on malformed routes or fragment tokens.
- **Outbound Managed Auth & Admin Edge Interfaces**:
  - Reuses `DecapodCloudFlow.discoverRuntimeConfig` (`https://api.decapodlabs.ai`) and initiates PKCE S256 sign-in via `buildAdminAuthAuthorizeUrl` with same-origin validated `return_to` (`/admin/`).
  - After PKCE authentication and server-side `account-register` verification for the resolved immutable `cloud_org_id`, communicates over HTTPS (`redirect: 'error'`, `credentials: 'omit'`) with `/functions/v1/decapod-onboarding/{account-register,account-status,repository-enroll,billing-manage,billing-portal,billing-overage-policy,resource-limits,device-keys,device-revoke,org-admins,org-recovery,policy-templates}`.
  - Never calls repository governance-data query/batch endpoints (`/decapod/<org>/<repo>/{query,batch}`, `cloud-query`, `cloud-batch`).
- **Failure & Isolation Semantics**:
  - Unaffiliated, non-admin, ambiguous, and malformed `<org>` routes render no organization data and dispatch zero org-scoped API requests; switching organizations increments `renderGeneration`, wipes prior-org DOM state before loading, and drops stale out-of-order responses; `401` clears session state to the auth gate and `403 admin_required` immediately closes the active admin workspace. Stripe Billing Portal redirects are accepted only on HTTPS `billing.stripe.com`, `checkout.stripe.com`, or `invoice.stripe.com`.

<!-- decapod:capability-overlay:public-api:start -->

Generated capability obligations: `public-api` is declared for this project. These are decisions and proof requirements, not claims of implemented behavior. Resolve each against project source and tests; record unsupported or non-applicable mechanisms explicitly.

## Public API Capability Overlay

### API Contract Requirements
- All public endpoints MUST define explicit request/response schemas
- Versioning strategy MUST be documented (URL path or header-based)
- All public endpoints MUST implement idempotency for mutating operations
- Rate limiting and pagination MUST be implemented for list endpoints

### Compatibility Guarantees
- Backward-compatible changes ONLY within a version
- Breaking changes require new version (v1, v2, etc.)
- Deprecation and removal policy MUST be selected for this project and proven against its consumers

### Security Requirements
- All public endpoints MUST implement authentication
- Abuse-control enforcement point MUST be a documented project decision
- Input validation MUST reject malformed requests with typed errors
<!-- decapod:capability-overlay:public-api:end -->

<!-- decapod:codebase-contract:start -->

## Codebase Contract Snapshot

- CLI/RPC/protocol surfaces (0): none detected
- Manifest authority path: `.decapod/managed/.manifest.json`
<!-- decapod:codebase-contract:end -->

<!-- decapod:codebase-attestation:start -->

## Codebase Attestation

- Repository signal fingerprint: `ff9d13a3ca79a802b6609101652cc6d77683dcc92a5d72786cf6d9f9727817d1`
- Significant implementation surfaces: `.github/` (1 files), `README.md/` (1 files), `admin/` (1 files), `cloud-flow.js/` (1 files), `evidence/` (4 files), `main.js/` (1 files), `pricing.js/` (1 files), `scripts/` (7 files), `signup/` (1 files), `tests/` (3 files)
- Refreshed from the current codebase by `decapod rpc --op specs.refresh`
<!-- decapod:codebase-attestation:end -->

## Clack download

The canonical Clack page is `/clack/`. The shared navigation links to the equivalent static index at `/clack/index.html` so the existing source verifier can check the target file. Download for Mac links to `https://github.com/DecapodLabs/decapodlabs.github.io/releases/latest/download/Clack-macOS-arm64.dmg`. The SHA-256 link appends `.sha256` to that URL. Both are direct public links usable without JavaScript or a GitHub login. Latest release points to that repository’s `/releases/latest` page for the version and installer details. The public repository’s latest release must designate a stable Clack mirror tagged `clack-vX.Y.Z` with both fixed-name assets. The landing page lists the architecture and minimum macOS version.

The hero pairs “code with the crabs” with the repository’s crab mascot, then displays “a new way to work and play” ahead of Download for Mac. The mascot is decorative and has empty alt text so assistive technology reads the tagline without repeating the illustration. The hero’s trailer link jumps to `#clack-trailer`, whose `<video>` element serves `/clack/clack-gameplay-trailer.mp4?v=31`, `/clack/clack-gameplay-poster.webp?v=31`, and opt-in English captions at `/clack/gameplay-trailer.vtt?v=31` matching the hero’s-journey timeline and closing “code with the crabs” card. The Agents Mode example lives at `#agents`. That section provides the example request and its review flow as text and links the screenshot to its full-size image. Clack and Rework mark their own header links with `aria-current="page"`. On the homepage, `#showcase`, `#features`, and `#architecture` select their corresponding header link with `aria-current="location"`. Loading the bare homepage or a different fragment leaves those links unselected. On `/clack/`, the header home link displays the transparent `assets/logo-c.png` and the footer home link displays `assets/logo-b.png`. Rework’s GitHub header link uses the shared pointer-hover shadow. The Install Clack section links to the Labs homepage with an inline “Powered by” label and `assets/logo-c.png`. The footer retains the shared links and uses Clack’s dark ink background, muted copyright text, and seaglass hover and keyboard-focus styles.
