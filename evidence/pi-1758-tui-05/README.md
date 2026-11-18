# Live Pi terminal recording

[Watch the actual TUI on Decapod Labs](https://decapodlabs.github.io/#proofs) and [inspect GitHub PR #6](https://github.com/alexhraber/decapod-admission-acceptance-20261117-1747-06/pull/6).

Pi 0.73.1 ran its normal interactive terminal UI in a pseudoterminal using openai-codex / gpt-6.1-sol and pinned Decapod 0.148.8. A headless terminal emulator rendered the native ANSI stream. Chromium's compositor recorded the viewport as actual pixels, with fewer than one frame interval of usual sampling delay between distinct states. The video follows the measured live timeline at original speed, from the expanded-tool setup to the final result. Opaque masks cover private paths, credentials and private shell details. Raw pixel frames, terminal bytes and credentials remain private.

The controller supplied one prompt. Pi encountered the required authorization-check failure, diagnosed the missing repository grant, edited the source, obtained fresh evidence and invoked the native publisher on its own. The observed head is 4cea13d000edb911c60e2e857301bb50c4479872 and the accepted base is ada3eb89c3707801a5b86265dccc899fdabe5e1c. Independent GitHub reads matched both. The first invalid candidate was 3240002405a3e59cf10167528bb2199c40509007. The fresh required-check receipt is sha256:a5009df673a890df88b2f17e766b86d40769c1e479f5047dd13429c48124f825; the native publisher and GitHub readback are distinct observations. Admission grants no merge authorization.

This run had 35 tool calls, 142 correlated events and zero follow-up inputs. Display setup expanded tools before the single prompt. It introduces no agent repair or fabricated tool display. The first interactive attempt had a viewport gap and is separately recorded under [Decapod #1758](https://github.com/DecapodLabs/decapod/issues/1758). Prior runs and their adversarial controls remain available in [the earlier experiment archive](../pi-1758-20261117-01/README.md).

Reproduce the edited case study in a full-history checkout with the existing Python and FFmpeg dependencies:

    python scripts/render-launch.py --evidence evidence/pi-1758-20261117-01
    python scripts/verify-launch.py

The verification workflow checks and packages the reviewed TUI recording by digest. An actual observed recording can be copied from its source, but cannot be recreated from a summary. The frame ledger records the private original and masked pixel digests and times. [Portable fixture and observation procedure](https://github.com/alexhraber/decapod-admission-acceptance-20261117-1747-06/tree/3c6c373ea703144a2a096e7c3ad6b17c45fcdc38/capture-tools) documents how to run a new independently observed experiment.
