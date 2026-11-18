# Interfaces

## Current comparison preview and source boundary

The homepage links to canonical `pricing.html`; legacy `offerings.html` redirects there.
The current page loads `pricing.css` and `pricing.js` and shared public assets. Its
sliders calculate illustrative assignment counts and non-binding percentages,
with monetary output held at `$X`. Local navigation uses the exact public quickstart;
Cloud and preview checkout are native-disabled Coming soon buttons. No checkout,
Auth, provider provisioning, entitlement or monetary calculation is performed.
The existing Deno source command now qualifies all three documents and both
browser scripts. Public design and copy are unchanged by this check-only update.

index.html links to pricing.html from navigation and its highlighted hero entry. The dedicated document loads shared styles and committed assets with the illustrative pricing.js preview script. Its Get started links go to https://decapodlabs.github.io/decapod/quickstart.html. Cloud uses a disabled native button with an accessible availability description and a decorative Coming soon sticker; no anchor, form, click handler or purchase API is attached.

## Inbound Contracts
Public GET requests return static documents/assets. Existing homepage fragment and media/install controls remain intact. A future purchase integration requires a separate reviewed change and service acceptance.

## Outbound Dependencies
Local onboarding uses the exact public quickstart URL. Documentation, GitHub and existing public font links remain ordinary navigation/assets. The offerings page calls no Auth, checkout or payment API.

## Data Ownership
This repository owns presentation and brand media. Propodus owns identity, organizations, stable repositories, assigned seats, subscriptions and hosted Decapod database state. No customer state crosses this preview.

## Failure Semantics
An unavailable documentation link does not create an account, charge, grant, retry or backend fallback. Cloud remains visibly unavailable. Existing film/clipboard failure behavior is unchanged.

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

- Repository signal fingerprint: `d89a304b0ee71a412e228bbcdd654ef5f6c500603c9241116988da1fe9f10371`
- Significant implementation surfaces: `.github/` (1 files), `README.md/` (1 files), `main.js/` (1 files), `pricing.js/` (1 files), `scripts/` (3 files)
- Refreshed from the current codebase by `decapod rpc --op specs.refresh`
<!-- decapod:codebase-attestation:end -->
