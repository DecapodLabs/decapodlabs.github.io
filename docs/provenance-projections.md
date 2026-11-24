# Public Proof & Provenance Projections

**Scope:** Published proof, case-study, and metrics presentation artifacts in `DecapodLabs/decapodlabs.github.io` (`index.html#proofs`, `proof.html`, `media/launch-production.json`, `assets/decapod-*-render.json`, and `evidence/*`).

**Normative Boundary:** Every published proof page, video, render report, and redacted JSON witness in this repository is a **derived, non-authoritative presentation projection** of historical runs. None of these artifacts is a Decapod kernel decision source (`publication_ready: false`, `merge_authorized: false`), none grants live repository/PR/merge admission, and none attests Decapod Cloud purchase or entitlement readiness.

---

## 1. Inventory of Published Proof, Case-Study, and Metrics Artifacts

| Surface / Path | Artifact Kind | Canonical Source Reference | Generation / Schema Version | Freshness & Admission Scope |
| --- | --- | --- | --- | --- |
| `index.html#proofs` | Public terminal proof embed & chapter links (`data-proof-seek` 52s / 108s / 140s) | `evidence/pi-1758-tui-06/manifest.json` (`head: a063de9040c458204eace1929d1e8536ad048a88`, `base: ada3eb89c3707801a5b86265dccc899fdabe5e1c`, PR #7) | `decapod.pi-tui-release.v1` via `assets/decapod-proof-render.json` | Historical observed demonstration (`merge_authorized: false`). Admission on PR #7 grants no merge authorization. |
| `proof.html#case-study` & `#recorded-run` | Case study film + receipt table + earlier fixture narrative + assurance boundary | `evidence/pi-1758-tui-06/*` (primary recorded run) + `evidence/pi-1758-20261117-01/*` (earlier fixture & post-run stale/quarantine controls) | HTML static projection + `media/launch-production.json` (`decapod.launch-production.v1`) | Historical demonstration. Explicitly distinguishes PR #7 from superseded/stale PR #2 (`current_admission_applicable: false`). |
| `assets/decapod-proof.mp4`, `.vtt`, `-poster.png`, `assets/decapod-proof-render.json` | Native PTY raster proof video, WebVTT captions, poster, and release digest manifest | `evidence/pi-1758-tui-06/tui-capture.json` (`sha256:83493835f6f67ed0f51ca1e6d28504f21e4d6216e712d467a993a9b1355bec89`) & `tui-pixels.json` (`sha256:ce2740bb65e28cefa65cd21cd54bf044dfe0b202aa438b3c13c2844495c98411`) | `decapod.pi-tui-release.v1` (1920×1160, `duration_ms: 150250`) | Byte-pinned by `scripts/check-launch.ts`; encoding changes require re-running verification and publishing a governed PR. |
| `assets/decapod-launch.mp4`, `-mobile.mp4`, `-social.mp4`, `.vtt`, `-poster.png`, `assets/decapod-launch-render.json` | 56s main/mobile and 12s social case-study cuts + render provenance ledger | `evidence/pi-1758-tui-06/manifest.json` (`sha256:3b38ca4138d7f33ca8da0f28250f410c9b22f387f9b44794e89fa42d6caed75e`) + `media/launch-production.json` (`sha256:f64fd4e59a0738e648590ad9669e90efdc9600a874419e2f94d5d2e4ec63dbe0`) | `decapod.launch-render.v1`, rendered via `scripts/render-launch.py` + `scripts/render-showcase.py` (Python 3.12.15, Pillow 11.3.0, numpy 2.3.4, CairoSVG 2.7.1, FFmpeg 9.0.2) | Verified by `scripts/verify-launch.py` and `scripts/check-launch.ts`. |
| `evidence/pi-1758-20261117-01/` | Redacted witness export, native publication receipt, canonical record, post-run controls, and archive seal | Immutable archive `alexhraber/decapod-admission-acceptance-20261117-1747-06@3c6c373ea703144a2a096e7c3ad6b17c45fcdc38` (`tree: f0ea3415b31ba80313dece137644ba18d7f893a0`); PR #2 (`f3a7a160946b42fed7eefa3898362f0dbb122fd0` -> `4b7f3b05637120a2ac6d638c46a13288fa6d74ce`) | `decapod.agent-acceptance.v1`, `decapod.publication-proof-readback.v1`, `decapod.post-run-controls.v1`, `decapod.fixture-archive-seal.v1`, `decapod.launch-objective-provenance.v1`, `decapod.real-agent-runtime.v1` | **Expired / Stale-Green Historical Reference**: target advanced to `ada3eb89c3707801a5b86265dccc899fdabe5e1c`; `current_admission_applicable: false`, `publication_ready: false`, `merge_authorized: false`. |
| `evidence/pi-1758-proof-video-03/` | Archived headless run (PR #4) | `alexhraber/decapod-admission-acceptance-20261117-1747-06/pull/4` (`head: a402d49d245bed1b45a9282ef823aa152def96ce`, `base: ada3eb89c3707801a5b86265dccc899fdabe5e1c`) | `decapod.agent-acceptance.v1` | Historical archived export (`publication_ready: false`, `merge_authorized: false`). Superseded for homepage/case-study display by `pi-1758-tui-06`. |
| `evidence/pi-1758-tui-05/` | Archived earlier TUI capture (PR #6) | `alexhraber/decapod-admission-acceptance-20261117-1747-06/pull/6` (`head: 4cea13d000edb911c60e2e857301bb50c4479872`, `base: ada3eb89c3707801a5b86265dccc899fdabe5e1c`) | `decapod.agent-acceptance.v1`, `decapod.pi-tui-capture.v1`, `decapod.pi-tui-pixels.v2` | Historical archived export (`publication_ready: false`, `merge_authorized: false`). Superseded by `pi-1758-tui-06`. |
| `evidence/pi-1758-tui-06/` | Current TUI capture & witness bundle backing `#proofs` and `#case-study` | `alexhraber/decapod-admission-acceptance-20261117-1747-06/pull/7` (`head: a063de9040c458204eace1929d1e8536ad048a88`, `base: ada3eb89c3707801a5b86265dccc899fdabe5e1c`) | `decapod.agent-acceptance.v1`, `decapod.pi-tui-capture.v1`, `decapod.pi-tui-pixels.v2` | Historical observed run (`publication_ready: false`, `merge_authorized: false`, `human_interventions: 0`). |

---

## 2. Kernel, Observer, and Deterministic Binding Pinning

1. **Kernel & Observer Provenance:**
   - **Decapod kernel:** `0.148.8`, source commit `18cbb30ca4d16a80810d8f3c0cecfc4073a83cbc`, binary `sha256:35b01d60367b8df72ce7097e43c676bd59165540a9b031a29d4308266e13a274`.
   - **Read-only observer:** source commit `ebf206dbdc173509e08ef5789a5d8cb74165e016`, binary `sha256:a9a002213f5e5934d1ae131348186879ae78e1f774524fdfc6ce933f9898eab5`.
   - **Observer event binding invariant:** Every event `id` in `manifest.json` is deterministically derived from `sha256("${capture.run_id}:${event.sequence}:${artifact.sha256}:${pointer}")`, and every witness file (`host.json`, `kernel.json`, `git.json`, `github.json`) is regular-file verified and SHA-256 matched against `capture.json`.

2. **Exact Publication-Time Proof vs. Standalone / Task Completion Receipts:**
   - In `evidence/pi-1758-20261117-01/`, `publication-record.json` (`decapod-readiness-T7sSlC`, `record_digest: sha256:8975febbf5c1e98c2eabf66cb7ca79659fcebb4824aa33958751548e7cdaa7bd`) and `publication-receipt.json` (`receipt_hash: sha256:0bd96cd0bad9992a3ca1e475e9394573928254830900066f7b9c4bc24ec3e5eb`, file `sha256:c2f5d9e209ae2fedc8a490ade9ee54db0cb80f7fe2cb1ad15405943182e0aaa8`) bind the publisher-invocation proof inside `[started_ns, ended_ns]`.
   - `scripts/check-launch.ts` verifies canonical JSON digests and cross-references (`proof_plan_digest`, `evidence_digest`, `material.head_revision`, `material.accepted_base_revision`) without inventing a parallel Rust typed-proof verifier.

3. **Freshness & Stale-Green Invalidation:**
   - Historical admission expires whenever the candidate head changes (`PR_CREATED_NOT_ADMITTED`, `WORKUNIT_PROOF_STALE`, `GOVERNANCE_CHECKPOINT_MISSING`) or the accepted target advances (`STALE_ACCEPTED_BASE`).
   - `evidence/pi-1758-20261117-01/manifest.json` records `findings: ["FORGE_SUBJECT_NOT_CURRENTLY_CORRELATED", "SOURCE_OR_BASE_CHANGED"]` and `current_admission_applicable: false`. Relabelling any historical export or readback wrapper as `current_admission_applicable: true`, `publication_ready: true`, or `merge_authorized: true` must fail offline presentation verification.

---

## 3. Redaction & Non-Authoritative Boundaries

1. **Redaction Contract:**
   - Published `evidence/*`, `media/*`, and `assets/*.json` artifacts must never contain credentials, OAuth/API tokens (`ghp_`, `gho_`, `github_pat_`, `sk_live_`, `sk_test_`, `Bearer `), personal emails, local user filesystem paths (`/Users/...`, `/home/...`), or raw private PTY/ANSI streams (`host.json` retains `redaction: "reasoning, narration, arguments and tool output omitted"`).
   - `tests/provenance_projection_72_test.ts` enforces automated scanning across all published proof/metrics files plus negative redaction fixtures.

2. **Non-Authoritative Boundaries:**
   - Public site assets never grant kernel admission, PR merge authority, or Cloud subscription readiness.
   - `scripts/check-site.ts` and `scripts/check-launch.ts` run offline (`--no-remote --no-npm --allow-read=.`) and explicitly report `merge_authorized: false`, `deployed_playback_verified: false`, and `hosted_purchase_verified: false`.

---

## 4. Republishing a Corrected Projection Without Rewriting Canonical Proof

When an editorial caption, video encoding, HTML summary, or readback wrapper needs correction while keeping original canonical proof untouched:

1. **Preserve Immutable Sources Untouched:**
   - Do **not** alter `evidence/pi-1758-20261117-01/publication-record.json`, `publication-receipt.json`, `human-mission.txt`, `controls.json`, or the immutable GitHub archive (`3c6c373ea703144a2a096e7c3ad6b17c45fcdc38`).
   - Do **not** edit observed `kernel.json`, `github.json`, `host.json`, or `git.json` witness arrays.
2. **Update Only the Derived Projection Surface:**
   - For editorial/media fixes: update `scripts/render-launch.py` or `media/launch-production.json` (in a governed isolated worktree), then regenerate:
     ```sh
     python scripts/render-launch.py --evidence evidence/pi-1758-20261117-01
     python scripts/verify-launch.py
     ```
   - For HTML/wrapper presentation fixes: update `proof.html`, `index.html`, or supplement notes (`README.md`) while keeping exact cited commit SHAs, receipt hashes, and `merge_authorized: false` / `current_admission_applicable: false` flags intact.
3. **Verify Reproducibility & Non-Authority Before PR:**
   ```sh
   python scripts/test-launch-evidence.py
   deno run --no-remote --no-npm --allow-read=. scripts/check-site.ts
   deno test --no-remote --no-npm --allow-read=. tests/
   decapod validate
   ```
4. **Publish via Governed PR:**
   - Update `.decapod/managed/specs/` and `.decapod/governance.json` checkpoints; never rewrite published canonical archive commits or force-push `main`.
