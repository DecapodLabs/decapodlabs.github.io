# ADR 0004 — Official mascot and film playback controls

Status: **Source implemented; publication subject to the latest GitHub Pages build.**

## Decision

Use the original `assets/mascot.svg` for all three site brand placements: header, footer and architecture diagram. Keep the geometric lowercase `decapod labs` wordmark, but never introduce a second simplified crab mascot into the visible brand.

The film remains a silent, looping background animation by default, with a separate **Replay with sound** action. Add explicit **Pause/Play** and **Mute/Unmute** buttons to the film controls. Button text and accessible labels must reflect the actual HTMLMediaElement state. Muting must never inadvertently pause the video; pausing must never change the sound selection. Reduced-motion users get a paused film rather than forced autoplay.

## Acceptance

- Both header and footer use the approved mascot SVG.
- The video keeps muted autoplay, looping playback, accessible audio-on replay, and keyboard-operable toggle controls.
- Native controls remain available as a fallback if the browser rejects script-initiated playback.
- No changes to site claims, quick-start command, Nix link, documentation link, or product artwork.
- The generated Decapod validation workflow remains an explicit pending-permission item until it is installed by an authorized operator.

The site source and GitHub Pages deployment can be reviewed independently. This ADR is not a native validation receipt.
