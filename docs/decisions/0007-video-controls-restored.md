# ADR 0007 — Restore the product video's full presentation

Status: Authored change on website main; deployment confirmation is independent.

## Human decision

Keep the large **Meet the kernel.** editorial heading alongside the Decapod product video, and restore three video controls: **Replay with sound**, **Pause/Play** and **Mute/Unmute**. The visitor should be able to interact directly with the video while the homepage retains its restrained product narrative.

Do not add a video navigation link, a "See the film" hero CTA, runtime metrics, video production commentary, or other prompts directing visitors to the video. The video already earns its space visually. Preserve the approved lowercase Decapod Labs wordmark, kawaii mascot, all feature copy, Cargo/Cachix installation options, and documentation URL.

## Acceptance

- The video section places "Meet the kernel." next to the MP4 at desktop widths; on small screens the heading stacks above the video.
- Video retains muted, inline, looping autoplay where browser and motion preferences allow.
- Replay explicitly starts the video from the beginning with sound following user input.
- Pause/Play updates the actual playback state; Mute/Unmute updates the actual muted state. Accessible labels follow each state.
- No anchor links to a video section and no video CTA outside the video section.
- No changes to GitHub Pages repository identity, source video bytes, installed Decapod governance, or product claims.
- GitHub Pages build must succeed on the exact published commit.
