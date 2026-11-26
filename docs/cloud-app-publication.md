# Decapod Cloud Web Presentation Publication Model

This public repository serves strictly static marketing pages, public documentation, and compiled browser presentation bundles for Decapod Cloud under `https://decapodlabs.ai`:

- `shared/commercial-ui.css` and `assets/fonts/*` (self-hosted SIL OFL 1.1 Geist Sans and Geist Mono)
- `pricing.html`, `pricing/index.html`, `pricing.css`, `pricing.js` (public Decapod Cloud purchasing & Decapod Local free option)
- `cloud-flow.js`, `signup/*`, `admin/*`, `404.html` (browser presentation bundles synced cleanly from upstream release builds)

Authenticated application logic, unit/integration suites, service configuration, and live infrastructure verification remain outside this public repository. This repository retains `tests/publication_provenance_test.ts` to verify SHA-256 digest integrity against `cloud-app-manifest.json`.
