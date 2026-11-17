# Decapod Labs — Official Website

This is the Decapod homepage and Local + Cloud offering comparison, published from the **organization-level** GitHub Pages repository:

**https://decapodlabs.github.io/**

It is separate from the [Decapod documentation](https://decapodlabs.github.io/decapod/), and it does not replace the open-source kernel at [DecapodLabs/decapod](https://github.com/DecapodLabs/decapod).

## Publication

GitHub Pages: Settings → Pages → **Deploy from a branch** → **main** → **/(root)** → Save.

The GitHub Pages domain is derived from the exact repository name `DecapodLabs/decapodlabs.github.io`. No DNS records or hosted service are required.

The [offerings page](https://decapodlabs.github.io/offerings.html) shows free local use without signup and planned Cloud benefits. Cloud is Coming soon: no public prices or active purchase link are published. Get started goes directly to the Decapod quickstart.

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