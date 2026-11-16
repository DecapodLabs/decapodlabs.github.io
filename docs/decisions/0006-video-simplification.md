# ADR 0006 — Let the product video stand alone

Status: Site source changed; GitHub Pages deployment is a separate acceptance check.

## Decision

The short Decapod video remains on the company homepage as a quiet, looping visual, without presentation commentary, section labels, timestamps, runtime specifications, video controls, dedicated navigation links, or a hero call-to-action directing visitors to it.

The product messaging now points straight to installation. The video has no buttons, redirects, or caption-like explanation on the page. It plays silently by default and uses the existing poster if playback is unavailable. Respect visitors who prefer reduced motion by leaving the video paused.

The approved original media, the independent company landing page, the lowercase wordmark, mascot art elsewhere on the page, Cargo and Cachix/Nix installation options, and the separate /decapod/ docs link are unchanged.

## Acceptance

- No site anchor points to #film, and the video section contains only the media container.
- No exposed play, replay, sound, pause, or mute controls for the video.
- The video element remains muted, looped, inline, and backed by its static poster.
- The install call-to-action stays visible, without a competing media CTA.
- The active GitHub Pages commit serves the revised HTML, JavaScript, and CSS.
- No change here supplies Decapod full-validation evidence or permission to install its previously blocked generated workflow.
