---
name: issues-as-features
description: GitHub issues are the source of truth for features in reg* projects - file the issue before code, #N in feat/fix commits, labels, drift check. Use when designing or committing a feature.
---

# Issues are the source of truth for features (all `reg*` projects)

The feature docs (`docs/features/*.md`) describe; the issue says whether it exists and how far it is.

1. **Designing a feature = file the issue FIRST** (`[F<id>] <title>`, label `feature`, what/why/acceptance),
   before the first line of code. A feature heading in the docs with no issue is drift.
2. **Every `feat:`/`fix:` commit carries `#N`** (subject or body). `commit-msg` checks it locally, the
   pre-push hook checks the pushed range, CI re-checks on push. `COMMIT_MSG_SKIP=1` is for emergencies
   and gets reported.
3. **Status lives in labels:** open = designed/in progress; `built` = committed locally; `on-beta` = pushed
   to beta (workflow adds it and closes `feature` issues); `released` = promoted to main. When the owner
   pushes or promotes by hand, check the issue moved.
4. Docs and issues must agree: `node tools/feature-drift.mjs` (blueprint module `issue-discipline`). Run
   it before saying a feature is done; fix drift, don't report it.
