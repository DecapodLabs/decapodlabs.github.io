# Intent

## Public search and agent discovery

Make the public website and documentation discoverable at the canonical `https://decapodlabs.ai` origin. Website-owned marketing pages supply descriptive titles, canonical links, social metadata, and a concise `/llms.txt` index; `/sitemap.xml` lists canonical public entrypoints. Account and transaction routes remain excluded from cooperative crawling, while existing noindex metadata and server authorization retain their separate roles. These surfaces make existing public information easier to find without changing product claims, UI behavior, hosted authority, or promising search rankings.

## Signed Decapod Cloud Web Publication (`cloud-app-manifest.json`, #54, #55, #56)

Keep `DecapodLabs/decapodlabs.github.io` focused on public marketing, public documentation, public Cloud-first `/pricing` ($50/mo, $552/yr, plus `Decapod Local — Free forever`, with HTTPS enterprise contact URLs rather than raw `mailto:` so edge proxies never inject `email-decode.min.js`), and verified static distribution of compiled Decapod Cloud presentation bundles (`cloud-app-manifest.json`, `asset_release: 20261126-brand`, source revision `069086c5` enforcing verified customer organization boundaries in PR #269 atop PRs #266/#267, unifying the warm homepage palette with Geist typography, Signup future-repo reservation slots, and simplified Organization Admin UX, plus refined `trust/trust.css` card borders/shadows). Preserve `billing`, `seats`, `repo`, and `repos` across `/pricing` -> `/auth` PKCE -> `/signup` without pre-launch gates, and verify published artifact SHA-256 provenance via `tests/publication_provenance_test.ts` while keeping internal application tests and operational secrets out of this repository.

## Simplified Organization Admin UX (`admin/*`, Propodus PRs #266, #267 & #269)

Deliver the calm, approachable Organization Admin surface compiled from upstream Propodus `069086c5` (`asset_release: 20261126-brand`):
- Unauthenticated `#admin-auth-gate` presents `"Welcome to Decapod Cloud Admin"`, an `Organization Admin` badge, three plain-English capability highlights, GitHub sign-in CTA, and a `/signup` link.
- Authenticated shell enforces `isVerifiedCustomerOrganization(org)` across `listAdminOrganizations` and `resolveAdminOrganization` so legacy `account:<uuid>` bootstrap records never appear in selectors or default workspaces, renders `"No organizations yet"` onboarding guidance toward `/signup` when zero verified orgs exist, returns typed `obsolete_bootstrap_workspace` / `organization_access_denied` recovery panels for direct obsolete workspace links, formats customer-facing organization names cleanly (`formatOrganizationDisplayName`), and pairs the warm organization header (`+ Add seats or repos` CTA) with soft segmented pill navigation (`Overview`, `Repositories`, `Team` preserving `#tab-btn-people`, `Billing`, `Usage`, `Settings`), KPI cards, title-cased `GitHub` code host label, 1-click Overview Quick Actions, promoted Everyday Actions + inline GitHub invitations, collapsed advanced disclosures with clean count spacing (`Bind reserved repository slot (N available)`), `$0 surprise overages — disabled by default` reassurance badges, and responsive `390px` mobile grid containment (`min-width: 0` around `.ds-table-wrap`).

## Behavioral Privacy & Trust Contract (`/trust/index.html`)

Publish a versioned, public Behavioral Privacy & Trust Contract at `/trust/index.html` (`v1.0.0`, effective `2026-11-24`) linked cleanly from the footer across site pages (`index.html`, `pricing.html`, `pricing/index.html`, `signup/index.html`, `clack/index.html`, `tecr.html`, `admin/index.html`, `trust/index.html`). The contract discloses exact network boundaries for Decapod Local CLI (zero telemetry/analytics), Decapod Cloud, Dactyl, and Clack, documents Cloudflare Workers relay transparency, states all nine permanent trust invariants, and provides incident accountability and revocation channels.

The public Decapod Labs website explains the repo-native governance kernel and helps humans begin with their existing coding agents. The accepted pricing.html preview compares Local with the planned Cloud offering; the homepage links to it without replacing the accepted hero, capability catalog or closing layout.

Local is free forever, works offline without signup, and links Get started to https://decapodlabs.github.io/decapod/quickstart.html. Decapod Cloud leads `/pricing` at $50 per contributor per repository per month ($552 billed annually) with transparent annual and volume discounts and live team configuration routing cleanly into authenticated Signup.

## Product Outcome
Help visitors understand the two ways to use Decapod and begin local operation immediately.

## Scope
Dedicated static Cloud-first pricing experience, verified launch film, restrained homepage entry, and compiled presentation bundles for Signup and Admin. Authentication, billing, entitlement, and hosted storage live outside this static marketing repository. A coordinated docs navigation change belongs to the Decapod repository.

## Constraints
Preserve current accepted site changes and GitHub Pages hosting. The informational preview does not alter the authoritative Stripe catalog or assert hosted readiness. Source code/history/specifications/worktrees stay repository-native.

## Acceptance Criteria
Local clearly states free-forever no-signup usage; Cloud pricing displays live commercial rates ($50/mo, $552/yr), clear Cloud value proposition, and purchase entry into Signup. Public documents remain readable on desktop and mobile and pass exact-candidate governed validation.

## Verified autonomous engineering launch film (#9)

Deliver the actual Pi objective-to-PR lifecycle as a 56-second 1920x1080 launch film, 12-second social cut, 1080x1920 mobile film, optional captions, original synthesized soundtrack and poster. Preserve the original teaser and homepage identity. Use the original mascot and existing Pillow/CairoSVG/FFmpeg helpers; no new application backend, agent framework, purchase or Cloud subscription is required.

The evidence owner is Decapod #1757/#1758. The observer correlated actual failure, model-requested repair, fresh native checks and exact-head GitHub PR2 admission with zero post-objective input. Separately labelled operator controls prove post-creation quarantine, source rejection and target invalidation. Current admission is historical after the target advanced; never imply merge authorization. Public assertions must match source witnesses rather than agent narration.

Delivery criteria cover complete static media/presentation files, reproducible rendering, encoded-media checks, native site checks, provenance checks, desktop/mobile browser visual inspection, and live published URL verification.

## Decapod Labs website intent

The human-authored source of intent is
[docs/decisions/0001-site-intent.md](../../../../docs/decisions/0001-site-intent.md).
The outcome is an independent, vibrant, public Decapod Labs landing page
at https://decapodlabs.github.io/, linking to existing docs at
https://decapodlabs.github.io/decapod/. AI coding agents operate through
Decapod; humans run init once per project and continue their agent workflow.
Preserve offline-first, bounded authority, current commit-specific proof,
and the actual original film and mascot. Publication must be verified
independently against the publicly served Pages URL.

## Launch objective authorship

The controller selected the single Pi task under the human-authorized mission; direct human authorship of that prompt is not attested. The separately pinned retrospective objective-provenance disclosure preserves the original runtime/capture/manifest bytes. Rendered language says ONE ENGINEERING OBJECTIVE, and both presentation guards reject a substituted authorship claim. This correction requires rerendered media, source inventory review and fresh native admission; prior film/validation bytes cannot authorize it.

## Waystead game-development use case and proof placement (November 18, 2026)

Show Waystead as a legitimate in-progress game-development workload for the free local Decapod kernel. The source project has playable Godot gameplay and an experimental WebAssembly/WebGPU desktop path in Electron. Its design targets, incomplete runtime experiments, and the game’s unpublished source must not be represented as shipped capabilities or public access. Decapod governs the AI-assisted engineering activity—task ownership, authority boundaries, durable project context, and evidence—rather than generating the game itself.

The homepage puts this use case after the kernel capabilities and gives it a direct discovery link near the main call to action. Move the native Pi proof recording below the project/workflow sections and above installation, preserving the existing player, chapters, evidence links, and fragment identifiers `#proof` and `#proofs`. Keep the recording within a restrained readable width. Existing pricing copy, purchase status, branding, and original media are out of scope. Browser layout, fragment navigation, and exact-candidate validation remain acceptance gates.

## Clack downloads

Visitors can find Clack immediately after Rework in the Decapod Labs header on desktop and mobile. The header underlines the current non-Pricing destination, including selected homepage sections. Pricing keeps its distinct pill treatment. At `/clack/`, the hero pairs “code with the crabs” with the Clack mascot and introduces the app as “a new way to work and play.” A 30-second native gameplay trailer beside the primary download follows a hero’s journey: Waystead’s ABAXI fanfare opens the cut into humble beginnings (the seaside starter home, Mira’s modest cottage, copper mining, early charged sword pounce and mine archery fights, and the starter Kelp Lantern), pivots near the midpoint inside the Staff Shop as Clack upgrades to the Sunclaw Scepter, and escalates through airborne Tidehex magic, upgraded palace homes and ornate furnishings, the neighborhood Pearl Ring, and the Imperial Dome championship victory where the crowd throws gold. Gameplay is shown without on-screen text, and the closing card presents “Clack” with the exact on-screen line “code with the crabs” above the Decapod Labs credit. The player includes synchronized English WebVTT captions and a poster and plays on demand. The accompanying copy explains how a macOS coding project connects to the playable town. An example from Agents Mode shows how a visitor can select a resident, assign a project request, and review an edit before applying it. The Labs header and footer use Clack’s dark teal palette at desktop and mobile widths. Visitors see the transparent dark-surface Labs wordmark in the header, the white Labs wordmark in the footer, and an inline transparent Decapod Labs credit in the install section. Rework’s GitHub link uses the shared hover shadow. The page displays clear Apple silicon requirements. The primary action links to the exact Clack disk image and matching checksum on the public release mirror. The displayed Apple silicon release is Clack v0.11.1. Visitors can also get the matching SHA-256 checksum and see the current release version on GitHub. Publishing a verified new Clack release updates those links and the in-app update manifest together.

<!-- decapod:declared-capabilities:start -->

## Declared Capability Surfaces

These declarations select authoring and proof obligations; they do not attest implemented runtime guarantees.

- `authentication`
- `background-processing`
- `event-driven`
- `external-integrations`
- `persistent-state`
- `public-api`

<!-- decapod:declared-capabilities:end -->

<!-- decapod:codebase-contract:start -->

## Codebase Contract Snapshot

- Tracked significant codebase files: 21 across `.github/` (1), `README.md/` (1), `admin/` (1), `cloud-flow.js/` (1), `evidence/` (4), `main.js/` (1), `pricing.js/` (1), `scripts/` (7), `signup/` (1), `tests/` (3)
- Core modules: 0 | Workflows: 1 | Integration targets: 0
<!-- decapod:codebase-contract:end -->

<!-- decapod:codebase-attestation:start -->

## Codebase Attestation

- Repository signal fingerprint: `8ff16d5b31cbdbd35a476e98778d5f571d60c0ffcf4b78519dd9a58e568c2929`
- Significant implementation surfaces: `.github/` (1 files), `README.md/` (1 files), `admin/` (1 files), `cloud-flow.js/` (1 files), `evidence/` (4 files), `main.js/` (1 files), `pricing.js/` (1 files), `scripts/` (7 files), `signup/` (1 files), `tests/` (3 files)
- Refreshed from the current codebase by `decapod rpc --op specs.refresh`
<!-- decapod:codebase-attestation:end -->

## Showcase: Waystead application and gameplay imagery

Give the homepage an industry-agnostic `Showcase` navigation entry and canonical public `/#showcase` fragment. Explain how the repo-native Decapod kernel can govern agentic software delivery in many domains, then lead with Waystead as one actual early-stage application rather than as finished proof. The site's game copy centers on the ambitious procedurally generated planet-scale survival RPG and dungeon-crawler vision, with its existing playable Godot implementation, accelerated agent development, and firm distinction between completed work and in-progress world ambitions. Electron/WebGPU/WASM experiments do not become claims of production readiness.

Use the user's real development screenshots directly below the existing Waystead introduction in a keyboard-operable, arrow/dot/swipe-controlled five-shot gallery with candid scene captions and responsive layout. Keep the supplied screenshot source imagery in repository-controlled assets, with no third-party screenshot service. Provide accessible names and alt text. The install section ends with a brief, highly visible reminder: “Now just tell your agent what you want.” No Cloud purchase/pricing changes.

## Above-the-fold quickstart, feature ordering, sixth Waystead image (November 18, 2026)

The public homepage now presents a compact copyable Cargo/Nix install field directly inside the hero, followed by “Now just tell your agent what you want.” The independent Install section and navigation item are retired; existing `#install` deep links continue to resolve at the hero. Keep both supported install methods, clipboard fallback, quickstart link and free-local contract. Navigation reads Showcase → Features → Architecture → Pricing, preserving the colorful Pricing chip. `#showcase` groups the Waystead game case study and the practical startup software-engineering Carbon/Hydrogen swarm, in that order. `#features` introduces four high-level differentiators and the complete 14-card kernel feature catalog, then Architecture follows. The Architecture link targets the current `mental-model.html` documentation. Include the user's real waterside Waystead screenshot as sixth media state (inserted between exploration and landscape) with real caption and source asset; preserve the original five. No new dependencies, Cloud pricing claims, or invented gameplay abilities.

## Showcase presentation correction — November 19, 2026

The Showcase must demonstrate Decapod's applicability to discrete engineering domains rather than launch or promote Waystead as a product. Waystead is one actual in-progress application; the parallel startup-software swarms provide another. Lead with Decapod's shared governance across diverse projects, introduce Waystead in restrained editorial prose, and use the founder-provided original Waystead and ABAXI brand images alongside one authentic in-game frame. Do not imply completed planetary simulation, shipped game readiness, or that Decapod authors gameplay by itself. Preserve the gallery and its six original screenshots. Remove the oversized invented game brand-card composition and double-orange heading treatment.

The desktop hero should present its working installation command and copy action within the initial viewport at ordinary browser zoom through responsive sizing, not CSS zoom or image distortion. Preserve Cargo/Nix selection, quickstart and pricing links, the primary logo and mascot, mobile layouts, the 14-feature catalog, the startup engineering swarm carousel, and the recorded Pi proof. Acceptance includes source structure, asset existence, script syntax, responsive desktop/mobile checks, and public Pages deployment readback.

## Showcase asset, gallery, and local coordination clarification — November 19, 2026
The public hero says coding agents can work together in the same repository on the same machine and across a team, using the human-provided phrasing verbatim. The Showcase restores the existing warm-orange gallery accent to “Across disciplines.” and “01 / GAME DEVELOPMENT.” The featured Waystead artwork is explicitly an illustrated project vision, not an alleged game runtime capture. The replacement Waystead wordmark is alpha-transparent, alongside the existing ABAXI brand. Actual development screenshots remain in a seven-slide carousel; the original waterside character screenshot is the seventh and final item. The sixth is an actual inventory/crafting capture. Preserve all prior functionality and source assets, including the installation controls, the startup engineering showcase, the separate recorded Pi proof, and Cloud pricing.

## Waystead key-art aspect-ratio repair (November 19, 2026)

The featured 1672×941 Waystead illustration must remain fully visible at desktop and mobile widths, without cover cropping or inherited fixed-height stretching. The HTML image's intrinsic width/height attributes reserve its layout ratio; CSS must explicitly override the fixed height with `height: auto` and preserve the full composition using `object-fit: contain`. The existing authentic transparent Waystead logo, ABAXI logo, seven-slide gameplay gallery, screen-reader alt text, and all other homepage sections remain unchanged. Publication must invalidate cached CSS and inspect the rendered proportions instead of relying solely on source syntax.

## Waystead external waitlist link (November 19, 2026)

The complete featured Waystead artwork card in the homepage Showcase—ABAXI mark, transparent WAYSTEAD logo, concept art, and caption—must be one semantic, keyboard-focusable anchor to the user-supplied exact URL `https://whop.com/abaxi-studios/waystead-waitlist/`. Provide visible “Join the waitlist” affordance and an accessible external-link label while retaining the existing visual language, correct 1672×941 full artwork display, seven screenshots in the separate gallery, and the rest of the Showcase and site unchanged. Do not insert nested buttons/anchors inside the card; do not modify the hosted Cloud pricing or Decapod kernel.

## Waystead inline link and heading-color continuity
The first textual mention of Waystead in the Showcase's game-development paragraph uses the same warm accent (`#9b513a`) as “Across disciplines.” and points directly to the official Waystead waitlist at `https://whop.com/abaxi-studios/waystead-waitlist/`. Preserve the full-card waitlist link, logo/art treatment, gameplay gallery, and all other product claims and page sections unchanged. The inline text link is independent of the adjacent linked artwork card and remains keyboard-accessible.

## P0 Pricing (`/pricing`) and Authenticated Cloud Signup (`/signup`) — November 21, 2026
Deliver the canonical public `/pricing` route (`pricing/index.html`) alongside compatible `pricing.html` and the authenticated Cloud purchasing sub-application at `/signup` (`signup/index.html`, `signup/signup.js`, `signup/signup.css`, backed by pure helpers in `cloud-flow.js`).

Public `/pricing` safely parses optional `?repo=<percent-encoded-org%2Frepo>` preselection intent (strictly validating `owner/repo` syntax via `DecapodCloudFlow.parseRepoSearch`, rendering solely through `textContent`, and ignoring invalid inputs), presents live commercial rates ($50/mo, $552/yr) and volume discounts without pre-launch placeholders, and routes paid enrollment cleanly through PKCE authentication at `https://api.decapodlabs.ai` into `/signup`.

Direct visits to `/signup` enforce an authentication gate before showing any organization, repository, or billing details. After PKCE sign-in (including GitHub provider-link step-up for Google-signed-in users), `/signup` verifies or collects the target GitHub organization and repository, enforces fail-closed states (`organization_already_enrolled`, `admin_approval_required`, `pending_fulfillment`, `billing_disabled`), invokes server-quoted Checkout only when authenticated, repo-verified, and server-enabled, and displays return-to-CLI instructions once server authorization confirms `backend_authorized=true`.

## Authenticated Organization-Scoped Admin UI (`/admin/<org>`) & Release Coherence
Distribute the compiled organization-scoped Cloud Admin presentation bundle (`admin/index.html`, `admin/admin.js`, `admin/admin.css`, `shared/commercial-ui.css`, `assets/fonts/*`, and shared `cloud-flow.js`) compatible with `/admin/` and `/admin/?org=<org>` without altering existing public home, pricing, signup, proof, or documentation routes and without storing internal backend configuration, operational runbooks, or internal test suites in this public repository.

An unauthenticated visitor fails closed behind the PKCE sign-in gate before rendering or invoking organization APIs. Verified organization administrators operate without requiring paid repository seats—managing repositories, seat assignments, members, invitations, admin delegation, resource limits, spend-cap policies, enrolled devices, recovery contacts, cross-org policy templates, and Stripe Billing Portal deep-links via Cloud API endpoints without rendering private repository payloads.

Enforce release coherence (`20261126-geist`) across GitHub Pages static assets and manifest SHA-256 verification (`tests/publication_provenance_test.ts`), keeping internal skew checks, availability runbooks, and backend tests upstream rather than in this static repository.

Public presentation bundles (`cloud-flow.js`, `pricing/*`, `signup/*`, `admin/*`, `20261126-geist`) use Geist styling tokens, fail-closed request guards, and coherent release metadata across Pricing, Signup, and Admin without pre-launch placeholders or withheld-pricing gates.
