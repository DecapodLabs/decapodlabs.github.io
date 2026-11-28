# Semantics

Local is free and needs no signup. It uses the local repository SQLite database and works offline with the user's existing coding agents and Git workflow. Get started means navigation to the published quickstart, not a registration or transaction.

Decapod Cloud provides hosted logical Decapod storage, managed identities/permissions, and organization/repository/member administration at $50 per contributor per repository per month ($552 billed annually). Local remains free without signup.

## Domain Model
This static website owns public marketing documents, film/install browser state, and compiled Cloud UI presentation assets only. The Cloud service owns organizations, repository identities, seat assignments, subscriptions, and authorization.

## State Machines
Local navigation opens documentation. Cloud has no purchase transition. Enabling it later requires a reviewed implementation and independent hosted acceptance. A webpage cannot confer exceptional governance authority, verified completion, dual-write permission or fallback after denied cloud access.

## Invariants
Local stays free without signup. Cloud prices remain unpublished and its purchase button stays disabled. Static content cannot grant membership, entitlements, payment acceptance or governance authority. Local and hosted operational proof remain independent of this preview.

<!-- decapod:capability-overlay:background-processing:start -->

Generated capability obligations: `background-processing` is declared for this project. These are decisions and proof requirements, not claims of implemented behavior. Resolve each against project source and tests; record unsupported or non-applicable mechanisms explicitly.

## Background Processing Semantics Overlay

### Retry Semantics
- Retry and backoff behavior MUST be selected and documented for each work class
- Poison-work handling MUST be selected and documented for each work class
- Retry MUST preserve the declared side-effect and idempotency semantics

### Idempotency
- Each job MUST declare whether it is idempotent, transactional, compensating, or otherwise duplicate-safe
- Deduplication or compensation mechanisms are project decisions and require proof
- Duplicate execution MUST follow the job's declared duplicate-handling semantics

### Poison Message Handling
- Document the actual terminal-failure behavior for exhausted or non-retryable work; a dead-letter queue is not implied
- If a dead-letter queue exists, document its monitoring, alerting, and ownership
- If manual replay is supported, document authorization and duplicate-side-effect proof; otherwise record the limitation
<!-- decapod:capability-overlay:background-processing:end -->

<!-- decapod:capability-overlay:persistent-state:start -->

Generated capability obligations: `persistent-state` is declared for this project. These are decisions and proof requirements, not claims of implemented behavior. Resolve each against project source and tests; record unsupported or non-applicable mechanisms explicitly.

## Persistent State Semantics Overlay

### Transaction Semantics
- Atomicity boundaries and any non-atomic operations MUST be declared with source and test evidence
- Document observed read-after-write behavior; do not infer consistency from a capability declaration
- Eventual consistency windows MUST be documented

### Migration Semantics
- Migration compatibility, any breaking changes, and their recovery path MUST be explicit and tested
- Migration rollback procedures MUST be documented
- Data integrity checks post-migration

### Recovery Semantics
- Document supported recovery mechanisms and evidence; point-in-time recovery is not implied by persistent-state
- Recovery objectives MUST be selected for the project and recorded as proof obligations
- Recovery test cadence MUST be selected for the project and recorded as a proof obligation
<!-- decapod:capability-overlay:persistent-state:end -->

<!-- decapod:codebase-contract:start -->

## Codebase Contract Snapshot

- State/schema/migration modules (0): none detected
<!-- decapod:codebase-contract:end -->

<!-- decapod:codebase-attestation:start -->

## Codebase Attestation

- Repository signal fingerprint: `c31154b61bbcb27bcfd3ab872a6567ad44b43bc5f47765bfce175ddb7eca2369`
- Significant implementation surfaces: `.github/` (1 files), `README.md/` (1 files), `admin/` (1 files), `cloud-flow.js/` (1 files), `evidence/` (4 files), `main.js/` (1 files), `pricing.js/` (1 files), `scripts/` (7 files), `signup/` (1 files), `tests/` (5 files)
- Refreshed from the current codebase by `decapod rpc --op specs.refresh`
<!-- decapod:codebase-attestation:end -->
