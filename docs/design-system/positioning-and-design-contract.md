# Decapod Labs Positioning Brief, Journeys & Shared Visual Design Contract

- **Master Scope:** [DecapodLabs/decapodlabs.github.io#103](https://github.com/DecapodLabs/decapodlabs.github.io/issues/103) (Owner Editorial Correction — November 27, 2026)
- **Connected Owners:** `DecapodLabs/decapodlabs.github.io` (Marketing, Capabilities, Showcases, Research, Evaluation/Proof, Trust, Rework, Clack), `DecapodLabs/decapod` (`/decapod/` docs + CLI/RPC kernel), `DecapodLabs/propodus` (`cloud-app-manifest.json` commercial UI for `/pricing`, `/signup/`, `/admin/`, `/shared/`).
- **Supersession Note:** This document replaces the November 27 PR `#107` proof-first homepage ordering. Per `#103`/`#104`/`#106`, the primary homepage teaches newcomers what Decapod Labs builds and how the metacognitive governance kernel works with existing coding agents; evaluation records (`proof.html`, `#proofs`) serve as supporting technical reference in context rather than displacing product education.

---

## 1. Concise Positioning Brief

- **Primary Audience:** Individual engineers, staff maintainers, and engineering teams building real software with autonomous or semi-autonomous coding agents (Codex, Claude Code, Cursor, Antigravity, Pi, and comparable clients).
- **Identity & Category:** **Decapod Labs** is an AI research and engineering organization building **Decapod**, an agent-agnostic, local-first, daemonless **metacognitive governance kernel** and surrounding accountable-execution tooling.
- **Core Job to Be Done:** Let engineers delegate ambitious engineering outcomes to existing coding agents without sacrificing architectural continuity, project knowledge, boundary enforcement, or inspectable proof across sessions and teammates.
- **Practical Benefit:**
  1. **Keep your agents, keep project truth:** Agents invoke Decapod CLI/RPC around task claims, isolated Git worktrees, context capsules, living specifications, and validation gates—and Decapod exits cleanly with zero lingering daemon.
  2. **Built-in institutional & domain doctrine:** The global **Constitution** embeds curated engineering golden paths, research, architecture, and software-business knowledge directly in the kernel so agents query grounded standards instead of guessing.
  3. **Cross-agent, cross-discipline coherence:** Whether coordinating multiple agents inside a Godot game codebase (`Waystead`) or parallel swarms delivering startup infrastructure (`Decapod`, `Propodus`), state, ownership, and recovery survive across tools and sessions.
  4. **Local free forever, Cloud optional for teams:** Zero-signup MIT/Apache local governance stays `$0`; optional team Cloud (`$50/mo` or `$552/yr` per `repository × contributor`, `$0` per agent or device) adds shared cloud custody, seat management, and hardware-bound device identity.
- **Ordinary progression:** A maintainer gives an existing agent an outcome. The agent resolves relevant decisions and boundaries, owns a workstream, implements and checks it, then delivers under standing policy. The architecture shows an illustrative keyboard-navigation request and a test failure that the agent diagnoses, repairs, and verifies. An out-of-authority action or unresolved product decision returns to someone authorized to resolve it.
- **Supporting Evidence & Limits:** Historical observed execution ([`/proof.html`](/proof.html) — `Pi 0.73.1 + Decapod 0.148.8`, PR #7) and public pre-results research ([*Accountable Agentic Execution*](https://github.com/DecapodLabs/accountable-agentic-execution)) demonstrate and formalize the workflow in public. Validation binds to exact candidate commits and configured checks—the admission receipt records configured verification for the exact candidate. Standing delegation and forge policy determine whether an agent can publish or merge.

---

## 2. Reference Principles & Evidence Boundaries

- **Reading & Navigation Craft:** Inspired by crisp documentation-grade information architecture (high-contrast reading measure, clear section hierarchy, keyboard-navigable search, and persistent landmarks) expressed in Decapod Labs' warm cream, espresso ink, coral (`#f05b37`), and Clack mascot identity.
- **Fact vs. Hypothesis Separation:**
  - **Observed Facts:** All site builds, link integrity (`scripts/check-site.ts`), provenance/trust tests (`deno test tests/`), `mdbook` SEO/alignment checks, Propodus unit/Edge suites, and live headless Chrome audits are directly measured.
  - **Expert Review & Untested Hypotheses:** Internal walkthroughs are labeled explicitly as **Expert Review** in [`first-use-research-script.md`](./first-use-research-script.md); newcomer comprehension timings and external conversion behavior remain **Untested Hypotheses** until observed with external developers.

---

## 3. Connected End-to-End Journeys

### Journey 1 — Newcomer Discovery to First Governed Result (`/` -> Docs -> Evaluation Reference)
1. **Homepage (`/`):** Understand what Decapod Labs is doing (`Infrastructure for autonomous engineering.`), how Decapod works alongside existing agents, watch the introductory kernel film (`Meet the kernel.`), explore the four pillars & architecture (`#features`, `#architecture`), browse all 14 visible capabilities including the global Constitution (`#capabilities`), inspect real applications (`#showcase`: Waystead + concurrent swarms) and current research (`#research`), see Local vs Cloud (`#cloud`), optionally inspect the contextual observed Pi run (`#proofs` -> `/proof.html`), and initialize locally (`cargo binstall decapod && decapod init`).
2. **Documentation (`/decapod/` -> `/decapod/quickstart.html`):** Separate human one-time initialization (`install`, `decapod init`) from agent-operated execution (`decapod docs ingest`, short outcome prompt, isolated worktree, `decapod validate`), distinguishing standing repository delegation policy (`[governance].main_merge`) from admission receipts.
3. **Evaluation & Trust Reference (`/proof.html`, `/trust/index.html`):** Answer specific technical questions on case-study method, exact commit/artifact digests, negative controls, and local zero-egress privacy guarantees.

### Journey 2 — Team Evaluation to Cloud Readiness (`/#cloud` -> `/pricing` -> `/signup/` -> CLI Task)
1. **Local vs Cloud Clarity (`/#cloud` & `/pricing`):** Contrast `$0` local kernel with `$50/mo` (`$552/yr`, `1 repo × 1 contributor`, `$0` per coding agent or laptop) and four team value pillars.
2. **Continuous Signup (`https://decapodlabs.ai/signup/`):** Preserve repository/seat/billing URL parameters across GitHub PKCE OAuth (`S256`), verify repository installation & entitlement readiness before Checkout, and fail closed without hiding unresolved prerequisites.
3. **CLI continuation:** Repository setup and account admission follow the current deployed Cloud contract. [Contributor acceptance](https://github.com/DecapodLabs/decapod/issues/1896) tracks the configured-clone experience under which an approved contributor can prompt their agent directly after any necessary GitHub sign-in. The administrator owns repository setup and authorization.

### Journey 3 — Returning Administrator Operations (`/admin/`)
1. Inspect workspace readiness, purchased/assigned/available human-repo seats, and repo verification status.
2. Separate `loading`, `unavailable`, `stale`, `action_needed`, and `measured_healthy` cleanly—never synthesizing `"Healthy"` when snapshot telemetry is missing or stale.

---

## 4. Shared Visual & Interaction Contract

### 4.1 Color, Surface & Typography Tokens (`styles.css` & `shared/commercial-ui.css`)
- **Typography:** Self-hosted variable **`Geist`** (UI/editorial sans, `-webkit-font-smoothing: antialiased`) and **`Geist Mono`** (commands, indexes, receipts, SHA badges) loaded from `/assets/fonts/` under SIL OFL 1.1. Zero external Google Fonts CDN calls.
- **Core Palette:**
  - `--bg` / `--paper`: `#fff9f0` (Warm Cream ground)
  - `--surface`: `#fffdfa` (Card paper)
  - `--milk`: `#fff1e0` (Warm secondary band / card well)
  - `--ink`: `#17131a` (Espresso primary ink; dark section canvas `#211722`)
  - `--ink-secondary`: `#29212c` (Body prose >= 13:1 on `--bg`)
  - `--orange`: `#f05b37`, `--orange2`: `#ff7642`, `--accent-ink`: `#b93c1b` (accessible coral text accent >= 4.5:1 on Warm Cream)
  - `--sun`: `#ffc65b` (focus & dark-surface highlights)
- **Layout & Accessibility Invariants:**
  - Responsive `0px` horizontal overflow from `320px` through `1440px+` and at `1.25×` enlarged browser text.
  - Visible `:focus-visible` `3px` outlines (`--orange` on light, `--sun` on dark), `scroll-padding-top` clearance beneath sticky headers, and `prefers-reduced-motion: reduce` support.
  - Accessible Clack mascot (`assets/mascot-github-avatar.png` in hero sunburst, `assets/mascot.svg` in architecture flow, `/clack/index.html` dedicated app page).

### 4.2 Exploration-Led Shared Navigation & Proportionate Pinned Footer
- **Sticky Header (`<header class="nav">`):**
  - Wordmark (`/assets/logo-a.png`)
  - Top Links (`8` clean routes): `Features` (`/#capabilities`), `Architecture` (`/#architecture`), `Showcase` (`/#showcase`), `Research` (`/#research`), `Docs` (`https://decapodlabs.ai/decapod/`), `Rework` (`/tecr.html`), `Clack` (`/clack/index.html`), `Pricing` (`https://decapodlabs.ai/pricing`, `.nav-pricing` pill)
  - Primary CTA: `GitHub ↗` (`https://github.com/DecapodLabs/decapod`)
  - Single-row at `1024px` and `1440px` (`clamp`/compact spacing at `961px–1180px`); clean two-row/wrapped mobile layout at `<= 960px` without horizontal overflow or crowding at `320px`.
- **Proportionate Pinned Footer (`<footer class="footer">`):**
  - Links: `Docs ↗`, `Evaluation` (`/proof.html`), `Pricing ↗`, `Trust & Privacy ↗` (`/trust/index.html`), `Rework` (`/tecr.html`), `GitHub ↗`, `For agents` (`/llms.txt`).
  - `--site-footer-reserve` ensures bottom sections, closing CTAs, and focusable links never sit hidden behind the pinned footer across desktop and mobile viewports.

---

## 5. Attention-Order Matrix (Corrected `#103`/`#104`/`#106` Hierarchy)

| Surface | Primary Question Answered | Visual Priority 1 | Visual Priority 2 | Visual Priority 3 | Principal Next Action |
| --- | --- | --- | --- | --- | --- |
| **Hero (`/`)** | *What is Decapod, who uses it, and how do I start?* | Lab thesis headline (`Infrastructure for autonomous engineering.`) + plain-language explanation | Free local install card (`Cargo binstall` / `Cargo` / `Nix`) + `"Now just tell your agent what you want."` | Proportionate Clack mascot sunburst | Initialize locally (`decapod init`) or watch kernel film |
| **Film & Architecture (`#film`, `#features`, `#architecture`)** | *How does Decapod work with my existing coding agents?* | Introductory film (`Meet the kernel.`) | `"The agent can write code. Who makes sure the work holds?"` + 4 Foundation Pillars | `"The agent does the work. Decapod governs it."` flow diagram, ordinary feature request, and recoverable-failure example | Explore architecture (`/decapod/mental-model.html`) |
| **Kernel Capabilities (`#capabilities`)** | *What concrete capabilities does the kernel provide?* | Prominent `01 / TASKS + CUSTODY` & `02 / CONSTITUTION` (curated golden paths, research, architecture, business doctrine, queryable, open to PRs) | Visible 14-card grid covering Intent, Context, Workspaces, Coordination, Memory, Authority, Validation, Proof, Delivery, Custody, Runtime, API | Direct card links into canonical `/decapod/` docs chapters | Explore complete documentation (`/decapod/`) |
| **Applied Showcase & Research (`#showcase`, `#research`)** | *What can teams build with it, and what research underpins it?* | `01 / Game Development`: **Waystead** key art + 7-slide gallery | `02 / Startup & Multi-Agent Engineering`: `#swarms` 3-slide gallery | `#research`: *Accountable Agentic Execution* + *The End of Continuous Rework* (`/tecr.html`) | Read technical report or Rework thesis |
| **Local vs Cloud (`#cloud`)** | *What stays free vs when does Cloud apply?* | `$0` Decapod Local MIT/Apache card | `$50/mo` (`$552/yr`, `1 × 1`) Decapod Cloud card + 4 team pillars | Clear zero-signup vs GitHub OAuth distinction | Initialize locally or configure Cloud (`/pricing`) |
| **Supporting Evaluation (`/proof.html` & `#proofs`)** | *What was observed in a recorded autonomous run and how was it checked?* | Engineering Case Study summary (`objective, setup, mechanism, behavior, result, method`) | Terminal recording + 3 chapters + exact commit/SHA tables | Evaluation Method & Findings + Trust & Privacy route | Inspect verifiable receipts or run docs locally |
| **Documentation (`/decapod/`)** | *How do I get my first governed result?* | Crisp chapter (`68ch–72ch`), high-contrast code blocks (`Geist Mono`), self-hosted fonts | Sticky single-row top bar + `⌘K` search + chapter outline | Desktop/mobile `"On this page"` + `"Copy for your agent"` | Run `decapod init` & prompt agent |
| **Commercial (`/pricing`, `/signup/`, `/admin/`)** | *What does Cloud cost, how do repos verify, and are team limits healthy?* | `1 × 1 = $50/mo` (`$552/yr`) configurator + 4 pillars | Continuous `?repo=&billing=&seats=` GitHub PKCE `/signup/` | Fail-closed `/admin/` (`loading`/`unavailable`/`stale`/`action_needed`/`measured_healthy`) | Verify repo readiness or manage seats |

---

## 6. Cross-Repo Propagation & Ownership Boundaries

1. **Static Site (`DecapodLabs/decapodlabs.github.io`):** Owns `index.html`, `styles.css`, `main.js`, `proof.html`, `trust/index.html`, `tecr.html`, `offerings.html`, `clack/index.html`, `robots.txt`, `sitemap.xml`, `llms.txt`, and `docs/design-system/`.
2. **Documentation (`DecapodLabs/decapod`, `docs/book/`):** Deployed independently to `https://decapodlabs.ai/decapod/`. All links from the 4 root HTML documents validated by `scripts/check-site.ts` MUST use canonical `https://decapodlabs.ai/decapod/...` URLs rather than root-relative `/decapod/...` paths.
3. **Commercial Bundle (`DecapodLabs/propodus`, `portal/app/`):** Consumed here only via signed `cloud-app-manifest.json` artifacts (`pricing*`, `signup/`, `admin/`, `shared/`, `cloud-flow.js`, `404.html`). Never hand-edit commercial bundle artifacts directly inside `decapodlabs.github.io`.
