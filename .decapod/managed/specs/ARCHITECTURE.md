# Architecture

GitHub Pages serves a static homepage and a dedicated pricing.html preview. Existing styles.css supplies branding and responsive layout; main.js retains film controls and install-selection/copy behavior on the homepage. pricing.js updates illustrative assignment, discount and resource-capacity controls locally; no application server or payment authority is introduced. offerings.html redirects to pricing.html. Website-owned media generation extends the existing renderer and main/manual workflow with verified real-agent launch assets.

## Direction
Keep this site static. Propodus owns business logic, Auth, permissions, billing and hosted database authority.

## Current Facts
The homepage has only a navigation link and highlighted Local + Cloud entry added to its accepted content. The standalone offering page uses existing wordmark/assets/fonts and shared CSS. It exposes no checkout link or price. Local's Get started links point at the exact published quickstart; Cloud's button is native-disabled.

## Topology
```text
Visitor -> GitHub Pages -> homepage -> pricing.html -> Decapod quickstart.
Cloud is a Coming soon preview with no outbound purchase transition.
```

## Execution Path
The browser renders semantic HTML and shared CSS. Local navigation opens documentation. The disabled Cloud button has no handler, form or target. Existing homepage film/install behavior is unchanged.

## Concurrency and Runtime Model
Visitors have independent static documents. There is no shared account state, queue, worker, database transaction or browser payment state here.

## Deployment Topology
Existing branch-based GitHub Pages publication serves accepted main. Media rendering is a distinct main/manual workflow, not proof of hosted cloud readiness. No new host or domain is purchased.

## Data and Contracts
Git owns website content and media. Propodus owns customer accounts, assignments, exact quotes, payment reconciliation and hosted Decapod records. The preview grants no access and creates no subscription.

## Delivery Plan
Rebase PR4 onto current site main, preserve other design changes, qualify the final informational preview through Decapod, publish it, and verify actual served content. Open the documentation entry as a coordinated PR in Decapod.

## Risks and Mitigations
A preview could look purchasable: use visible Coming soon labels, an actually disabled button and explicit planned-benefit wording. Pricing is withheld. Do not imply a live sale, complete local/cloud parity, uptime guarantee or other unsupported commitment.

## Evidence-backed media architecture

Rust Decapod owns observation and authority separation. This repository owns the sanitized immutable event data, editorial mapping, Python/FFmpeg rendering and static presentation. scripts/render-launch.py imports the existing showcase renderer for mascot, fonts and motion helpers; assets/fonts pins licensed Lato source and digests. There is no model inference or kernel admission inside the renderer.

The render manifest binds actual movie/caption digests, event identifiers, timing and separately labelled editorial text. scripts/verify-launch.py decodes actual H264/AAC files and verifies dimensions, duration, audio, captions, fast-start containers and poster. The accepted offline Deno static-source command includes scripts/check-launch.ts, rejecting changed source witnesses, mismatched observed facts and media bytes without invoking inference, network, Python or FFmpeg.

index.html retains its teaser and adds a native controlled video with responsive source selection, poster, optional caption track and evidence links. proof.html provides inspectable scope and limitations. The existing main/manual media workflow regenerates the film and verifies encoded media. Existing initialized governance is preserved; the historical bootstrap installer runs only when project configuration is absent.

## Current accepted presentation integration

Accepted mainecd713c4 supplies the persistent responsive header, homepage Constitution copy, corrected footer logo and pricing preview with concealed dollar prices, repository/contributor controls and annual savings. Those accepted pricing and logo bytes are preserved exactly. The evidence-backed film is an additive homepage section beside the retained original teaser; its styles are scoped to launch/proof presentation. No application backend or Cloud enrollment authority is introduced.

## Explicit maintainer source-policy acceptance

The human maintainer authorized the exact025eee→7482eb verification-source transition in response to the concrete review request. GitHub commitcd2c05dfc70fe01fa374bd62110717fc4761b718 independently confirms only that one config line changed; concurrent accepted BYOA/on-demand invocation copy, Cloud limits/alerts and exact8-percent annual preview changes were preserved at its parent3e4b4ce4. The feature integrates the actual accepted target and retains its pricing bytes exactly. All eight verification-source definitions remain unchanged from reviewed759ba58b. This policy acceptance is separate from candidate proof; fresh full native validation and publication/readback remain mandatory. It is not a post-objective intervention in the archived Pi experiment.

## Stable media inputs and actual transfer-lineage recovery

The existing main-triggered media workflow re-encoded the original teaser at5fd0476f even though its creative source was unchanged. The exact accepted pre-launch teaser is restored. The workflow now compares actual before/head Git objects: copy-only changes retain all film bytes; changed witnesses regenerate only the launch review; shared renderer/font/mascot changes regenerate applicable outputs; unknown history and explicit manual runs regenerate for review. Existing committed evidence/media are always verified, and generated launch revisions remain temporary artifacts. Five actual shell/Git decision cases plus nine evidence controls pass (14 total). No new package or service is introduced.

New-task validation exposed missing commitment lineage for the actually imported launch task after its historical completion. Native federation search found its real decision and observation, but no transferred commitment. A present-time imported commitment was recorded through Decapod, explicitly labelled reconstruction with event/issue/accepted-commit sources; no node was backdated, no missing historic proof manufactured, and no validation outcome waived. The rejected report is retained.

Only the existing workflow and Python evidence-test definitions changed among the eight verification sources. The candidate inventory issha256:4e9f04d9ec00b3c9d93dbc1637340f04436f4a0acc53d7c522fe358c260b0499. Existing command/tool/argument/environment/timeout/coverage declarations are unchanged. Exact target-policy acceptance remains separate; prior7482 acceptance does not authorize this new source inventory. Native complete validation/publication and public teaser-byte readback remain required.

## Live Pi recording and case study

The homepage proof section plays the actual-run terminal recording with native controls and responsive sources. A separate evidence page plays the unchanged 56-second case-study edit, now tied to the same observed run. Both are static, website-owned media. The case-study renderer reuses the exact encoded soundtrack from the reviewed Git revision and uses the existing logo-b.png on its closing frame.

## Native Pi terminal recording at /#proofs

The homepage proof section at /#proofs plays a native Pi terminal recording. Its capture came from the live ANSI stream through a headless browser compositor with an expanded tool viewport. The separate 56-second case study uses the same observed run, original encoded audio and supplied logo-b.png. Both are static website assets. The existing teaser remains intact.

## High-contrast Pi recording and chapter links

The proof player uses a crisp 1920 × 1160 rendering of a timed real Pi PTY stream. Its 2:30 edit preserves the actual prompt, rejected validation, autonomous repair, fresh checks and exact PR admission. The matching case-study cuts retain the previous timing, soundtrack and logo. Static chapter links and captions support browser playback.

## Waystead homepage case study and hierarchy (November 18, 2026)

This is a static presentation change in `index.html` and `styles.css`: hero and teaser film → kernel value and features → Waystead game-development use case → capability catalog and active-agent screenshots → architecture → lower-page recorded proof → installation and closing. The case study is semantic HTML with responsive CSS and a typography/stack illustration, not fabricated gameplay media. Its engine stack is grounded in Waystead's maintained project README and `experiments/webgpu/README.md` (private source, no public source link).

The Godot game remains the simulation authority; WebGPU/WASM and Electron describe an experimental desktop deployment path, not a proved production renderer. The site adds no JavaScript, API, trackers, new runtime dependencies, or private repository assets. Reordering preserves existing IDs, video sources, chapter seek controls and carousel hooks. Publication requires Decapod validation and public GitHub Pages readback.

<!-- decapod:capability-overlay:persistent-state:start -->

Generated capability obligations: `persistent-state` is declared for this project. These are decisions and proof requirements, not claims of implemented behavior. Resolve each against project source and tests; record unsupported or non-applicable mechanisms explicitly.

## Persistent State Architecture Overlay

### State Ownership
- Each entity type MUST have a designated state owner
- State ownership boundaries MUST be explicitly documented
- Cross-boundary state access MUST go through defined interfaces

### Transaction Boundaries
- Multi-entity mutation atomicity and partial-failure treatment MUST be documented and proven for the selected store
- Transaction boundaries MUST be documented in ARCHITECTURE.md
- Document compensation or other partial-failure treatment if distributed operations exist

### Storage Abstraction
- Storage ownership, consistency behavior, and access boundaries MUST be explicit
- Portability or swappable implementations are project decisions, not universal requirements
- Migration and rollback treatment MUST match the selected storage technology
<!-- decapod:capability-overlay:persistent-state:end -->

<!-- decapod:codebase-contract:start -->

## Codebase Contract Snapshot

- Core modules (0): none detected
- Plugin/extension modules (0): none detected
- Build manifests (0): none detected
<!-- decapod:codebase-contract:end -->

<!-- decapod:codebase-attestation:start -->

## Codebase Attestation

- Repository signal fingerprint: `92022fafab9734f72f905091a0484ce04adc8935d81151889e4af897851d79ae`
- Significant implementation surfaces: `.github/` (1 files), `README.md/` (1 files), `admin/` (1 files), `cloud-flow.js/` (1 files), `evidence/` (4 files), `main.js/` (1 files), `pricing.js/` (1 files), `scripts/` (7 files), `signup/` (1 files), `tests/` (2 files)
- Refreshed from the current codebase by `decapod rpc --op specs.refresh`
<!-- decapod:codebase-attestation:end -->

## Public showcase gallery and first application

The homepage adds a named `#showcase` section linked from the sticky navigation and hero; Waystead is its first specific application. The case study remains editorial and static, using actual development-build screenshots under `assets/waystead-*.webp`. `main.js` owns isolated carousel controls with keyboard, arrow, dot, and touch interactions, no automatic playback or new dependencies. The existing swarm carousel, Pi proof footage, mobile header and import-free GitHub Pages deployment remain intact. A post-install callout emphasizes natural-language agent instructions. Acceptance requires existing-site static validation plus loaded image asset checks and manual cross-device layout inspection.

## Homepage structure and runtime (November 18, 2026)

The single `index.html` remains GitHub Pages static HTML: hero with the existing `main.js` Cargo/Nix install/copy controls and a lightweight action prompt, teaser, Showcase group (Waystead introduction with six screenshot states plus the startup engineering swarm), Features group (four principle cards and the 14-capability catalog), Architecture with mental-model link, secondary Pi proof, closing and footer. Existing fragment aliases are retained for `#install`, `#kernel`, `#capabilities`, and `#proof`. The screenshot `assets/waystead-waterside.webp` was derived from the user's actual captured Godot runtime, not generated marketing art. A six-item carousel is controlled by the existing `main.js` logic; no JS dependencies are introduced. Validate image presence, hash references, browser interactions and responsive hero layout before release.

## Source-grounded showcase design and desktop hero sizing

The Homepage Showcase continues to contain two independent applications under the same `#showcase` anchor: Waystead's game-engineering case and the three recorded startup-software agent swarms. The Waystead display composes the existing in-game waterside image with two user-supplied static image files, `assets/waystead-logo.png` and `assets/abaxi-logo.png`, stored directly in Git; text remains semantic HTML. CSS scopes the case layout, tonal hierarchy and responsive image placement without new runtime dependencies. The Waystead development carousel contains seven images and retains its arrow, dot, keyboard, touch and full-resolution controls.

At desktop widths, the landing hero tightens its typographic scale, whitespace and mascot size to keep the already-working copyable Cargo/Nix quickstart visible without browser zoom. Mobile remains a stacked layout. No runtime or governance behavior changes; a local-source audit does not replace exact-candidate Decapod validation or external GitHub Pages readback.

## Seven-slide image gallery and illustrated application art — November 19, 2026
Static site assets `assets/waystead-key-art.webp`, `assets/waystead-wordmark-transparent.webp` and `assets/waystead-inventory.webp` are part of this change. The first is a clearly labeled conceptual illustration, the second a transparent identity asset, and the third an actual in-game screenshot. The founder-provided playable waterside image is moved to seventh/last in the screenshot carousel. `main.js` maps each slide and caption to its matching image, with a derived count instead of an assumed six. Public hero copy explicitly includes coordinated agents on the same machine. No additional runtime, hosted service, model API or payment dependency is introduced. Publication still requires governed validation and live-site readback.

## P0 Pricing and Authenticated Signup Client Architecture — November 21, 2026
Static GitHub Pages hosting serves `pricing/index.html` at `/pricing` (preserving `pricing.html`), `signup/index.html` at `/signup`, shared classic script `cloud-flow.js`, `pricing.js`, and `signup/signup.js`. Root-relative asset paths keep `/pricing` and `/signup` functional with or without trailing slashes.

1. **Shared Pure Flow Layer (`cloud-flow.js`)**: Exposes `DecapodCloudFlow` with strict `parseRepoSlug` / `parseRepoSearch`, same-origin `sanitizeReturnUrl` / `parseSafeReturnParam`, `buildAuthAuthorizeUrl`, `isAllowedCheckoutUrl`, `validateSessionRecord`, `classifyAccessState`, `createBoundedPoller`, and `discoverRuntimeConfig` (probing `https://api.decapodlabs.ai` first and falling back to `https://goyxpcmxetztjlrrcwew.supabase.co/functions/v1/decapod-onboarding` when custom-domain routing is unavailable).
2. **Public Pricing (`pricing/index.html`, `pricing.html`, `pricing.js`, `pricing.css`)**: Retains the Local/Cloud comparison, sliders, annual savings flyout, and `'UNDER WRAPS'` disabled Pay controls by default. Displays validated `?repo=` intent via `#pricing-repo-banner` (`textContent` only) and gates Pay handoffs behind server-discovered `liveSaleEnabled` and PKCE auth initiation.
3. **Authenticated Signup (`signup/index.html`, `signup/signup.js`, `signup/signup.css`)**: `DecapodSignupApp.createSignupController` scrubs URL callback parameters/fragments immediately via `history.replaceState`, rejects implicit fragment tokens, holds bearer session metadata only in `sessionStorage` and ephemeral provider tokens only in JS memory, enforces provider-link/quarantine step-up, verifies GitHub org/repo enrollment via the hosted onboarding API, enforces fail-closed outcomes (`organization_already_enrolled`, `admin_approval_required`, `pending_fulfillment` bounded polling, `billing_not_configured` / `live_sale_disabled`), and invokes server-quoted Checkout before confirming `backend_authorized=true` for CLI resumption.
4. **Verification (`scripts/check-site.ts`, `tests/pricing_signup_test.ts`)**: `scripts/check-site.ts` preserves the accepted repository proof contract unchanged, while `tests/pricing_signup_test.ts` compiles all 4 classic browser scripts, verifies all 7 HTML documents including `/pricing` and `/signup`, checks DOM injection safety and public-repo confidentiality across authored files/specs, and exercises `?repo=` parsing, hostile-return rejection, auth-before-checkout gating, and state transitions offline via Deno.

## Authenticated `/admin/<org>` Organization Admin Architecture — November 21, 2026
GitHub Pages serves `admin/index.html` at `/admin/` alongside `admin/admin.css`, `admin/admin.js`, and shared `cloud-flow.js`, with clean `/admin/<org>` subpath compatibility documented in `docs/decisions/0010-admin-route-hosting.md`.

1. **Route Parsing & Canonical Org Resolution (`cloud-flow.js`)**: `parseOrgSlug`, `parseAdminRoute`, `isAllowedAdminPathname`, `buildAdminBrowserPath`, `sanitizeAdminReturnUrl`, `buildAdminAuthAuthorizeUrl`, `listAdminOrganizations`, and `resolveAdminOrganization` enforce single-segment slug/UUID syntax, reject traversal/XSS/conflicting path-vs-query inputs, resolve untrusted `<org>` locators against server-returned `organizations` to immutable `cloud_org_id` UUIDs (failing closed on unaffiliated, non-admin, or ambiguous entries), and keep GitHub Pages browser reloads functional via `/admin/?org=<org>` when no edge subpath rewrite is active.
2. **Scoped Admin Controller (`admin/admin.js`, `admin/index.html`, `admin/admin.css`)**: `DecapodAdminApp.createAdminController` scrubs URL callback parameters and fragment tokens immediately, blocks confidential API calls prior to PKCE verification, performs server-side `account-register` verification per `cloud_org_id`, enforces generation-guarded org-switcher isolation (`isActiveContext` + full DOM reset on org switch), handles `401` / `403 admin_required` mid-session revocation immediately, and separates zero-seat org administration (members, invitations, `/org-admins` delegation, `/org-recovery` contacts, `/policy-templates`, `/resource-limits`, `/billing-overage-policy`, `/device-keys`/`/device-revoke`, and Stripe `/billing-portal`) from repository governance data.
3. **Verification (`tests/admin_test.ts`)**: Verifies `/admin/<org>` and `/admin/?org=<org>` parsing, hostile slug/XSS/traversal/return-URL rejection, auth gating and URL token scrubbing, unaffiliated/non-admin/ambiguous org denial, multi-org switch concurrency isolation, zero-seat admin operations, mid-session `401`/`403` fail-closed handling, HTML/JS asset integrity, and public-repo confidentiality offline via Deno.

## Clack distribution page

GitHub Pages serves `clack/index.html`, its scoped stylesheet, the illustrated Siltwick key art, a native Agents Mode screenshot, and the release files in `clack/downloads/` from the same origin. The copy and download action live in the hero markup in `clack/index.html`. The scoped `clack/clack.css` keeps the lead and supporting line visually distinct as the hero adapts to narrow viewports. The screenshot in `clack/agents-mode.webp` shows the shipped app with a sample project and conversation. The versioned disk image and companion checksum are copied from the official GitHub release and verified before publication. Each content page uses the same static header link order. Shared rules in `styles.css` render a one-pixel underline on current non-Pricing destinations and a filled pill on current Pricing. The homepage’s `main.js` sets the location marker for its section links on initial load and when the URL fragment changes. Clack and Rework declare their page markers in their static documents. The Clack page uses the shared footer in normal document flow, leaving the install section fully visible on narrow screens. The page-level `.clack-site` scope in `clack/clack.css` supplies the same ink token to the content, sticky header, and shared footer. The header uses an opaque fill that stays consistent during scrolling. The page reuses the three wordmarks from the shared assets directory. Its scoped stylesheet gives the header mark a light backing and the install credit’s mark a dark backing. Shared CSS still sizes the header and footer images across viewports.
