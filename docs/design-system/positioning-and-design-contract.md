# Decapod Labs — Positioning Brief & Cross-Surface Design System Contract

**Status:** Design Studio Uplift Baseline (`#103`, `#104`, `#106`, `#1977`, `#1978`, `#278`, `#279`, `#280`)  
**Date:** November 27, 2026  
**Baseline Reviewed:** `DecapodLabs/decapodlabs.github.io@a7abd8d6`, `DecapodLabs/decapod@74ecb590`, `DecapodLabs/propodus@56027af3`

---

## 1. Concise Positioning Brief

- **Primary Audience:** Technical founders, staff/senior engineers, and small engineering teams already using CLI/IDE coding agents (Codex, Claude Code, Cursor, Antigravity, Pi) who are tired of agent drift, repeated babysitting, lost context between sessions, and unverified "done" claims.
- **Job to Be Done:** Delegate multi-step, non-trivial engineering work to existing coding agents while keeping explicit intent, clean branch/worktree isolation, multi-agent coordination, and inspectable exact-commit evidence across sessions.
- **Category:** Local-first, agent-agnostic, daemonless **governance kernel** (with optional Cloud custody and team controls).
- **Practical Benefit:** Keep your chosen coding agents; Decapod gives them durable task ownership, scoped repository boundaries, structured recovery when checks fail, and completion verdicts backed by checks bound to the exact candidate commit and accepted base.
- **Core Emotional Relief:** Move from *continuous rework and distrustful manual supervision* (`tecr.html`) to *calm, inspectable control*.
- **Supporting Evidence (Observed, Not Fabricated):**
  - **Recorded Pi `0.73.1` + Decapod `0.148.8` Run (`/proof.html` & `evidence/pi-1758-tui-06/`, `evidence/pi-1758-20261117-01/`):** Shows one objective, an actual `authorization-contract` failure (`exit 1` on commit `ed086de6`), agent-authored repair, fresh 2/2 check validation (`a063de90`), GitHub PR #7 creation, and separate operator-run stale-proof rejections (`WORKUNIT_PROOF_STALE`, `STALE_ACCEPTED_BASE`).
  - **Deterministic Verification Suites:** Offline `scripts/check-site.ts`, `scripts/check-launch.ts`, `tests/provenance_projection_72_test.ts`, and `tests/trust_privacy_contract_test.ts` on the static site; `tests/doc_alignment.rs` and Rust validation tests in `DecapodLabs/decapod`; Deno/Node/Go suites in `DecapodLabs/propodus`.
- **Explicit Boundaries of the Promise:**
  - **Not a universal OS sandbox:** Enforces repository/workflow/custody boundaries and surfaces proof obligations; host security still relies on configured containers/OS permissions.
  - **Not a semantic correctness oracle:** Proves that configured, reviewed checks actually executed cleanly against the exact candidate and accepted target; it does not magically judge unconfigured business logic.
  - **Not guaranteed autonomous perfection:** Failures are surfaced honestly with structured recovery guidance (`reflect`, revalidate, or fail closed for human authority).
  - **Admission != Merge Authority:** A validated PR receipt proves readiness at that commit and target; human/branch policy retains merge control, and any later source or base change invalidates stale receipts.
  - **Metacognition Identity in Context:** Kept intact ("Harness AI Metacognition") as the underlying philosophy—agents checking their own intent, assumptions, boundaries, and proof before claiming completion—while leading first-time visitors with concrete workflow relief first.

---

## 2. Bounded Reference & First-Party Observation Review

*Methodology note: All observations below come from direct inspection of live public pages, source repositories, and expert design-studio audit on November 27, 2026. No external usability participants, invented customer quotes, conversion lifts, or customer logos are cited.*

### Observed Facts Across Existing Surfaces (`a7abd8d6` / Pre-Uplift)

1. **Homepage (`/`):** Opened immediately with `"HARNESS AI METACOGNITION."` and a heavy mechanism paragraph before explaining what a user gets out of it; placed the real Pi terminal proof video ~7,434px down the page after film, Waystead key art, a 7-slide game carousel, a 3-slide Ghostty carousel, feature cards, a 14-card capability grid, and an architecture diagram.
2. **Documentation (`/decapod/`):** Suffered from an external Google Fonts link, a sticky `#menu-bar` overlapping anchored headings (`scroll-margin-top` missing), low-contrast `pre > code` rendering (`#fff1e7` text on `#f6f7f6` background in light themes), and a dense `quickstart.md` mixing human quick-start with low-level agent choreography.
3. **Proof & Trust (`/proof.html`, `/trust/`):** Contained real, cryptographically bound records and clear trust commitments, but presented multiple runs, raw witness file links, and endpoint tables in flat walls of text/links without an upfront narrative or reader-question index.
4. **Cloud Commerce (`Propodus` — `/pricing`, `/signup`, `/admin`):**
   - Pricing configurator defaulted to `2 repos × 5 users = $490/mo` even though V9 base unit pricing is `$50/mo` (`$552/yr`).
   - Admin Overview/Usage could render missing or failed `limitsSnapshot` payloads as `"Healthy / All metrics within included limits"` instead of an explicit unavailable/stale observation state.
5. **External Reference Benchmark (`https://ai-openshell.github.io/website/`):** Observed clean sticky navigation bar, prominent search trigger, focused central prose measure (`~70ch`), left chapter sidebar with active highlight, and a persistent right-hand `"On this page"` outline. Decapod adopts these reading-shell ergonomics while preserving Decapod's Warm Cream (`#fff9f0`) / Espresso (`#17131a`) / Coral (`#f05b37`) editorial craft.

### Adoption Objections & Open Hypotheses (Explicitly Untested Without External Users)

| Potential Objection / Friction | Design Response | Remaining Untested Hypothesis |
| --- | --- | --- |
| *"Is this yet another coding agent that replaces Claude/Codex?"* | Lead hero with `"Keep your coding agents"` and clear agent-invoked diagram (`You -> Your Agents -> Decapod`). | Hypothesis: Leading with agent preservation reduces bounce among committed Cursor/Claude Code users. |
| *"Why trust an agent's 'done' claim?"* | Move the recorded Pi failure -> repair -> fresh-check proof immediately after the hero and add a 5-step story to `/proof.html`. | Hypothesis: Upfront proof + explicit stale-receipt behavior builds technical credibility faster than capability lists. |
| *"Wait—do I have to pay $50+ just to try it locally?"* | Explicitly state **Decapod Local is free forever with zero signup** in Hero, Pricing, and Docs; explain why Cloud is `$50/mo` (`$552/yr`, starting configurator at `1 × 1 = $50/mo`). | Hypothesis: `1 × 1 = $50/mo` framing + unlimited agents/devices (`$0` extra) clarifies team Cloud entry without mispricing local use. |
| *"What stops Cloud / docs from leaking code or keys?"* | Reorganize `/trust/index.html` around concrete Q&A ("What stays local? What does Cloud send? How is access revoked?"). | Hypothesis: Question-led progressive disclosure improves comprehension vs flat contract tables. |

---

## 3. End-to-End User Journeys

### Journey A: Local Evaluation -> First Governed Result

1. **Evaluate Promise (`/`):** Visitor lands on Warm Cream hero, grasps outcome ("delegate coding work, keep boundaries and exact-commit proof"), and sees `cargo binstall decapod && decapod init` (`Cargo` / `Cargo locked` / `Nix + Cachix`).
2. **Verify Reality (`/#proofs` -> `/proof.html`):** Visitor scans the immediate Pi `0.73.1` failure-repair-validation preview (text steps + captioned terminal recording) and optionally inspects exact receipts/hashes on `/proof.html`.
3. **Read & Initialize (`/decapod/quickstart.html`):** Visitor confirms prerequisites (`cargo-binstall` vs `cargo install --locked` or Nix), runs `decapod init` once in a repository.
4. **Delegate & Inspect First Result:** Visitor gives their existing coding agent a bounded task; the agent calls Decapod (`session`, `todo`, `workspace`, `validate`) and returns commit-bound check evidence cleanly separated from merge authority.

### Journey B: Cloud Evaluation -> Purchase -> Returning Administrator

1. **Evaluate Cloud (`/` -> `/pricing`):** Team lead sees when Cloud helps (shared custody, team roster, host repo access without artificial local limits) and opens Pricing.
2. **Configure (`#278` — `/pricing`):** Sees `$50/mo` (`$552/yr`, 8% annual savings) per human-repository unit; configurator starts at **`1` repo × `1` user = `$50/mo`** (unlimited agents, worktrees, and enrolled devices at `$0` extra; automatic overages default-OFF `$0`), preserving `?repo=owner/name` intent.
3. **Activate (`#279` — `/signup`):** Calm 5-stage sequence: `1. Sign in (GitHub)` -> `2. Connect repositories` -> `3. Review authoritative quote` -> `4. Confirm in Stripe Checkout` -> `5. Verified readiness & return to originating agent`. Every intermediate/error state (`confirming`, `verifying`, `canceled`, `expired`, `denied`, `outcome-unknown`) remains distinct with zero duplicate-charge ambiguity.
4. **Return to Operate (`#280` — `/admin`):** Team administrator opens `/admin`, checks 6 scannable sections (`Overview`, `Repositories`, `People`, `Billing`, `Usage`, `Settings`) with clear `purchased / assigned / available` capacity counts and honest usage telemetry (`loading / unavailable / stale / action_needed / measured_healthy`—never faking `"Healthy"` on missing/failed snapshots).

### Pricing & Future Packaging Scope Note (`propodus#184`)

- Live commercial unit pricing remains fixed at **`$50/month` (`$552/year`, 8% annual discount)**. The `#278` configurator overhaul starts sliders and paired numeric inputs at **`1` repo × `1` contributor = `$50/mo`** anchored on four verifiable value pillars:
  1. **Unlimited AI Agents, `$0` Extra Agent Seats:** Connect Claude, Codex, Gemini, parallel worktrees/subagents, and enrolled devices with zero per-agent seat tax.
  2. **Durable Multi-Agent Custody, Not Continuous Rework:** Shared Cloud custody, repository-bound living specs, and commit-bound receipts prevent multi-agent workspace collisions and state drift.
  3. **Zero Surprise Overages & Hardware-Bound Security:** Ed25519/DPoP device signing, org/repo access fencing, and default-OFF paid overages (`$0` automatic overage bills).
  4. **Decapod Local Stays `$0` Forever:** Full open-source CLI/binary workflow for solo local work remains completely free with no signup; Cloud charges only when teams share durable cloud custody.
- Exploration of lower-quota entry tiers or utilization-based expansion packs remains tracked separately as an out-of-scope future catalog direction under `propodus#184`.

---

## 4. Shared Visual & Interaction Contract

### 4.1 Self-Hosted Typography
- **Typefaces:** `Geist` (`assets/fonts/Geist-Variable.woff2`, weights `100–900`) for UI & headings; `Geist Mono` (`assets/fonts/GeistMono-Variable.woff2`) for commands, hashes, code, and tabular metrics (`OFL-LICENSE.txt`). Zero external font CDNs.
- **Scale & Measure:**
  - Body default: `16px` (`1rem`, minimum `16px` across prose and docs; secondary metadata `13px–14px`).
  - Readable measure: `60ch–72ch` for editorial/docs/trust prose.
  - Display headings: tight negative tracking (`-0.04em` to `-0.055em`), `line-height: 0.96–1.08`.
  - Numeric alignment: `font-variant-numeric: tabular-nums` on step counts, timestamps, metrics, and prices.

### 4.2 Color Palette & Semantic Roles
Matches `shared/commercial-ui.css` (`propodus` bundle) and root site tokens:
- **Canvas & Surfaces:**
  - `--bg: #fff9f0` (Warm Cream page canvas)
  - `--surface: #fffdfa` (Primary card surface)
  - `--bg-subtle: #fff1e0` (Warm Milk section/highlight surface)
  - `--bg-muted: #f7e4cd` (Muted warm wash)
- **Ink Hierarchy:**
  - `--fg: #17131a` (Espresso primary ink, `>= 14:1` on cream/paper)
  - `--fg-secondary: #29212c` (Secondary headings / strong body)
  - `--fg-muted: #5c4e53` (Body captions & labels, `>= 6.5:1` on cream)
- **Brand Accents:**
  - `--accent: #f05b37` (Decapod Coral — brand highlights, dark-mode fills, active buttons)
  - `--accent-ink: #b93c1b` (Accessible Coral ink on light surfaces `>= 4.5:1`)
  - `--sun: #ffc65b` (Sun Gold focus highlights & warm chips)
  - `--pink: #ffbed0` (Rose accent)
- **Strict State Tokens:** Success (`#0f766e` / `#f0fdfa`), Warning (`#92400e`), Danger (`#dc2626` / `#fef2f2`), Info (`#1d4ed8` / `#eff6ff`). Never use green/red purely decoratively.

### 4.3 Borders, Spacing, Focus, Motion & Clack Mascot Scale
- **Spacing Scale:** `4px / 8px` multiples (`4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 88`).
- **Borders & Elevation:** Crisp hairline borders `1px solid rgba(53, 39, 43, 0.14)` (interactive hover `.28–.44`), restrained ink shadows (`0 4px 14px rgba(23, 19, 26, 0.06)`), zero muddy drop-shadows.
- **Focus & Reduced Motion:** Global `:focus-visible { outline: 3px solid #f05b37; outline-offset: 3px; }` (`#ffc65b` on dark panels). `@media (prefers-reduced-motion: reduce)` disables levitation, reveals, and smooth-scroll jumps.
- **Clack Mascot Role & Scale per Surface:**
  - **Marketing Hero (`/`):** Hero right-column protagonist (`assets/mascot-github-avatar.png`, bounded `min(420px, 34vw)`) anchored inside the warm sunburst—keeps the hero crisp above the fold without crushing text or install controls.
  - **Diagram / Navigation / Cloud Chrome:** Small crisp crab mark (`assets/mascot.svg` at `28px–34px`) representing the governance kernel unit or wordmark badge.
  - **Documentation (`/decapod/`):** Compact header emblem only (`24px–28px`), zero decorative floaters competing with reading prose.
  - **Clack Product Page (`/clack/`):** Product hero character in Siltwick context (`/assets/mascot.svg` + Siltwick gameplay screenshots).

### 4.4 Shared Navigation Chrome & Pinned Footer Contract
- **Sticky Header (`.nav`):**
  - Left: `Decapod Labs` brand mark (`logo-a.png` on cream surfaces, `logo-c.png` on dark `/clack/`).
  - Center links: `Docs` (`https://decapodlabs.ai/decapod/`), `Proof` (`/proof.html`), `Pricing` (`https://decapodlabs.ai/pricing`), `Rework` (`/tecr.html`), `Clack` (`/clack/index.html`), `Trust` (`/trust/index.html`). Active route marked with `aria-current="page"`.
  - Right CTA pill: `GitHub ↗` (`https://github.com/DecapodLabs/decapod`).
  - Responsive behavior: Below `960px`, links wrap neatly onto row 2; below `540px`, cleanly spaced 3-column grid; `html { scroll-padding-top }` scales cleanly (`100px` desktop -> `140px` tablet -> `168px` narrow mobile) so `#fragment` anchors are never hidden behind the sticky bar.
- **Proportionate Pinned Footer (`.site-footer-pinned > .footer`):**
  - Preserves pinned bottom-bar visibility (`position: fixed; inset-inline: 0; bottom: 0; z-index: 80;`) while constraining height (`padding: 12px 0` desktop) and reserving proportional `padding-bottom: calc(var(--site-footer-reserve) + env(safe-area-inset-bottom, 0px))` (`88px` desktop, `120px` tablet, `154px` mobile) on `body.site-footer-pinned` so no button, link, modal footer, or legal line is ever clipped underneath. Automatically becomes `position: static` in `@media print`.

---

## 5. Cross-Repo Versioning & Propagation Protocol

| Surface | Owning Repository | Canonical CSS / Tokens | Build / Publication Mechanism |
| --- | --- | --- | --- |
| Public Marketing, Proof, Trust, Rework, Clack Download | `DecapodLabs/decapodlabs.github.io` | `/styles.css` (`@font-face Geist`, `:root` tokens, `.nav`, `.footer`) | Direct static files verified by `scripts/check-site.ts` & `tests/*.ts`. |
| Documentation (`/decapod/`) | `DecapodLabs/decapod` | `docs/book/src/custom.css`, `docs/book/theme/index.hbs`, self-hosted `theme/fonts/` | `mdbook build docs/book` + `assets/tools/docs_seo.py` deployed via `Deploy Docs` workflow; matches exact `--ds-*` hex palette and header links. |
| Cloud (`/pricing`, `/signup`, `/admin`, `/404.html`) | `DecapodLabs/propodus` | `portal/app/shared/commercial-ui.css` (`ASSET_RELEASE` pinned) | `node portal/build-cloud-web.mjs` outputs deterministic static assets + `cloud-app-manifest.json` SHA-256 manifest copied into `decapodlabs.github.io` and verified by `tests/publication_provenance_test.ts`. |

**Governance Rule:** No Vite/React/Next framework migration and no second copy of commercial quote/checkout/auth logic. CSS custom properties share identical hex/font definitions across the three owners, and `ASSET_RELEASE` / `styles.css?v=...` query stamps bump intentionally per coordinated uplift.

---

## 6. Attention-Order Matrices & Annotated Compositions

### 6.1 Surface Attention Order

| Surface | Primary Question Answered | Visual Priority 1 | Visual Priority 2 | Visual Priority 3 | Principal Next Action |
| --- | --- | --- | --- | --- | --- |
| **Marketing Hero & Above-Fold (`/`)** | *What does Decapod do for my agents, and how do I start?* | Practical value headline + concise explanation | Dominant local install command box (`Cargo binstall` / `Cargo` / `Nix`) | Proportionate Clack mascot + secondary `"Inspect recorded Pi proof"` link | Copy local init command (`decapod init`) |
| **Immediate Proof Section (`/#proofs` & `/proof.html`)** | *Did this actually work on a real coding task?* | 5-step / 3-beat narrative (fail -> repair -> fresh check -> PR) | Recorded Pi terminal / case-study player + captions | Verbatim evidence receipt/commit table & assurance boundaries | Inspect receipt/PR (`proof.html`) or initialize locally |
| **Documentation (`/decapod/`)** | *How do I get my first governed result?* | Crisp centered chapter (`68ch–72ch`) with readable code blocks | Left chapter nav + Top bar w/ Search trigger | Right-rail `"On this page"` outline + `"Copy for agent"` | Follow Quickstart (`decapod init`) & prompt existing agent |
| **Trust (`/trust/index.html`)** | *What leaves my machine vs stays local?* | Reader Q&A quick-jump summary (Local vs Cloud vs Providers vs Revocation) | Contract version + 9 permanent trust invariants | Collapsible endpoint/relay detail tables | Verify local zero-egress boundary or open Security Advisories |
| **Pricing (`/pricing`)** | *When should my team pay for Cloud, and what does it cost?* | Cloud value + **`$50/mo` (`$552/yr`)** per repo-user unit | Configurator starting at **`1 × 1 = $50/mo`** (unlimited agents/devices `$0`) | Free-forever Decapod Local card | Continue with GitHub sign-in & repo verification |
| **Admin (`/admin`)** | *Are my repos, team seats, and limits healthy right now?* | Scoped organization summary & readiness badge | Explicit usage-observation state (`measured_healthy` vs `unavailable`/`stale`/`action_needed`) | `purchased / assigned / available` capacity tables | Assign/revoke seats or resolve limit/repo issue |

### 6.2 Annotated Viewport Notes (`1440×900`, `1024×768`, `390×844`, `320px`)

- **Desktop (`1440×900` & `1024×768`):** Single-row `72px` sticky header keeps all 6 top links + `GitHub ↗` pill crisp with zero wrapping. Hero two-column grid (`56% / 44%`) presents headline, 2-sentence explanation, install command card, and mascot cleanly inside the first viewport (`100svh - 74px`). Scroll step 2 reveals `#proofs` directly—eliminating the previous ~7,400px bury depth.
- **Mobile (`390×844` & `320px`):** Grid collapses to single column (`1fr`) with `16px` inline gutter on `320px` and `overflow-x: clip`. Sticky header wraps nav links to row 2 cleanly (`grid-template-columns: repeat(3, 1fr)` below `540px`). Install code wraps cleanly inside `.shell` (`overflow-wrap: anywhere`), tables scroll within isolated horizontal containers, and `--site-footer-reserve` expands (`120px` -> `154px`) so bottom buttons clear the pinned footer completely.

---

## 7. Expert Review Log & Remaining Open Observations

- **November 27, 2026 (Expert Design-Studio Audit — Cross-Repo Track A/B/C):**
  - Verified baseline failure modes in live/rendered static assets: buried homepage proof (`~7,434px`), external Google Fonts requests on `/` and `/tecr.html` and `/clack/index.html`, inconsistent header link sets across Cloud vs static routes, mdBook `pre > code` contrast regression, Pricing `2 × 5 = $490` default anchor bias, and Admin false `"Healthy"` inference on missing limits snapshots.
  - **Open Unverified Assumptions:** Quantitative conversion impact, real developer comprehension times with external first-time users, and mobile field bandwidth timings remain unmeasured until post-launch observation; claims in all repositories remain restricted strictly to what source tests and headless browser checks directly establish.
