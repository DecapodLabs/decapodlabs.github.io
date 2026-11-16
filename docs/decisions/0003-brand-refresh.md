# ADR 0003 — Decapod Labs wordmark and editorial cut

Status: **Applied; static source review complete. Public deployment still requires independent Pages success.**

## Decision

The Decapod Labs website remains a single-page, independent organization homepage at `https://decapodlabs.github.io/`. Use a restrained, original lowercase geometric wordmark (**decapod** in ink, **labs** in coral) beside a small custom crab mark inspired by the existing mascot. This retains the warm kawaii visual identity while giving the company a stronger, more mature, technology-company signature. The source is an editable SVG mark and typeset, accessible HTML text—not a reused third-party brand mark.

## Editorial scope

The film is the content. Cut all self-referential copy about running time, video resolution, production score, narrative chapters, and the presentation itself. Keep the interactive replay-with-sound control. The live page must communicate only the problem, product, supported capabilities, adoption workflow, and calls to action.

Headline: **Harness AI.**

Product: A repo-native metacognitive governance kernel.

Proof: Persistent state, enforced boundaries, and commit-bound proof. Initialize once per project, keep using existing agents.

## Acceptance checks

- Original Decapod film and mascot remain unchanged.
- The small crab icon is original SVG; header and footer show the same lowercase branded wordmark.
- Full site continues to serve at the organization Pages root; documentation link targets `/decapod/`.
- The film retains the muted autoplay and deliberate sound-on behavior; native autoplay constraints remain respected.
- The install copy button continues to copy the exact supported Cargo command; Nix remains linked, Homebrew unadvertised.
- Desktop displays four distinct feature cards in one row, mobile adapts without horizontal overflow.
- No simulated governance result, fake production assurance or invented validation receipts.
- The existing `.decapod/` record from real `decapod init` remains intact; the separate generated-workflow permission gate remains open, not claimed solved.

## Verification

This ADR records the human design direction and source changes. It is not a current Decapod validation receipt. Confirm the GitHub Pages deployment and visual presentation independently.
