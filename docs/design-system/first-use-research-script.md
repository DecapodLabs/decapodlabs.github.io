# Decapod First-Use Research Script & Connected Review Protocol

- **Issue:** [DecapodLabs/decapodlabs.github.io#103](https://github.com/DecapodLabs/decapodlabs.github.io/issues/103) (Connected Cross-Repo Review — Track 4)
- **Companion Contract:** [Positioning & Shared Design Contract](./positioning-and-design-contract.md)
- **Status:** Method & Protocol Drafted; Live Cross-Repo Walkthrough Pending `#1977` & `#1978` Docs Deployment
- **Methodology Label:** **Internal Expert Review / Technical Walkthrough** (combined with a structured protocol for future external sessions). Zero external engineering participants, interview quotes, conversion lifts, or time-on-task benchmarks are claimed or fabricated in this repository.

---

## 1. Study Framing, Evidence Rules, and Ethics

1. **Purpose:** Test whether a developer or engineering lead moving across `decapodlabs.ai` (`/`), Proof (`/proof.html`), Trust (`/trust/`), Documentation (`/decapod/`), Pricing (`/pricing`), Signup (`/signup/`), and Admin (`/admin/`) understands:
   - what Decapod is for (delegating real coding work while keeping project intent, task ownership, and falsifiable proof attached to the repository),
   - where Decapod Local (free, zero-egress) stops and Decapod Cloud (`$50/mo` or `$552/yr` per `repo × contributor`, `$0` per agent/device) begins,
   - how to run `decapod init`, prompt an existing coding agent, and judge the first governed result without relying on hidden telemetry or synthetic success indicators.
2. **Evidence Separation:**
   - **Observed Implementation & Browser Behavior:** Measured facts observed directly in source tests (`check-site.ts`, `deno test`, `cargo test`, `propodus-cloud-smoke`) and real headless Chrome / interactive browser walkthroughs (`320×800`, `390×844`, `1024×768`, `1440×900`, plus `1.25×` text enlargement).
   - **Expert Review Findings:** Friction identified by internal engineering/design walkthroughs. Always labeled explicitly as **Expert Review**.
   - **External Participant Observations:** Reserved for moderated or unmoderated sessions with external developers who did not build Decapod. Until conducted, this repository records `0 external sessions run` and retains all audience comprehension claims as **Untested Hypotheses**.
3. **Neutral Facilitation Rules:**
   - Give scenarios and goals, never button names, CLI subcommands, or pricing answers in the prompt.
   - Ask participants to think aloud while pointing at what they notice first, second, and third on each page.
   - When a participant hesitates or interprets a status pill wrongly (e.g., mistaking `Unavailable` for an error or assuming Local uses a cloud login), wait 10 seconds before prompting; never defend the interface or explain intended behavior mid-task.
   - Do not run synthetic live payments during live-site testing; end paid Cloud walkthroughs at checkout handoff or disposable staging/readiness verification.

---

## 2. Participant Screening & Session Setup (For Future External Sessions)

- **Target Cohorts (2–3 participants per cohort recommended):**
  - **Cohort A — Individual / Staff Maintainer (Local-First):** Regularly delegates coding tasks to Claude Code, Codex, Gemini CLI, OpenCode, or Pi in terminal/IDE workflows; has experienced agent context drift or premature "done" claims.
  - **Cohort B — Engineering Lead / Platform Owner (Team Cloud Evaluation):** Evaluates shared governance, audit trails, CI validation gates, and per-repo/contributor spend across 2–10 engineers.
- **Starting State:** Clean private browser window (`1440×900` desktop or `390×844` mobile) opened to `https://decapodlabs.ai/`, plus a terminal in a scratch Git repository with Rust/Cargo or Nix available (or clear expectation to simulate through prompt inspection).

---

## 3. Moderated Task Prompts & Neutral Observation Questions

### Journey 1 — Local Discovery to First Governed Result (`Homepage -> Proof -> Trust -> Quickstart -> First Result`)

**Scenario Prompt (read verbatim to participant):**
> "You lead maintenance on an active repository where coding agents keep forgetting architectural decisions and claiming tasks are done before checks actually pass. Someone sends you `https://decapodlabs.ai/`. Take 5–7 minutes to decide what this tool actually does, whether you trust what it sends off your laptop, and how you would try it on one local repo using the coding agent you already run."

**Neutral Observation Questions (ask after natural pause or at journey milestones):**
1. **Above-the-fold (`/`):** *"Without scrolling yet, what is this product and who would use it? What stands out first, second, and third on this screen?"*
2. **Proof & Trust (`/#proofs`, `/proof.html`, `/trust/`):** *"What makes you believe—or doubt—whether the tool worked on a real task? What data, if any, would leave your machine if you initialized it locally right now?"*
3. **Transition to Docs (`/decapod/` -> `/decapod/quickstart.html`):** *"If you decided to try this for ten minutes today, where do you click next, and what do you expect to happen in your terminal versus your coding agent?"*
4. **First Governed Result (`/decapod/quickstart.html`):** *"Looking at this page, which commands do you run yourself, and what do you hand to your agent? How would you know the first governed result succeeded versus failed?"*
5. **Visual & Chrome Checkpoints:** Note whether mobile sticky header clearance, code block contrast (light/dark/Warm Cream themes), `"Copy for your agent"`, and `Proof` ↔ `Docs` cross-links behave without hesitation.

**Success Signals (Observable):**
- Participant accurately summarizes Decapod within ~30 seconds without confusing it with an autonomous cloud coding SaaS.
- Participant locates both the `#proofs` / `/proof.html` evidence trail and `/trust/` zero-egress guarantee unprompted.
- Participant distinguishes human initialization (`cargo binstall`/`cargo install`/`decapod init`) from agent execution (`decapod docs ingest`, claimed workspace, `decapod validate`).

---

### Journey 2 — Team Evaluation to Cloud Readiness (`Pricing -> Signup -> Readiness -> CLI Task`)

**Scenario Prompt (read verbatim to participant):**
> "Suppose you tried Decapod locally on one service and now want your team of three engineers to share governed validation, repository policy, and workspace telemetry across one production repo. Starting from the site navigation, figure out what that would cost, what you actually get beyond the free CLI, and start the setup flow up to the point where you would connect GitHub or confirm billing."

**Neutral Observation Questions:**
1. **Pricing Entry (`/pricing`):** *"Before interacting with the controls, what is the base price and what unit is being priced? Why would a team pay for this instead of staying on the free version?"*
2. **Configurator (`1 × 1 = $50/mo` / Annual `$552/yr`):** *"Walk through configuring 1 repository and 3 contributors. What happens to the price if each engineer runs three different AI coding agents on two laptops?"*
3. **Value Clarity:** *"Which part of the paid offering feels essential versus unclear or over-claimed?"*
4. **Signup & Continuity (`/signup/`):** *"Click through to get started. When you land on Signup, did your repo/seat/billing intent carry over? What permissions or steps does this screen ask of you before anything is billed?"*
5. **CLI Continuation:** *"After repository and billing readiness are verified, what do you expect the next command in your terminal to be?"*

**Success Signals (Observable):**
- Participant computes `$147/mo` (`1` repo × `3` contributors or understands seat/repo scaling) and explicitly recognizes `$0` per coding agent / device.
- Participant does not mistake free-tier Local capabilities for gated Cloud features.
- Query-parameter intent (`?repo=...&billing=...&seats=...`) and GitHub PKCE sign-in explanation feel continuous and fail-closed rather than abrupt.

---

### Journey 3 — Returning Administrator Triage (`Admin Entry -> Usage/Readiness State -> Next Action`)

**Scenario Prompt (read verbatim to participant):**
> "You set up Decapod Cloud last week, and a teammate pings you saying their agent cannot validate or their repo seat looks missing. Open the Admin console (`https://decapodlabs.ai/admin/` or signed-in workspace snapshot) and explain what state the workspace is in, whether usage data can be trusted right now, and what action you would take next."

**Neutral Observation Questions:**
1. **Initial Triage:** *"What is the single most important status on this screen right now? Would you describe the workspace as healthy, broken, or unknown?"*
2. **State Semantics (`loading` / `unavailable` / `stale` / `action_needed` / `measured_healthy`):** *"Look at the usage and readiness badges. Where do you think those numbers came from, and what does the current label tell you NOT to assume?"*
3. **Seat & Repository Capacity (`purchased / assigned / available`):** *"How do you tell which contributor holds a seat, which repository is verified, and how to fix a missing seat or stale telemetry snapshot?"*
4. **Recovery Confidence:** *"If telemetry is unavailable or stale right now, what is your next concrete step?"*

**Success Signals (Observable):**
- Participant never reads `unavailable`, `stale`, or `loading` as `"Healthy"` or `"No usage issues"`.
- Participant separates `purchased / assigned / available` seat capacity from repository verification state and limits/webhook freshness.
- Participant identifies the exact remediation control or refresh check without hunting across hidden menus.

---

## 4. Explicit Untested Hypotheses Inventory

The following assumptions motivate the `#103` uplift across `decapodlabs.github.io`, `decapod`, and `propodus`. **None of these are validated by external user telemetry yet; treat them as open hypotheses until real external sessions are logged:**

| ID | Surface | Untested Hypothesis | Falsification / Refutation Signal |
| --- | --- | --- | --- |
| **H1** | Homepage (`/`) | Lead framing around delegating serious work with continuity and verifiable proof ("governance kernel" kept intelligible in context) conveys practical value faster than abstract protocol terminology. | External first-time developers still cannot explain what Decapod prevents or changes in their workflow after reading the hero + first scroll. |
| **H2** | Immediate Proof (`/#proofs`, `/proof.html`) | Showing a short 3-beat failure -> repair -> fresh-check -> PR trail directly below the fold improves engineering credibility before asking for an install. | Developers skip `/proof.html` or dismiss the terminal replay as staged because receipt links/claims feel dense. |
| **H3** | Quickstart (`/decapod/quickstart.html`) | Splitting Human actions (`install`, `decapod init`) from Agent actions (`decapod docs ingest`, prompt handoff, `decapod validate`) reduces mid-setup abandonment. | First-time users still type agent-only commands manually or fail to hand the exact onboarding prompt to their coding agent. |
| **H4** | Pricing (`/pricing`) | Anchoring the configurator at `1 × 1 = $50/mo` (`$552/yr`) with explicit `$0` per agent/device and a 4-pillar justification avoids starter-shock compared to multi-seat default anchors. | Individual/small-team evaluators still read `$50` as per-agent pricing or do not understand why a governance control plane costs `$50/mo`. |
| **H5** | Signup & Readiness (`/signup/`) | Preserving URL intent across GitHub PKCE OAuth and showing explicit readiness gates before Checkout increases trust and reduces drop-off. | Users feel disoriented returning from GitHub OAuth or hesitate at GitHub App repository scope prompts. |
| **H6** | Admin (`/admin/`) | Separating `loading`, `unavailable`, `stale`, `action_needed`, and `measured_healthy` prevents false operator reassurance when backend limits data is absent or delayed. | Returning admins still confuse `stale`/`unavailable` warnings with "system down" or miss the seat/repo remediation step. |
| **H7** | Mobile & Accessibility (`320px`, `390px`, `1.25×` zoom) | Self-hosted `Geist` / `Geist Mono`, warm cream contrast, and sticky-header `scroll-margin-top` clearances support effortless reading on mobile viewports. | Mobile readers struggle with long terminal commands wrapping inside `.shell` or miss right-rail collapsed TOC controls. |

---

## 5. Connected Cross-Repo Review Log (Expert Review)

> Every entry below records **observed static/live inspection results** only. Never extrapolate uninspected routes or post-deploy state before observing the live URL.

### Entry 1 — Pre-Docs-Deploy Baseline (`2026-11-27`)
- **Method:** Internal Expert Walkthrough + Headless Chrome CDP + `check-site.ts` + `deno test tests/` (`DecapodLabs/decapodlabs.github.io#107` at `5bad19cb`, Propodus `20261127-uplift` at `7e4aba65`).
- **Observed Live PASS (`https://decapodlabs.ai/`):**
  - **Marketing, Proof & Trust:** `/`, `/proof.html`, `/trust/`, `/tecr.html`, `/clack/` render cleanly across `320×800`, `390×844`, `1024×768`, `1440×900`, and `1440×900 @ 1.25×` with `0px` horizontal overflow, self-hosted `Geist` (`zero` Google Fonts CDN requests), `17.53:1` body contrast, `#proofs` surfaced directly below the hero, and sticky-footer clearances unobstructed.
  - **Commercial Bundle (`/pricing`, `/signup/`, `/admin/`):** `1 × 1 = $50/mo` (`$552/yr` annual), `3 × 1 = $147/mo`, 4-pillar `$50` value justification, continuous `?repo=...&billing=...&seats=...` handoff into `/signup/`, and fail-closed `/admin/` usage states (no false `"Healthy"` inference on missing data) verified live.
- **Known Cross-Repo Gap Remaining at Baseline:**
  - Live `https://decapodlabs.ai/decapod/` (`/decapod/quickstart.html`) has not yet received `DecapodLabs/decapod` `#1977` & `#1978` (blocked locally by `CONTROLLER_CONTRACT_UNSUPPORTED` until a supported `v0.169.4`+ controller lands and `Deploy Docs` publishes). Live `/decapod/quickstart.html` therefore still shows the pre-uplift sticky `#menu-bar` heading clip (`-45px` on `320/390px`) and Google Fonts requests until Track 2 completes.

### Entry 2 — Full Live 3-Journey Connected Walkthrough (Pending Track 2 Docs Deploy + Track 3 Verification)
- **Status:** `PENDING` (`Track 2` `#1977`/`#1978` live deployment to `https://decapodlabs.ai/decapod/` + `Track 3` `verify-cloud-web-publication.mjs` / Chrome journey verification).
- **Planned Joint Verification (`@wave3b-ux-art-story` + `@quant-laya-ops`):**
  1. Walk Journey 1 end-to-end live across `https://decapodlabs.ai/` -> `/#proofs` -> `/proof.html` -> `/trust/` -> `https://decapodlabs.ai/decapod/` -> `/decapod/quickstart.html` at `390×844` and `1440×900`, confirming zero sticky-bar clip, readable 5-theme `pre > code`, self-hosted `Geist`/`Geist Mono`, `"Copy for your agent"`, and bidirectional `/proof.html` ↔ `/decapod/quickstart.html` navigation.
  2. Cross-check Journey 2 (`Pricing -> Signup -> Readiness -> CLI Task`) and Journey 3 (`Returning Admin -> Usage/Readiness State -> Next Action`) against Track 3 Chrome + `propodus-cloud-smoke` observations.
  3. Record any remaining cross-repo friction, apply any website-owned fixes cleanly in this workspace (without editing `pricing*`, `signup/`, `admin/`, `shared/`, `cloud-flow/`, `404*`, or `cloud-app-manifest.json`), and update `#103` closure criteria honestly.
