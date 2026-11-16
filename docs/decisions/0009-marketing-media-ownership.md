# ADR 0009 — Marketing media source ownership

Status: Source transfer to this website repository. Generated output is independently verified by the website's media workflow.

The website is authoritative for Decapod Labs' brand film, mascot illustration, original score, and rendering pipeline. The source `scripts/render-showcase.py` uses `assets/mascot.svg`, renders the H.264/AAC product video, animated GIF, stationary end-card poster, transparent mascot PNG and circle-safe avatar. `scripts/generate-social.py` generates the favicon and social preview.

The existing GitHub Actions bootstrap workflow renders these assets from local sources, rather than downloading them from a candidate branch of the Decapod kernel. Its actual checks establish media duration, codec, GIF frame count and image dimensions. This removes the cross-repository bootstrap cycle. The website's regular static Pages deployment then publishes the generated media.

The Decapod kernel's independent PR consumes pinned, generated copies for README presentation and docs. Its CI workflow inventory must not be altered merely to publish marketing artwork.

Native `decapod init` remains part of this site's bootstrap. A successful initializer or media renderer is not standalone proof of kernel publication readiness.
