# Decapod First-Use Research Script & Connected Review Protocol

- **Issue:** [DecapodLabs/decapodlabs.github.io#103](https://github.com/DecapodLabs/decapodlabs.github.io/issues/103) (`#104`, `#106` — Connected Cross-Repo Review)
- **Companion Docs:** [Positioning & Shared Design Contract](./positioning-and-design-contract.md) · [Content Recovery Inventory](./content-recovery-inventory.md)
- **Methodology Label:** **Internal Expert Review / Technical Walkthrough** paired with a neutral protocol for future external participant sessions. Zero external engineering participants, interview quotes, conversion lifts, or unmeasured time-on-task benchmarks are claimed or fabricated in this repository (`0 external sessions run`).

---

## 1. Study Framing, Evidence Rules, and Ethics

1. **Purpose:** Evaluate whether a developer or engineering lead unfamiliar with Decapod moving across `https://decapodlabs.ai/` (`/`), Architecture/Capabilities (`/#architecture`, `/#capabilities`), Showcase/Research (`/#showcase`, `/#research`), Documentation (`/decapod/`), Evaluation Case Study (`/proof.html`), Trust (`/trust/`), Pricing (`/pricing`), Signup (`/signup/`), and Admin (`/admin/`) understands Decapod's role, operating model, boundaries, and starting path without guesswork.
2. **Six Core Newcomer Comprehension Outcomes (`#104`):**
   Every first-time reader following the normal homepage + Quickstart flow should be able to answer, in ordinary language, without expanding hidden drawers or reading SHA receipts:
   1. *What is this, and what problem is Decapod Labs addressing?*
   2. *How does it work with the coding agent I already use?*
   3. *What does Decapod contribute before and during the work (Constitution, living specs, context capsules, boundaries)?*
   4. *What does the maintainer delegate, what can the agent handle when a routine check fails, what survives a session change, and when is human input necessary?*
   5. *What kinds of work can I apply it to?*
   6. *Where do I explore the architecture, research, or capabilities, and how do I start?*
3. **Evidence Separation:**
   - **Observed Implementation & Browser Behavior:** Measured facts observed directly in source checks (`scripts/check-site.ts`, `deno test`, `cargo test`, `propodus-cloud-smoke`) and headless/interactive Chrome inspections (`320×800`, `390×844`, `1024×768`, `1440×900`, plus `1.25×` enlarged text).
   - **Expert Review Findings:** Walkthrough notes recorded by engineers/reviewers inside the team. Always labeled explicitly as **Expert Review**.
   - **External Participant Observations:** Strictly reserved for external developers with no prior Decapod build context. Until run, audience claims remain **Untested Hypotheses**.
4. **Neutral Facilitation Rules:**
   - Read scenarios verbatim; never name target nav items, CLI flags, or pricing figures.
   - Wait 10 seconds before prompting when a participant hesitates; never defend copy or clarify intended hierarchy mid-task.
   - Stop paid Cloud walkthroughs cleanly before any live payment submission (`Checkout` handoff or disposable readiness inspection only).

---

## 2. Participant Screening & Session Setup (For Future External Sessions)

- **Cohort A — Individual / Staff Maintainer (Local-First):** Regularly delegates coding tasks via Codex, Claude Code, Cursor, Antigravity, or Pi.
- **Cohort B — Engineering Lead / Platform Owner (Team Cloud Evaluation):** Evaluates shared governance, audit trails, CI validation gates, and per-repo/contributor spend across 2–10 engineers.
- **Setup:** Clean private browser window (`1440×900` desktop or `390×844` mobile) opened to `https://decapodlabs.ai/`.

---

## 3. Moderated Task Prompts & Neutral Observation Questions

### Journey 1 — Lab Discovery & Product Comprehension to First Governed Result (`/` -> Docs -> Evaluation Reference)

**Scenario Prompt (read verbatim):**
> "You maintain an engineering codebase where coding agents repeatedly forget architectural decisions across sessions and mark work done before checks pass. Someone sends you `https://decapodlabs.ai/`. Take 5–7 minutes to understand what Decapod Labs is building, how the tool fits alongside the coding agent you already use, what survives across sessions, and how you would try it on one repository—without relying on any external pitch."

**Neutral Observation Questions:**
1. **First Screen & Film (`/` hero + `Meet the kernel.`):** *"Without scrolling past the opening and film, what problem does Decapod address, and who runs it—you or your coding agent?"*
2. **Operating Model & Pillars (`#features`, `#architecture`):** *"In your own words, what happens to your idea before your agent edits code, and what stays on disk after a call exits?"*
3. **Feature and recovery examples (`#architecture`):** *“What result did the maintainer ask for? What does the agent do when a test finds a problem? What would require the maintainer to act?”*
4. **Capabilities & Constitution (`#capabilities`):** *"Pick two capabilities that seem essential to multi-session engineering. What is the Constitution, and how do agents use it?"*
5. **Applied Work & Research (`#showcase`, `#research`):** *"What kinds of software projects are shown here, and how would you describe the lab's ongoing research report?"*
6. **Starting Locally (`#quickstart` -> `/decapod/quickstart.html`):** *"If you wanted to start on one repo today, what commands do you run yourself versus what do you tell your coding agent?"*
7. **Technical Reference (`/proof.html`, `/trust/index.html`):** *"If a teammate asked for a concrete engineering case study or wanted to verify what data leaves your laptop locally, where would you send them?"*

**Observable Success Signals (mapped to the 6 newcomer outcomes):**
- Answers all 6 newcomer comprehension questions accurately in plain prose without clicking closed drawers or deciphering commit hashes first.
- Recognizes that existing coding agents remain in use (`Codex`, `Claude Code`, `Cursor`, `Antigravity`, `Pi`) and call Decapod on demand with zero background daemon.
- Distinguishes the whole kernel (Constitution, living specs, context capsules, durable memory, worktree custody, recovery, publication) from a single validation script or case study.
- Connects the illustrative keyboard-navigation request and failed focus check to the intended result, permitted repair, and revised candidate. Identifies missing authority or an unresolved product decision as a reason for human input.
- Separates human bootstrap (`cargo binstall decapod && decapod init`) from short outcome-based agent delegation (`decapod validate` / PR policy).

---

### Journey 2 — Team Evaluation to Cloud Readiness (`/#cloud` -> `/pricing` -> `/signup/` -> CLI Task)

**Scenario Prompt (read verbatim):**
> "Suppose your team of three engineers wants shared governance telemetry, repository-bound custody, and seat management across one production repository. Starting from the site navigation, figure out what Decapod Cloud costs compared to staying local, what each engineer's AI coding agents cost, and walk through setup up to GitHub sign-in and readiness checks."

**Neutral Observation Questions:**
1. **Pricing Entry (`/pricing`):** *"Before changing controls, what is being priced (`repo × contributor`), what stays free forever, and why would a team upgrade?"*
2. **Configurator (`1 × 1 = $50/mo` / Annual `$552/yr`):** *"Configure 1 repository and 3 contributors (`$147/mo`). Does adding more AI agents or laptops change the monthly bill?"*
3. **Signup Continuity (`/signup/`):** *"When you advance from Pricing to Signup, did your repo/seat/billing selection stay intact? What permissions or verification checks appear before any billing step?"*
4. **CLI Continuation:** *"After repo and plan readiness succeed, what does the engineer run locally to connect that workspace?"*

---

### Journey 3 — Returning Administrator Triage (`/admin/`)

**Scenario Prompt (read verbatim):**
> "A teammate pings you saying their agent cannot validate or their repo seat looks missing. Open `/admin/` and explain what state the workspace is in, whether usage figures can be trusted right now, and what step comes next."

**Neutral Observation Questions:**
1. **Status Separation (`loading` / `unavailable` / `stale` / `action_needed` / `measured_healthy`):** *"Would you call this workspace healthy, broken, or unmeasured right now—and why?"*
2. **Capacity & Verification:** *"Which engineer holds a seat (`purchased / assigned / available`), and which repository is verified?"*
3. **Next Step:** *"What exact action resolves a missing seat, unverified repository, or stale usage snapshot?"*

---

## 4. Explicit Untested Hypotheses Inventory

**Zero external usability sessions have been executed (`0 external sessions run`).** Retain these hypotheses explicitly until validated with external developers:

| ID | Surface | Untested Hypothesis | Falsification / Refutation Signal |
| --- | --- | --- | --- |
| **H1** | Hero & Film (`/`) | Leading with `Infrastructure for autonomous engineering.`, plain-language explanation, install card, and the visible kernel film answers *what Decapod is* faster and with stronger lab stature than leading with commit-SHA test failures. | External newcomers still struggle after scrolling past the hero/film to explain what problem Decapod solves or why an agent invokes it. |
| **H2** | Architecture & Constitution (`#architecture`, `#capabilities`) | Making all 14 capabilities (including full Constitution doctrine on curated golden paths, research, architecture, business knowledge, and PR openness) visibly browsable clarifies how Decapod differs from an ad-hoc prompt checklist. | Readers skim past the capability grid without grasping the relationship between Constitution, living specs, context capsules, and worktree custody. |
| **H3** | Showcases & Research (`#showcase`, `#research`) | Visible Waystead + concurrent swarm carousels paired with *Accountable Agentic Execution* and *The End of Continuous Rework* demonstrate real breadth without defensive disclaimers. | Visitors confuse internal showcases (`Waystead`, concurrent Ghostty swarms) for third-party customer testimonials or find pre-results research status ambiguous. |
| **H4** | Quickstart (`/decapod/quickstart.html`) | Splitting human bootstrap (`decapod init`) from short outcome-only agent delegation (`Fix the failing retry-backoff test.`) and clarifying standing PR/merge policy lowers setup friction. | First-time users still copy internal CLI commands into manual prompts or assume validation implies automatic merge. |
| **H5** | Evaluation Case Study (`/proof.html`) | Presenting the historical Pi run as a concrete Engineering Case Study & Evaluation Record (`objective, setup, mechanism, observed behavior, result, method`) answers technical verification questions cleanly in context. | Engineers cannot distinguish the primary observed run from synthetic/operator negative controls or locate artifact SHA-256 links quickly. |
| **H6** | Pricing & Signup (`/pricing`, `/signup/`) | Defaulting to `1 × 1 = $50/mo` (`$552/yr`, `$0` per coding agent/device) and carrying `?repo=&billing=&seats=` across GitHub PKCE OAuth prevents pricing shock and intent loss. | Teams still misread `$50` as per-agent pricing or lose context during GitHub App installation. |
| **H7** | Admin (`/admin/`) | Explicit `loading` / `unavailable` / `stale` / `action_needed` / `measured_healthy` badges eliminate false `"Healthy"` confidence when telemetry is absent. | Returning admins mistake `unavailable` or `stale` telemetry for platform downtime instead of snapshot/scope diagnostics. |

---

## 5. Connected Cross-Repo Review Log (Expert Review)

### Entry 1 — Pre-Recovery & Pre-Docs-Deploy Baseline (`2026-11-27`)
- **Method:** Internal Expert Walkthrough + `check-site.ts` + `deno test tests/` + Track 3 live Cloud qualification (`propodus-cloud-smoke`, Chrome CDP).
- **Observed Live PASS (`20261127-uplift` Commercial & Trust Foundations):**
  - `/pricing` (`1 × 1 = $50/mo`, `$552/yr`, 4 pillars, continuous `?repo=&billing=&seats=` -> `/signup/` -> GitHub PKCE `302`), `/admin/` (fail-closed usage states), `/trust/` (`1.0.0` privacy contract), self-hosted `Geist`/`Geist Mono`, warm palette, `320px`/`1.25×` responsive baseline, and `decapod v0.169.4` + `dactyl-db v0.21.0` Cloud auth gating (`backend = "cloud"` fails closed at `onboarding_pending` with zero leaked `.db` files) all passed source and live checks.
- **Confirmed Gaps Triggering Track 4 Recovery:**
  - Website homepage & `/proof.html` (`5bad19cb`) pushed product education and all 14 capabilities into closed drawers while leading with commit-SHA defensive proof (`#103`/`#104`/`#106` reopened).
  - Live `https://decapodlabs.ai/decapod/` awaits Track 2 (`#1977`/`#1978`) deployment (`PR` / `Deploy Docs` underway after `v0.169.4` install).

### Entry 2 — Post-Recovery Full 3-Journey Live Connected Walkthrough (Pending Dual Deployment)
- **Status:** `PENDING` (`DecapodLabs/decapodlabs.github.io` editorial recovery PR merge + `DecapodLabs/decapod` `#1977`/`#1978` `Deploy Docs`).
- **Planned Joint Verification (`@wave3b-ux-art-story` + `@quant-laya-ops`):**
  1. Inspect live `https://decapodlabs.ai/` top-to-bottom across `320×800`, `390×844`, `1024×768`, `1440×900`, and `1440×900 @ 1.25×` against the **6 Newcomer Comprehension Questions** (Hero -> Film -> Thesis/4 Pillars/Architecture -> 14 Visible Capabilities -> Waystead & Swarms -> Research -> Local vs Cloud -> Supporting Observed Execution -> Closing CTA).
  2. Walk live `https://decapodlabs.ai/decapod/` (`/decapod/quickstart.html`) across themes & viewports once `#1977`/`#1978` deploys, verifying single-row `#menu-bar`, readable `pre > code`, self-hosted fonts, `"Copy for your agent"`, and bidirectional `/proof.html` <-> `/decapod/` links.
  3. Inspect `/proof.html` as Engineering Case Study & Evaluation Record (`objective -> method & findings -> artifacts`), `/trust/`, `/tecr.html`, `/clack/index.html`, `/pricing`, `/signup/`, and `/admin/` end-to-end.
