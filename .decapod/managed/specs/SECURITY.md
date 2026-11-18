# Security

## Public preview privacy guard

The existing offline Deno source check inspects public documents, linked local
styles/scripts and both browser entrypoints for known credential, merchant/catalog
identifier, private-key, credentialed database URI and machine-path shapes. Errors
never print matched data. It rejects known payment-host destinations and requires
no numeric price, placeholder money, Coming soon availability and disabled
purchase controls in the current comparison. The preview script may not introduce
network API calls. Generated synthetic rejection fixtures contain no real records.
These are scoped source checks; they do not prove complete secret-history absence,
rendered browser behavior, hosted payment or service authorization readiness.

The homepage and offering comparison contain public static content only. Local is free without signup. Cloud is a Coming soon preview: its native-disabled button has no checkout target or handler. No price or claim of current hosted activation is displayed. Benefits are explicitly planned for launch.

## Authorization
Public reading and local onboarding need no website login. Propodus independently enforces any future account, repository, paid-seat or exceptional governance access. Static labels confer no authority.

## Data Classification
Committed HTML, styles and assets are public. Credentials, Auth sessions, private logs, customer data and machine state remain outside Git. No Stripe product, price, merchant setting or operator override is created or changed.

## Threat Model
Premature sales claims and misleading enabled controls are the relevant preview risks. Visible Coming soon states, no public prices, a disabled purchase control and source/browser review bound them. The exact quickstart destination carries no credential or customer state. No new remote script, installer, runtime backend or website dependency is introduced.

Generated capability overlays below are obligations rather than evidence of a backend. Actual Supabase/Stripe authorization, recovery and payment acceptance remain independent Propodus proof gates.

<!-- decapod:capability-overlay:public-api:start -->

Generated capability obligations: `public-api` is declared for this project. These are decisions and proof requirements, not claims of implemented behavior. Resolve each against project source and tests; record unsupported or non-applicable mechanisms explicitly.

## Public API Security Overlay

### Authentication Requirements
- All public endpoints MUST validate authentication tokens
- Token validation MUST include expiry, revocation, and scope checks
- Anonymous access MUST be explicitly documented and justified

### Input Validation
- All request bodies MUST be validated against schemas
- Reject requests with unknown fields (strict schema validation)
- Size limits MUST be enforced on all request bodies

### Rate Limiting
- Limits and enforcement boundaries MUST be selected for this deployment
- Clustered enforcement behavior MUST be documented when applicable
- Client-visible throttling behavior MUST be part of the contract when applicable
<!-- decapod:capability-overlay:public-api:end -->

<!-- decapod:codebase-attestation:start -->

## Codebase Attestation

- Repository signal fingerprint: `d89a304b0ee71a412e228bbcdd654ef5f6c500603c9241116988da1fe9f10371`
- Significant implementation surfaces: `.github/` (1 files), `README.md/` (1 files), `main.js/` (1 files), `pricing.js/` (1 files), `scripts/` (3 files)
- Refreshed from the current codebase by `decapod rpc --op specs.refresh`
<!-- decapod:codebase-attestation:end -->
