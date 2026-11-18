# Operations

Publish the informational offerings page through the existing GitHub Pages main/root setup after exact-candidate governed validation. Rebase onto the latest accepted main and preserve other agents' design changes. Inspect actual Pages publication and both public documents; do not infer deployment from Git alone.

Cloud remains Coming soon, with benefits visible, prices absent and purchasing disabled. Enabling sales is a later change requiring a working approved Admin destination and real Auth, signed payment reconciliation and repository-specific activation evidence in Propodus. This preview does not change the Stripe catalog or merchant settings.

## Service Level Objectives
No new uptime, support, backup, launch date or recovery commitment is declared.

## Monitoring
Verify homepage navigation, the standalone offering page, the exact quickstart destination, responsive layout and actual disabled Cloud control. Existing media publication remains a separate workflow; it does not attest hosted payments.

## Incident Response
Repair or revert broken static navigation through governed Git. Keep purchasing disabled until separately authorized and verified. Propodus handles account/payment incidents; this site owns no customer records.

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

<!-- decapod:codebase-attestation:start -->

## Codebase Attestation

- Repository signal fingerprint: `d89a304b0ee71a412e228bbcdd654ef5f6c500603c9241116988da1fe9f10371`
- Significant implementation surfaces: `.github/` (1 files), `README.md/` (1 files), `main.js/` (1 files), `pricing.js/` (1 files), `scripts/` (3 files)
- Refreshed from the current codebase by `decapod rpc --op specs.refresh`
<!-- decapod:codebase-attestation:end -->
