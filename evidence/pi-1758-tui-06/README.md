# Pi terminal proof recording

[Watch the proof video](https://decapodlabs.github.io/#proofs), [watch the matching case study](https://decapodlabs.github.io/proof.html#case-study), or [inspect GitHub PR #7](https://github.com/alexhraber/decapod-admission-acceptance-20261117-1747-06/pull/7).

Pi 0.73.1 ran its interactive terminal UI in an 84 × 29 pseudoterminal using openai-codex/gpt-6.1-sol and Decapod 0.148.8. The recorder retained the original, timed ANSI output. A pinned terminal parser replayed that stream into 1920 × 1160 frames at original speed using a higher-contrast palette and Menlo. The edit keeps selected moments at original speed and omits setup and wait intervals. The frame ledger identifies those source ranges. Private paths and credentials have opaque masks. Raw ANSI bytes and private frames remain private. The frame ledger commits to source byte offsets, terminal states and rendered frames.

The controller provided one objective. Pi encountered a failing required authorization check, investigated the missing repository grant, repaired the implementation, and called the Decapod publisher. Pi made 43 tool calls with zero follow-up inputs. The case study derives from the independent observer’s 173 correlated events, native Decapod records and real GitHub readback.

- Rejected candidate `ed086de6691d92da623febfaa6b411514828440e`
- Admitted head `a063de9040c458204eace1929d1e8536ad048a88`
- Accepted base `ada3eb89c3707801a5b86265dccc899fdabe5e1c`
- Fresh receipt `sha256:bcd043bc1cec93ccb51d227c699ef137014bb54ab7714518404c60de8b888542`

The native publisher and independent forge readback are distinct observations. Admission grants no merge authorization.

Render the matching case-study cuts in a full-history website checkout with the existing Python and FFmpeg dependencies:

    python scripts/render-launch.py --evidence evidence/pi-1758-20261117-01
    python scripts/verify-launch.py

The [portable fixture and observation procedure](https://github.com/alexhraber/decapod-admission-acceptance-20261117-1747-06/tree/3c6c373ea703144a2a096e7c3ad6b17c45fcdc38/capture-tools) supports an independently observed experiment. The [previous Pi recording](../pi-1758-tui-05/README.md) and [earlier stale-evidence controls](../pi-1758-20261117-01/README.md) remain archived.
