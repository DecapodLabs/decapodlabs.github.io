# Validation workflow installation pending

Decapod v0.148.0 successfully executed `decapod init` in the official
`DecapodLabs/decapodlabs.github.io` checkout during site bootstrap.
The installer generated a native `.github/workflows/decapod-validate.yml`.
The GitHub Actions installation token cannot create or modify a
workflow file without the separate `workflows` permission. The prior
run's commit was therefore rejected.

The exact generated workflow text is retained in
[bootstrap/decapod-validate.workflow.txt](bootstrap/decapod-validate.workflow.txt).
It is **not** an installed or executed validation gate. Installation
requires an authorized operator with workflow-writing permission.
This explicit gap does not change the `.decapod/` specifications,
accepted human intent, or make the website appear validated.
