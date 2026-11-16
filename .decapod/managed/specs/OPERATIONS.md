# Operations

## Project Purpose
This is the single-page Decapod landing page, published from the **organization-level** GitHub Pages repository:

## Authoring Scope and Evidence
Project: decapodlabs.github.io. This is an initial authoring scaffold, not an implementation attestation.

Describe the configured project from purpose to architecture to implementation depth. Start with the whole product: its users, problem, outcomes, and boundaries; then explain the system and its components, interfaces, state, operations, security, and proof. Ground factual prose in the repository's config, README/product documentation, source paths and symbols, contracts, and tests. Distinguish implemented behavior, intended behavior, assumptions, and unresolved gaps. A narrow task changes the relevant part of this whole-project account; it must not replace project-wide identity with the latest task, release workflow, or tooling. Record task-specific scope and evidence in the current change's governance record. Templates and declared capabilities are authoring/proof obligations, not evidence that a runtime guarantee exists. Preserve authored prose during generated refreshes. If configured metadata and explicit project-level sections are absent, leave project identity unknown and ask for or author grounded context rather than promoting an arbitrary legacy/task line.

Use the seeded context below as a starting point to verify against repository sources. Replace example diagrams, suggested controls, targets, tables, and blank fields with source-grounded prose; mark non-applicable topics with a reason. Do not adopt a store, queue, server, CI provider, replay guarantee, or service level merely because it appears in a template.

## Operational Readiness Checklist
- [ ] On-call ownership defined.
- [ ] SLOs and alert thresholds defined.
- [ ] Dashboards for latency/errors/throughput are live.
- [ ] Runbooks linked for all Sev1/Sev2 alerts.
- [ ] Rollback plan validated.
- [ ] Capacity guardrails documented.

## Deployment Model
Describe the operational runtime model, scheduling, and system deployment architecture.

## Service Level Objectives
| SLI | SLO Target | Measurement Window | Owner |
|---|---|---|---|
| Availability, if applicable | Select and justify | Select | TBD |
| P95 latency | TBD | 7d | TBD |
| Error rate, if applicable | Select and justify | Select | TBD |

## Monitoring
| Signal | Metric | Threshold | Alert |
|---|---|---|---|
| Traffic | requests/sec | baseline drift | warn |
| Latency | p95/p99 | threshold breach | page |
| Reliability | error ratio | threshold breach | page |
| Saturation | cpu/memory/queue depth | sustained high | page |

## Health Checks
- Liveness:
- Readiness:
- Dependency health:
- Synthetic transaction:

## Incident Response
- Detection:
- Triage:
- Mitigation:
- Communication:
- Post-mortem:

## Rollout Strategy
- Blue/green deployment:
- Canary release:
- Rolling update:
- Feature flags:

## Capacity Planning
- Traffic patterns:
- Resource utilization:
- Scaling triggers:

## Logging
Use `structlog` (or stdlib logging JSON formatter) with request_id, task_id, and outcome fields.

## Runbook
### Detect
- Signals that indicate the service/workflow is unhealthy:
- Dashboards, logs, and evidence locations:

### Triage
- First bounded checks:
- How to distinguish code, dependency, data, and capacity failures:
- Who owns the decision to continue, roll back, or stop:

### Mitigate and Recover
- Safe mitigation:
- Rollback or forward-fix trigger:
- Data repair/replay procedure:
- Verification required after recovery:

## Release and Migration Readiness
- [ ] Release artifact and schema versions are identified.
- [ ] A breaking change has an explicit migration trigger and agent instruction.
- [ ] Migration is idempotent and repeat-run behavior is tested.
- [ ] Backup, restore, rollback, and post-migration verification are documented.
- [ ] Rollout can be halted before the blast radius expands.

## Secrets Management
| Secret | Source | Rotation | Consumer |
|---|---|---|---|
| External service auth material | managed runtime configuration | periodic | runtime services |
| Artifact signing material | managed signing service/local secure store | periodic | release pipeline |

## Security Testing
| Test Type | Cadence | Tooling |
|---|---|---|
| SAST | each PR | language linters/scanners |
| Dependency scan | each PR + weekly | supply-chain tools |
| DAST/pentest | scheduled | external/internal |

## Trust-Boundary Inventory
| Boundary | Principal/Input | Authority Granted | Validation | Audit Evidence | Failure Default |
|---|---|---|---|---|---|
| User/agent -> entrypoint | | | | | deny/reject |
| Entrypoint -> core | | | | | deny/reject |
| Core -> persistence | | | | | fail closed/transaction rollback |
| Runtime -> external dependency | | | | | timeout/degrade |

## Agent and Automation Safety
- Prompt/configuration text is treated as untrusted input until evaluated by
  the repository's policy gate.
- Automation must not infer authorization, ownership, or a migration approval
  that is not present in the governed context.
- Sensitive artifacts, credentials, and untrusted attachments are not executed
  or imported as instructions.
- Every privileged mutation has an actor, scope, and durable evidence trail.

## Security Change Review
- [ ] New inputs and outputs are classified.
- [ ] Trust boundaries and privilege changes are documented.
- [ ] Abuse cases cover spoofing, tampering, disclosure, denial of service, and
  privilege escalation as applicable.
- [ ] Secret handling, redaction, retention, and deletion were re-checked.
- [ ] Supply-chain and provenance implications are recorded.

## Compliance and Audit
- Regulatory scope:
- Audit evidence location:
- Exception process:

## Pre-Promotion Security Checklist
- [ ] Threat model updated for changed surfaces.
- [ ] Auth/authz tests pass.
- [ ] Dependency vulnerability scan reviewed.
- [ ] No unresolved critical/high security findings.

<!-- decapod:capability-overlay:background-processing:start -->

Generated capability obligations: `background-processing` is declared for this project. These are decisions and proof requirements, not claims of implemented behavior. Resolve each against project source and tests; record unsupported or non-applicable mechanisms explicitly.

## Background Processing Operations Overlay

### Queue Visibility
- Queue depth, processing rate, and latency MUST be monitored
- If a dead-letter queue exists, define visibility and alerting obligations for it
- Worker health and processing rate metrics required

### Shutdown Behavior
- Graceful shutdown: stop accepting new work, finish current job
- Drain behavior and timeout MUST be selected for the deployment
- Termination and requeue behavior MUST be selected and proven for the deployment

### Worker Health
- Worker liveness and readiness probes
- Queue depth alerts for backpressure detection
- Processing latency percentiles (p50, p95, p99)
<!-- decapod:capability-overlay:background-processing:end -->

<!-- decapod:capability-overlay:persistent-state:start -->

Generated capability obligations: `persistent-state` is declared for this project. These are decisions and proof requirements, not claims of implemented behavior. Resolve each against project source and tests; record unsupported or non-applicable mechanisms explicitly.

## Persistent State Operations Overlay

### Backup & Recovery
- Backup scope, schedule, retention, and restore evidence MUST be selected for the project
- Recovery point objectives MUST be explicit project decisions, not assumed values
- Recovery time objectives MUST be explicit project decisions, not assumed values
- Restore verification cadence MUST be recorded with the operational proof plan

### Migration Operations
- All schema changes via migration files
- Migration rollback procedures documented
- Migration downtime and availability effects MUST be declared; zero downtime requires project-specific proof
- Migration health checks and rollback triggers
<!-- decapod:capability-overlay:persistent-state:end -->

