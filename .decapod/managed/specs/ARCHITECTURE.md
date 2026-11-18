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

Accepted main3e350d8d supplies the persistent responsive header, homepage Constitution copy, corrected footer logo and pricing preview with concealed dollar prices, repository/contributor controls and annual savings. Those accepted pricing and logo bytes are preserved exactly. The evidence-backed film is an additive homepage section beside the retained original teaser; its styles are scoped to launch/proof presentation. No application backend or Cloud enrollment authority is introduced.

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

<!-- decapod:codebase-attestation:start -->

## Codebase Attestation

- Repository signal fingerprint: `2da8ed8bd174bf53df5cdb00b4a907c54f68c3f902bd9acfde8b49affeac21ca`
- Significant implementation surfaces: `.github/` (1 files), `README.md/` (1 files), `evidence/` (1 files), `main.js/` (1 files), `pricing.js/` (1 files), `scripts/` (7 files)
- Refreshed from the current codebase by `decapod rpc --op specs.refresh`
<!-- decapod:codebase-attestation:end -->
