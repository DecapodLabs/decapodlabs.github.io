# Pi proof-video recording

The two films use the same recorded run. The original experiment and its stale-proof and quarantine controls remain in [the earlier run archive](../pi-1758-20261117-01/README.md).

Pi 0.73.1 ran headlessly using the authorized openai-codex gpt-6.1-sol alias and the pinned Decapod 0.148.8 binary. The single objective was “Implement the repository-scoped read authorization described in README.md and publish a verified pull request.” Pi received no follow-up prompt or controller repair. The required engineering check failed at dfc10cc945e33d36fa4ac17ac2fb82cc4a6520c9. Pi read the actual assertion, edited src/access.cjs, and obtained fresh successful authorization-contract and guard-contract executions.

Publisher readback and independent GitHub metadata matched [PR #4](https://github.com/alexhraber/decapod-admission-acceptance-20261117-1747-06/pull/4) at head a402d49d245bed1b45a9282ef823aa152def96ce and base ada3eb89c3707801a5b86265dccc899fdabe5e1c. The validation receipt is in kernel.json under the successful validate entry. There is no merge authorization.

During the live process, a read-only terminal recorder wrote actual Pi tool starts, commands and returned tool output to a private timestamped cast. The published terminal-excerpts.json selects excerpts with raw event and cast offsets plus native invocation hashes where applicable. The proof video shortens idle waits, abbreviates commands, redacts private paths and presents selected native JSON fields. The independent readback summary follows the recorded process. Raw operational output and authentication remain private.

Use the existing [portable headless reproduction carrier](https://github.com/alexhraber/decapod-admission-acceptance-20261117-1747-06/tree/3c6c373ea703144a2a096e7c3ad6b17c45fcdc38/capture-tools) and a fresh issue-owned checkout to repeat the engineering run. Record new observations independently. Reproduce the two edits with Python 3.11+, FFmpeg and the existing pinned renderer dependencies:

    python scripts/render-launch.py --evidence evidence/pi-1758-20261117-01
    python scripts/render-proof-video.py --recording evidence/pi-1758-proof-video-03/terminal-excerpts.json
    python scripts/verify-launch.py

See [Decapod #1758](https://github.com/DecapodLabs/decapod/issues/1758) for run ownership, failed startup and workspace attempts, the fixture ledger and exact refs.
