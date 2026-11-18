# Architecture

GitHub Pages serves a static homepage and a dedicated offerings.html. Existing styles.css supplies branding and responsive layout; main.js retains film controls and install-selection/copy behavior on the homepage. The offerings page needs no browser script or application server. Website-owned media generation and its existing release workflow remain unchanged.

## Direction
Keep this site static. Propodus owns business logic, Auth, permissions, billing and hosted database authority.

## Current Facts
The homepage has only a navigation link and highlighted Local + Cloud entry added to its accepted content. The standalone offering page uses existing wordmark/assets/fonts and shared CSS. It exposes no checkout link or price. Local's Get started links point at the exact published quickstart; Cloud's button is native-disabled.

## Topology
```text
Visitor -> GitHub Pages -> homepage -> offerings.html -> Decapod quickstart.
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

- Repository signal fingerprint: `d89a304b0ee71a412e228bbcdd654ef5f6c500603c9241116988da1fe9f10371`
- Significant implementation surfaces: `.github/` (1 files), `README.md/` (1 files), `main.js/` (1 files), `pricing.js/` (1 files), `scripts/` (3 files)
- Refreshed from the current codebase by `decapod rpc --op specs.refresh`
<!-- decapod:codebase-attestation:end -->
