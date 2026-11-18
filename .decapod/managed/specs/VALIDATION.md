# Validation

## Current pricing page coverage

The unchanged required static-source command now includes `pricing.html` as well
as `index.html` and the legacy `offerings.html` redirect, and compiles both `main.js`
and `pricing.js`. It preserves duplicate-ID, local-asset, fragment, URL-safety and
accessibility checks. The actual public sources must pass the scoped privacy and
closed-preview checks. Nine generated negative cases must reject sensitive-shaped
values, an added numeric price, removed disabled attributes, a payment destination
and a network effect. No live identifier or secret is used. Source qualification
still cannot attest a hosted purchase, full secret-history audit or browser layout.
The media workflow's existing `ci_only` limitation and full exact-candidate governance
requirement remain unchanged; no accepted recipe, workflow or tool is replaced.

Run required decapod validate against the exact committed candidate and accepted site main before PR publication. Stage authored work, record a cumulative checkpoint before the commit, and maintain living specs. A rebase changes candidate identity and requires renewed qualification. Do not substitute a shadow build or fabricate receipts.

## Proof Surfaces
The first-adoption repo.pr-readiness.v1 profile declares a Deno static-source command that compiles the actual homepage browser script and checks both public HTML documents for duplicate IDs, local assets, fragment targets, unsafe URLs and accessibility metadata. The existing main/manual media workflow remains explicitly ci_only, not locally passed. The historically uninstalled generated validation workflow remains an assurance limitation documented in docs/decisions/0002-workflow-installation-pending.md.

## Evidence Artifacts
Retain candidate/target identifiers and Decapod readiness proof. Use actual browser inspection at desktop and mobile sizes for visible content, overflow and disabled control behavior, then verify real published documents. Static proof does not establish hosted payment or cloud operation readiness.

## Promotion Gates
Governed validation qualifies source publication. This preview can publish without live checkout because it exposes no purchase link, price or active Cloud control. Removing Coming soon or enabling purchasing requires independent service acceptance; local fixtures cannot establish it.

## Regression Guardrails
Preserve accepted hero/capabilities/closing, Cargo/Nix instructions, film controls, reduced-motion behavior, brand assets and workflow permissions. Keep exact quickstart navigation, free/no-signup local wording, planned Cloud benefits and disabled purchase status. No brittle test merely repeats marketing copy; browser review checks real interaction/layout.

<!-- decapod:capability-overlay:background-processing:start -->

Generated capability obligations: `background-processing` is declared for this project. These are decisions and proof requirements, not claims of implemented behavior. Resolve each against project source and tests; record unsupported or non-applicable mechanisms explicitly.

## Background Processing Validation Overlay

### Duplicate Delivery Tests
- Test repeated delivery against the declared duplicate-handling semantics, including side effects and limitations
- Idempotency key verification
- Verify the declared delivery guarantee; do not claim exactly-once behavior without proof

### Retry Tests
- Configured retry/backoff policy verified
- Configured retry bound or unbounded policy verified
- Poison-work handling verified when the project declares it

### Shutdown Tests
- Graceful drain on signal
- In-flight job completion or safe requeue
- Verify the declared durability and loss boundary on forced termination; record unsupported guarantees
<!-- decapod:capability-overlay:background-processing:end -->

<!-- decapod:capability-overlay:persistent-state:start -->

Generated capability obligations: `persistent-state` is declared for this project. These are decisions and proof requirements, not claims of implemented behavior. Resolve each against project source and tests; record unsupported or non-applicable mechanisms explicitly.

## Persistent State Validation Overlay

### Migration Proof Command
- Configure `repo.migration_validation.command` and its arguments as the executable migration proof; file presence is not proof
- The configured command MUST define its working directory, timeout, expected exit code, and evidence output

### Migration Tests
- All migrations MUST have integration tests
- Rollback procedures MUST be tested
- Data integrity checks post-migration

### Persistence Integration Tests
- Repository abstraction tested against real database
- Transaction boundary tests
- Concurrency conflict tests
- Data integrity validation after recovery
<!-- decapod:capability-overlay:persistent-state:end -->

<!-- decapod:capability-overlay:public-api:start -->

Generated capability obligations: `public-api` is declared for this project. These are decisions and proof requirements, not claims of implemented behavior. Resolve each against project source and tests; record unsupported or non-applicable mechanisms explicitly.

## Public API Validation Overlay

### Contract Tests
- All public endpoints MUST have contract tests
- Request/response schema validation on every request
- Compatibility regression tests for each version

### Security Tests
- Authentication bypass tests
- Malformed input handling tests
- Rate limit enforcement tests
- Token expiry/revocation tests
<!-- decapod:capability-overlay:public-api:end -->

<!-- decapod:codebase-attestation:start -->

## Codebase Attestation

- Repository signal fingerprint: `d89a304b0ee71a412e228bbcdd654ef5f6c500603c9241116988da1fe9f10371`
- Significant implementation surfaces: `.github/` (1 files), `README.md/` (1 files), `main.js/` (1 files), `pricing.js/` (1 files), `scripts/` (3 files)
- Refreshed from the current codebase by `decapod rpc --op specs.refresh`
<!-- decapod:codebase-attestation:end -->
