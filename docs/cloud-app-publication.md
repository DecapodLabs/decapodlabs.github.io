# Decapod Cloud Web Application Publication Model

`DecapodLabs/propodus` is the canonical source repository and release authority for all authenticated Decapod Cloud web applications served under `https://decapodlabs.ai`:

- `cloud-flow.js` (shared route validation, OAuth PKCE state hygiene, and runtime origin discovery)
- `signup/index.html`, `signup/signup.css`, `signup/signup.js` (Pricing -> Auth -> Repository Verification -> Automatic Subscription Review -> Checkout -> Ready workflow)
- `admin/index.html`, `admin/admin.css`, `admin/admin.js` (6-tab Organization Admin panel: Overview, Repositories, People, Billing, Usage, Settings)
- `404.html` (static GitHub Pages fallback & `/admin/<org>` client router)

## Publishing Signed Artifacts Here

The marketing repository hosts only compiled/published static files plus `cloud-app-manifest.json` generated directly from a clean commit on `DecapodLabs/propodus` (`portal/build-cloud-web.mjs`):

```bash
node ~/.local/share/propodus-runner-repo/portal/build-cloud-web.mjs .
```

The manifest records `source_revision`, `source_clean`, `asset_release`, and SHA-256 digests for all 8 published files. All internal application unit/security/degraded-availability suites run directly in `DecapodLabs/propodus` (`portal/app/tests/`). This repository retains `tests/publication_provenance_test.ts` to verify artifact integrity and `portal/verify-cloud-web-publication.mjs` to attest live deployment parity on `https://decapodlabs.ai`.
