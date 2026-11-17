# Intent

The public Decapod Labs website explains the repo-native governance kernel and helps humans begin with their existing coding agents. A dedicated offerings.html compares Local with the planned Cloud offering; the homepage links to it without replacing the accepted hero, capability catalog or closing layout.

Local is free, works offline, and requires no signup. Every Get started link on the offerings page goes to https://decapodlabs.github.io/decapod/quickstart.html. Cloud displays Coming soon, shows its planned hosted database, managed sign-in and organization/repository/member management benefits, and has a genuinely disabled purchase button under a second Coming soon sticker. No price, annual term, launch date, checkout URL or live availability promise is published.

## Product Outcome
Help visitors understand the two ways to use Decapod and begin local operation immediately.

## Scope
Dedicated static offering comparison, a restrained homepage entry and preserved branding/media. Authentication, billing, entitlement and hosted storage remain Propodus responsibilities. A coordinated docs navigation change belongs to the Decapod repository.

## Constraints
Preserve current accepted site changes and GitHub Pages hosting. The informational preview does not alter the authoritative Stripe catalog or assert hosted readiness. Source code/history/specifications/worktrees stay repository-native.

## Acceptance Criteria
Local clearly says free and no signup; Get started reaches the exact quickstart URL. Cloud benefits are visible with Coming soon status and a disabled control/sticker, with no public price or purchasing route. Both documents are readable on mobile and desktop. Exact-candidate governed validation precedes publication.

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

<!-- decapod:codebase-attestation:start -->

## Codebase Attestation

- Repository signal fingerprint: `7ed87e3ea4dfbda9cc5c5bb6a1d41a1bf6458e6641b583cf8691a6a6c4c230fc`
- Significant implementation surfaces: `.github/` (1 files), `README.md/` (1 files), `main.js/` (1 files), `scripts/` (3 files)
- Refreshed from the current codebase by `decapod rpc --op specs.refresh`
<!-- decapod:codebase-attestation:end -->

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
