# Decapod Labs — Official Website

This is the Decapod homepage and pricing preview, published from the **organization-level** GitHub Pages repository:

**https://decapodlabs.ai/**

It is separate from the [Decapod documentation](https://decapodlabs.ai/decapod/), and it does not replace the open-source kernel at [DecapodLabs/decapod](https://github.com/DecapodLabs/decapod).

## Publication

GitHub Pages: Settings → Pages → **Deploy from a branch** → **main** → **/(root)** → Save.

The canonical public domain is `https://decapodlabs.ai`, configured by `CNAME` on the organization-level GitHub Pages repository. The `decapodlabs.github.io` hostname remains the hosting origin and redirects to the custom domain.

The [pricing page](https://decapodlabs.ai/pricing) presents both Decapod Local (`Free forever` offline governance kernel without signup) and Decapod Cloud (`$50`/contributor/repository/month, or `$552`/contributor/repository/year billed upfront with verified multi-seat/multi-repo volume tiers). The former `/offerings.html` path is a noindex redirect to `/pricing.html`.

Commercial interactive application source, tests, and service orchestration are maintained outside this public repository; this repository publishes static site pages and compiled browser presentation bundles (`cloud-app-manifest.json`).

The [Clack download page](https://decapodlabs.ai/clack/) links to the published Apple silicon DMG, its SHA-256 checksum, and release notes.

## Local development

```sh
python3 -m http.server 8080
# http://localhost:8080
```

The page uses plain HTML/CSS/JavaScript. No package manager, runtime backend, SaaS dependency or JavaScript build chain is required. Animation respects reduced-motion settings. The film plays silently until a visitor explicitly requests audio.

## Design and product intent

Decapod Labs is an engineering infrastructure company. Decapod is a local-first, daemonless, repo-native **governance kernel** invoked by AI coding agents, not a coding agent or a manual human workflow. The homepage emphasizes metacognitive reflection, durable project state, governed scope/authority, and evidence attached to the specific work being delivered.

The human initializes once per repository, then keeps working through their existing coding agents.

The canonical product contract and assurance limits are in [the kernel's README](https://github.com/DecapodLabs/decapod/blob/master/README.md) and [specifications](https://github.com/DecapodLabs/decapod/tree/master/.decapod/managed/specs). Marketing must not imply universal sandboxing, a semantic correctness oracle, or completed hosted-cloud assurance.

**The website owns Decapod's brand media sources.** The original
[renderer](scripts/render-showcase.py), [editable mascot](assets/mascot.svg),
and [render workflow](.github/workflows/site-bootstrap.yml) live here. The
workflow generates the film, GIF, poster, mascot exports and social graphics
into `assets/` and verifies those artifacts before publication.

The [Decapod kernel](https://github.com/DecapodLabs/decapod) vendors a
reviewed subset of the generated files for its README and documentation.
The kernel does not own a second marketing renderer or a separate media
publishing workflow.

## Distribution

- Cargo: `cargo binstall decapod && decapod init`
- Nix: [supported flake](https://github.com/DecapodLabs/decapod/blob/master/flake.nix)
- Homebrew is not yet offered.

## Governing development record

**Initialized and committed.** The [successful bootstrap run](https://github.com/DecapodLabs/decapodlabs.github.io/actions/runs/43792365844) downloaded the checksum-verified official Decapod v0.148.0 Linux release and executed `decapod init` inside this repository's checked-out workspace. The [generated `.decapod/` governance files](.decapod/) and [agent entrypoints](AGENTS.md) are real CLI output, committed together with the verified original film, mascot, poster and social graphics in [commit ba856780](https://github.com/DecapodLabs/decapodlabs.github.io/commit/ba856780bd1fd52b5821778bb4e06ee303ea0f46).

**Open assurance item:** Decapod also generated a validation workflow, but the GitHub App's token was refused permission to create a new workflow. The [exact generated workflow was preserved for review](docs/decisions/bootstrap/decapod-validate.workflow.txt) and the [installation gap](docs/decisions/0002-workflow-installation-pending.md) is explicitly recorded. Decapod initialization is not evidence of validation passing or of live-site behavior.

The source intent and acceptance criteria are in [the site decision record](docs/decisions/0001-site-intent.md).

See [site intent and acceptance](docs/decisions/0001-site-intent.md).
The film’s single Pi engineering objective was selected by the controller under the human-authorized launch mission. Its separately pinned [provenance disclosure](evidence/pi-1758-20261117-01/objective-provenance.json) distinguishes that selection from direct human prompt authorship, while the actual capture records zero subsequent input and no controller repair.

## Search and agent discovery

Public pages use canonical `https://decapodlabs.ai` URLs. `sitemap.xml` lists seven canonical public entrypoints, including the documentation root; the documentation repository owns its generated chapter pages. `robots.txt` excludes account and transaction routes from cooperative crawling. Existing application `noindex` metadata and server authorization remain separate controls; robots rules alone do not remove a URL from a search index.

`llms.txt` is a concise public agent navigation index, discoverable from the homepage footer and `rel="describedby"` metadata on website-owned public pages. It grants no account authority and makes no indexing or ranking promise. Cloudflare Search for Agents and any content conversion are managed zone features whose operation must be verified independently; no search backend or claim of availability is added by these static files.

SEO changes to `pricing.html`, `pricing/index.html`, Signup, Admin, or other files listed in `cloud-app-manifest.json` must be authored and republished from Propodus. Preserve their published bytes and provenance here.
