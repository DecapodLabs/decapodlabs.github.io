# ADR 0001 — Decapod Labs organization landing page

Status: **Accepted intent; implementation and publication require verification**.

## Human request

Establish the organization's website at **https://decapodlabs.github.io/**, independent of the existing documentation project at **https://decapodlabs.github.io/decapod/**.

This is the Decapod Labs company/product homepage—not a docs portal, redirect, or an agent orchestration dashboard. A visitor should understand Decapod in seconds, see its official original kawaii-crab film, recognize the product's supported boundaries, and install/init once per project. Keep using existing AI coding agents.

## Decisions captured from discussion

1. Repository identity: `DecapodLabs/decapodlabs.github.io`, public, default branch `main`; Pages source `main/(root)`.
2. Documentation is a **link to** `https://decapodlabs.github.io/decapod/`. The landing page is independently published at the domain root.
3. A distinct, vibrant editorial style: coral/crab orange, apricot and cream; rich ink contrasts; large energetic typography; lovable original kawaii crab mascot; intentional motion.
4. Film: original 6.9-second MP4 + music; autoplay muted per browser requirements; a user-activated replay-with-sound control; end card holds on **DECAPOD / HARNESS AI / GitHub URL**.
5. Capability story: metacognitive governance, persistent state, enforced boundaries, commit-bound proof, and non-disruptive agent adoption. Do not imply that the kernel runs the agent or guarantees arbitrary correctness.
6. Quick-start command: `cargo binstall decapod && decapod init`. `decapod init` is **once per project/repository**. Include Nix distribution; defer Homebrew.
7. Keep public repository/media with the website. Preserve original SVG/PNG identity and link to GitHub, docs, research as appropriate.
8. Use the **actual Decapod CLI** to initialize the website repository and preserve governance state, not only a prose simulation of Decapod.

## Guardrails

- Local-first, repo-native, finite invocation; no agent-harness replacement.
- No external payment, database, telemetry, private credentials or unexpected third-party runtime permissions.
- No fabricated validation or claim of production cloud assurance.
- An ordinary GitHub Pages static site with accessible keyboard/motion behavior.
- Source assets must remain stable and auditable after vendor sync; do not depend permanently on an ephemeral feature branch.

## Falsifiable acceptance checks

- Domain-root GitHub Pages deployment serves `index.html`, not a 404 or redirect to docs.
- Top navigation and footer **Read the docs** links resolve to `https://decapodlabs.github.io/decapod/`.
- Site navigates on desktop and mobile without horizontal overflow.
- Silent video plays or displays poster, and sound requires deliberate user interaction.
- Command copy equals the documented Cargo+init command, and Nix guidance links to the supported flake.
- Image/video assets are checked in under `assets/` and verified nonempty with MIME/dimensions; mascot imagery matches the original approved Decapod artwork.
- Decapod version and `init` execution should be captured by a real CLI run; failed bootstrap remains unproven.
- GitHub Pages configured and deployed; a successful commit is not proof that the public domain serves the correct content.

## Open work

Verify the real Decapod bootstrap, media vendor sync, Pages publication, visual rendering, and links. No release/merge readiness claim until these finish.
