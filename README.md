# Decapod Labs — Official Website

This is the single-page Decapod landing page, published from the **organization-level** GitHub Pages repository:

**https://decapodlabs.github.io/**

It is separate from the [Decapod documentation](https://decapodlabs.github.io/decapod/), and it does not replace the open-source kernel at [DecapodLabs/decapod](https://github.com/DecapodLabs/decapod).

## Publication

GitHub Pages: Settings → Pages → **Deploy from a branch** → **main** → **/(root)** → Save.

The GitHub Pages domain is derived from the exact repository name `DecapodLabs/decapodlabs.github.io`. No DNS records or hosted service are required.

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

The reproducible media-sync workflow obtains the original Decapod film and mascot assets and vendors them under `assets/`.

## Distribution

- Cargo: `cargo binstall decapod && decapod init`
- Nix: [supported flake](https://github.com/DecapodLabs/decapod/blob/master/flake.nix)
- Homebrew is not yet offered.

## Governing development record

Decapod should be initialized **in this repository**, with the specific intent and the site acceptance checks preserved in `docs/decisions/` and in the generated `.decapod/` records. The initial bootstrap workflow downloads the official pinned Linux release, executes `decapod init`, and commits the resulting repository state. This is real CLI execution on a GitHub Actions checkout; it does not pretend to be a manually fabricated governance receipt.

See [site intent and acceptance](docs/decisions/0001-site-intent.md).