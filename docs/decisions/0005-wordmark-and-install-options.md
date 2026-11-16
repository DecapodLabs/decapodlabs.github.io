# ADR 0005 — Wordmark-only masthead and Cargo/Nix installation tabs

Status: Source implemented. Publication pending GitHub Pages verification.

## Decision

The site header and footer use the **decapod labs** lowercase wordmark with no miniature crab attached. The approved kawaii Decapod mascot remains prominently in the hero and product visuals, and the original mascot SVG remains in the architecture diagram. This eliminates the mismatched repeated small-crab treatments while retaining a single brand identity.

The installation panel uses two tabs, **Cargo** and **Nix + Cachix**, sharing one code surface and copy button. Cargo stays the default; switching options changes the visible, exact command and copied text together.

## Commands

Cargo:
```sh
cargo binstall decapod && decapod init
```

Nix (requires Nix with flakes):
```sh
nix run nixpkgs#cachix -- use decapod &&
nix profile install github:DecapodLabs/decapod &&
decapod init
```

Cachix’s documented `use` action configures the `decapod` binary cache. The upstream Decapod `flake.nix` defines `packages.default`. A binary-cache hit is contingent on the selected store path already existing in that cache; this UI does not claim every platform or candidate is prebuilt. The Nix CLI requirements and any machine-level Nix configuration permissions remain the user’s responsibility.

The docs link is still `https://decapodlabs.github.io/decapod/`; Homebrew remains unavailable and is not advertised.

## Acceptance

- Header and footer are text-only; no dead-end image or different crab.
- Hero remains the approved official mascot, film and audio controls unchanged.
- Both install tabs are keyboard accessible and expose `aria-pressed` correctly.
- Copy reads the current tab state, not an unrelated fixed Cargo command.
- The Nix path configures the named Cachix cache before installing Decapod from its GitHub flake.
- No unsupported assurance claim or pretend validation receipt is added.
