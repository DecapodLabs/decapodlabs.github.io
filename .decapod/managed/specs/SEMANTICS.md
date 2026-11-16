# Semantics

## Project Purpose
This is the single-page Decapod landing page, published from the **organization-level** GitHub Pages repository:

## Authoring Scope and Evidence
Project: decapodlabs.github.io. This is an initial authoring scaffold, not an implementation attestation.

Describe the configured project from purpose to architecture to implementation depth. Start with the whole product: its users, problem, outcomes, and boundaries; then explain the system and its components, interfaces, state, operations, security, and proof. Ground factual prose in the repository's config, README/product documentation, source paths and symbols, contracts, and tests. Distinguish implemented behavior, intended behavior, assumptions, and unresolved gaps. A narrow task changes the relevant part of this whole-project account; it must not replace project-wide identity with the latest task, release workflow, or tooling. Record task-specific scope and evidence in the current change's governance record. Templates and declared capabilities are authoring/proof obligations, not evidence that a runtime guarantee exists. Preserve authored prose during generated refreshes. If configured metadata and explicit project-level sections are absent, leave project identity unknown and ask for or author grounded context rather than promoting an arbitrary legacy/task line.

Use the seeded context below as a starting point to verify against repository sources. Replace example diagrams, suggested controls, targets, tables, and blank fields with source-grounded prose; mark non-applicable topics with a reason. Do not adopt a store, queue, server, CI provider, replay guarantee, or service level merely because it appears in a template.

## State Machines
Describe the project's actual entities, states, transitions, and externally
observable behavior. Cite implementation symbols and tests; do not substitute
the agent's task lifecycle for the product's state model.

## Invariants
| Invariant | Scope | Implementation Source | Proof or Gap |
|---|---|---|---|
| Identify a project-specific invariant | | | |

## Event Sourcing Schema
Only applicable if the repository actually implements event sourcing. Otherwise
record that it is not applicable; this example is not a replay guarantee.
| Field | Type | Description |
|---|---|---|
| event_id | string | globally unique event id |
| aggregate_id | string | entity/workflow id |
| event_type | string | semantic transition |
| payload | object | transition data |
| recorded_at | timestamp | append time |

## Replay Semantics
- Replay order:
- Conflict resolution:
- Snapshot cadence:
- Determinism proof strategy:

## Error Code Semantics
- Namespace:
- Stable compatibility window:
- Mapping to retry/degrade behavior:

## Domain Rules
- Business rule 1:
- Business rule 2:
- Business rule 3:

## Idempotency Contracts
| Operation | Idempotency Key | Duplicate Behavior |
|---|---|---|
| Actual operation and source | Declared key, if any | Observed duplicate behavior and proof |

## Transition Contract
| Current State | Trigger | Preconditions | State Mutation | Emitted Evidence | Next State |
|---|---|---|---|---|---|
| | | | | | |

## Invariant Violation Response
- Which invariant is checked before mutation?
- Which invariant is checked after persistence?
- Is the failed operation retried, rejected, compensated, or escalated?
- What evidence distinguishes a rejected operation from an incomplete one?
- Which state remains canonical if derived state disagrees?

## Determinism and Replay Boundary
- Inputs included in a replay:
- Inputs deliberately excluded (wall clock, randomness, external state):
- Ordering and conflict resolution:
- Snapshot/checkpoint policy:
- Proof that replay is equivalent to the original outcome:

## Backward-Compatibility Semantics
- Legacy states accepted:
- Legacy states rewritten:
- States that require a migration:
- Agent instruction emitted before a breaking transition:
- Rollback behavior if migration or replay fails:

## Language Note
- Primary language inferred: javascript

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

