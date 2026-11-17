# Interfaces

index.html links to offerings.html from navigation and its highlighted hero entry. The dedicated document loads shared styles and committed assets without an application script. Its Get started links go to https://decapodlabs.github.io/decapod/quickstart.html. Cloud uses a disabled native button with an accessible availability description and a decorative Coming soon sticker; no anchor, form, click handler or purchase API is attached.

## Inbound Contracts
Public GET requests return static documents/assets. Existing homepage fragment and media/install controls remain intact. A future purchase integration requires a separate reviewed change and service acceptance.

## Outbound Dependencies
Local onboarding uses the exact public quickstart URL. Documentation, GitHub and existing public font links remain ordinary navigation/assets. The offerings page calls no Auth, checkout or payment API.

## Data Ownership
This repository owns presentation and brand media. Propodus owns identity, organizations, stable repositories, assigned seats, subscriptions and hosted Decapod database state. No customer state crosses this preview.

## Failure Semantics
An unavailable documentation link does not create an account, charge, grant, retry or backend fallback. Cloud remains visibly unavailable. Existing film/clipboard failure behavior is unchanged.

## Launch film and evidence interface

The source contract is decapod.agent-acceptance.v1, exported read-only by the Rust observer. Public sibling witnesses bind actual model requests, host execution, native check plans/observations/receipts and independent Git/GitHub identities by SHA-256. They do not import publication authority. Controls have decapod.post-run-controls.v1 with explicit controller ownership, real rejection codes and separate historical/current applicability.

The renderer requires an actually correlated autonomous arc and rejects missing controls or changed witness digests. Its decapod.launch-render.v1 output declares editorial scene text and source IDs alongside actual MP4/VTT hashes. Main and vertical durations are56 seconds; social is12. Native HTML video controls supply play/pause, mute, seek, fullscreen and optional captions, with playsinline, preload=none and no autoplay. Every narrative sentence is already visible for sound-off comprehension. No Cloud authorization call is introduced.

<!-- decapod:capability-overlay:public-api:start -->

Generated capability obligations: `public-api` is declared for this project. These are decisions and proof requirements, not claims of implemented behavior. Resolve each against project source and tests; record unsupported or non-applicable mechanisms explicitly.

## Public API Capability Overlay

### API Contract Requirements
- All public endpoints MUST define explicit request/response schemas
- Versioning strategy MUST be documented (URL path or header-based)
- All public endpoints MUST implement idempotency for mutating operations
- Rate limiting and pagination MUST be implemented for list endpoints

### Compatibility Guarantees
- Backward-compatible changes ONLY within a version
- Breaking changes require new version (v1, v2, etc.)
- Deprecation and removal policy MUST be selected for this project and proven against its consumers

### Security Requirements
- All public endpoints MUST implement authentication
- Abuse-control enforcement point MUST be a documented project decision
- Input validation MUST reject malformed requests with typed errors
<!-- decapod:capability-overlay:public-api:end -->

<!-- decapod:codebase-attestation:start -->

## Codebase Attestation

- Repository signal fingerprint: `3e28ff6b991360283d8d9eb0055d52dea2db533970f5a6e5d4c82f5c1a54104c`
- Significant implementation surfaces: `.github/` (1 files), `README.md/` (1 files), `evidence/` (1 files), `main.js/` (1 files), `scripts/` (7 files)
- Refreshed from the current codebase by `decapod rpc --op specs.refresh`
<!-- decapod:codebase-attestation:end -->
