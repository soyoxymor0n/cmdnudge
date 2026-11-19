---
name: vercel-deploy-flow
description: >-
  The workspace deploy workflow for Vercel projects: alpha (trunk, never deploys) →
  beta (closed test, /ship test) → main (production, /ship release), and the
  legacy beta-trunk flow for repos not cut over yet. Use when deploying, promoting a preview
  to production, asking "how do I ship this", or pushing the beta branch and
  wondering why prod didn't update.
---

# Vercel deploy flow (alpha → beta → main)

The owner's standard workflow across workspace projects. **Confirm per project**
— the production branch and IDs differ; check the project's deploy memory or
`.vercel/project.json`.

## Before anything else: a push is a deployment

All ~31 workspace projects deploy from ONE Hobby account — **100 deployments/day,
100 builds/hour, and a single concurrent build slot between them.** So the first
question is never "how do I deploy this" but "does this need to deploy at all".

- **A push that deploys happens only when the owner asks** (blueprint#370). The
  `PreToolUse` guard (`~/.claude/hooks/push-guard.mjs`) reads `vercel.json`
  `git.deploymentEnabled` from the commit being pushed: a push to a branch that
  never deploys (the trunk) is free; a push to a deploying branch (a promote to
  beta or main), a force push, tags, or a repo with no `vercel.json` needs an ask
  or a permit.
- **One push per request**, not one per commit.
- **Beta never deploys (blueprint#349, owner decision 2026-11-17).** `vercel.json`
  carries `git.deploymentEnabled { "**": false, "beta": false, "preview": true,
  "main": true }`, so a push to `beta` records no deployment at all and holds no
  build slot. Push beta as often as the work needs; it is free. The old
  `[skip vercel]` hack leaked: `VERCEL_GIT_PREVIOUS_SHA` is the last SUCCESSFUL
  deployment, which falls out of Vercel's shallow clone when every push is
  skipped, so `vercel-ignore.sh` falls back to BUILD (53 of 61 records in 8 h were
  CANCELED skips; regplan bc80957 and blueprint 7d4e49c built that way).
- **A preview is built on request**: `node $WORKSPACES_ROOT/blueprint/tools/preview.mjs <repo>`
  (`--sha <sha>` for another commit, `--dry-run` to plan). It pushes `origin/beta`
  to the **`preview`** branch (`--force-with-lease`), then polls the Vercel API
  until that deployment is READY, ERROR or CANCELED and prints state and URL.
  That push is a deployment on the shared account: only when the owner asks
  (push-guard), one per request.
- **`[skip vercel]` in the subject** is now OPTIONAL on `beta` (nothing builds there
  anyway) and still meaningful on `preview` and `main`: the house `ignoreCommand`
  (`tools/vercel-ignore.sh`) reads it, and also infers a skip from a diff confined
  to `docs/`, root `*.md`, `tests/`, `eval/` and `.github/`.
- **Fleet-wide rollouts (one change to every module)** go with
  `node $WORKSPACES_ROOT/blueprint/tools/fleet-push.mjs` (dry run) / `--push`
  (only when the owner asked), repo by repo; the pre-push hook gives an all-marked
  push the light ROLLOUT tier. The tools no longer flip a beta switch or keep a
  restore commit, and `tools/previews-guard.mjs` REFUSES a beta push whose HEAD
  `vercel.json` would deploy beta (`PREVIEWS_ON=1` overrides; fix the file instead).
  Production ignores the marker (`vercel-ignore.sh` checks paths only on `main`),
  so a promote always deploys it, and the gate before `main` runs the full check.
- **Never deploy to debug.** No "push and see", no `vercel --force`, no
  redeploy-to-bust-cache. `npm run build` locally answers the same question for
  free.
- Fluid **Active CPU is a different budget** — a Functions runtime metric (4
  CPU-hours/month on Hobby), spent by handlers, not by builds. Fixing deployment
  churn does not fix Active CPU, and vice versa. See `free-tier-budgets`.

## The branch model: alpha -> beta -> main (blueprint#370, 2026-11-17)

Check the repo first: `node $WORKSPACES_ROOT/blueprint/tools/trunk.mjs --dir .` prints `alpha` once moved,
`beta` for a repo not cut over yet (then the legacy sections below apply).

| Branch | Role | Deploys | Moves by |
|---|---|---|---|
| `alpha` | trunk, GitHub default; every agent and governor lands here | never (`deploymentEnabled.alpha: false`) | ordinary push, free (no ask) |
| `beta` | closed test at `beta.<domain>` | yes, preview target | `/ship test` only: ff from alpha, full suite, tag `vX.Y.Z-rc.N` |
| `main` | production | yes | `/ship release` only: ff to the rc commit on beta, tag `vX.Y.Z` |

- `vercel.json`: `git.deploymentEnabled { "**": false, "alpha": false, "beta": true, "main": true }`.
- The pre-push `branch-model` block enforces it: a promote to beta must already be on origin/alpha, a push to
  main on origin/beta (`SHIP_HOTFIX=1` only for the hotfix flow, `ship hotfix`).
- **Escape hatches.** A red test that is not yours: quarantine that one test with an issue ref, on alpha. On the
  trunk `PRE_PUSH_SKIP_TESTS=1 PRE_PUSH_SKIP_REASON=<repo>#<issue>` skips the tests loudly. On a promote the
  skip needs the owner's ask (push-guard). `--no-verify` needs the owner's ask. `ALLOW_PUSH=1` is retired.
- `tools/vercel-ignore.sh` judges beta like main (paths only, markers ignored): a promote always shows what it
  promoted. `tools/preview.mjs` and the `preview` branch are retired for moved repos.
- Versioning and release notes: `/ship test` computes the semver from the commits since the last final tag,
  writes the notes and `releases.ts`, commits `chore(release): <v> [skip vercel]` on alpha, then promotes.
  `/ship release` adds no commit. Skill `ship`.

## Branching (LEGACY: a repo whose trunk is still beta)
- Day-to-day work happens on the **`beta`** branch. `beta` is also the **GitHub
  default branch** on every workspace repo (changed 2026-08-17) — so cloud and
  mobile Claude Code sessions, fresh clones, `git worktree add` resolving
  `origin/HEAD`, and PR base pickers all land on the trunk instead of on stale
  `main`. Do not flip a repo's default back to `main`.
- Vercel's production branch is usually **`main`**. **Pushing `beta` deploys
  nothing** (neither production nor a preview; see above): a preview exists only
  after `tools/preview.mjs <repo>` pushed the commit to the **`preview`** branch.
- If someone says "I pushed but prod didn't change," this is almost always why;
  "I pushed but there is no preview" has the same cause, by design.
- **The stored setting can be right while the behaviour is wrong.** The claim
  that the Vercel production branch is independent of the GitHub default branch
  held until it didn't: on FineAlly (2026-08-29) `GET /v9/projects/{id}` reported
  `link.productionBranch: "main"` throughout, while the first push to `beta`
  built with `target: production` (beta deployed then; today the same check is on
  the first `preview` build). The project was an OLDER one whose git link
  was added after the fact, and that path appears to take the production branch
  from the repository's default at connect time. There is no API that accepts a
  correction (`PATCH /v9/projects/{id}` rejects both `productionBranch` and a
  nested `link`); the fix is the dashboard, or rebuilding the link with the
  repo default temporarily set to `main`.
  **So verify with a real push, not by reading the setting:**
  `GET /v6/deployments?projectId=…` → the `preview` branch's deployment must
  report `target: "preview"` (`tools/preview.mjs` reads this record for you). Do this on any project that reused an existing Vercel
  project; a fresh `vercel link` has never got it wrong.
- **Every project gets `beta.{domain}` pinned to the `preview` git branch** (it
  was `beta` before #349) — a required step, not a scaffold nicety (blueprint
  `docs/env-isolation-instruction.md`). It shows the last preview someone
  requested with `tools/preview.mjs`, instead of the ephemeral `*.vercel.app` URL
  of the latest deployment. `scaffold.js` adds it (Phase 2, step 5c); a project
  that REUSED an existing Vercel project never ran that phase and will be missing
  it — add it with `POST /v10/projects/{id}/domains` `{ name, gitBranch: "preview" }`,
  or re-pin an existing one with `PATCH /v9/projects/{id}/domains/{domain}`
  `{ gitBranch: "preview" }`. The env scopes are unchanged (Preview applies to any
  non-production branch). A 302 to Vercel SSO on that hostname is correct:
  previews are protected on purpose.

## Promoting a preview to production (LEGACY; moved repos use `/ship release`)

Promotion is a deliberate, manual step. **The whole promote is one push:**

```bash
ALLOW_MAIN_PUSH=1 git push origin beta:<production-branch>   # usually main
```

`main` IS the configured production branch, so the push is the trigger: Vercel
builds it at production target, and `main` cannot drift, because moving it is
the mechanism rather than a follow-up chore. (The `ALLOW_MAIN_PUSH` opt-in is a
local guard hook on workspace repos; this is exactly the case it exists for.)

**Do NOT also redeploy the preview via the API.** The older recipe here was
`POST /v13/deployments {deploymentId, name, target:"production"}` FOLLOWED BY a
`main` sync - which builds the same commit twice, once per trigger (observed on
regvoice, 2026-08-17). Use the redeploy form ONLY when you deliberately need to
promote a commit that is NOT the head of the trunk - a rollback, or promoting an
older preview. Note the `/promote/` endpoint returns **422**; the redeploy form
above is the one that works. Authenticate with `VERCEL_TOKEN` (by env-var name
only - never echo the value).

If `main` has commits `beta` does not (a hotfix pushed straight to `main`), the
push is **rejected**. Do not force. Merge `main` into `beta` first, then push.

### A green preview does NOT prove the production build works

Promoting rebuilds; it does not ship the artifact you tested. Any env var that
differs by Vercel scope produces a genuinely different production build, and
**build-time-inlined vars are the trap**: a Vite `VITE_*` var is baked into the
client bundle, so a project whose `VITE_CLERK_PUBLISHABLE_KEY` differs per scope
ships `pk_test_` in the preview bundle and `pk_live_` in production. The preview
never exercised the live key - sign-in is the classic thing that is green on
preview and broken in production.

So: one smoke check after a promote, and no more than that.

```bash
curl -sS https://<domain>/api/health
```

### But check the DEPLOYMENT first - a healthy endpoint proves nothing

`/api/health` answers `ok` whether or not the promote actually shipped, because
the PREVIOUS production build is still serving it. A promote that never built
therefore looks exactly like one that worked: the push is clean, the pre-push
suite is green, the health check passes, and production quietly keeps serving
last week's code. Observed twice on 2026-09-10 (regplan, then regvoice) - both
times the deployment had been skipped by the `ignoreCommand`, because Vercel
builds from a SHALLOW clone and a promote spanning many commits cannot always
reach `VERCEL_GIT_PREVIOUS_SHA`; the script then fell back to the head commit's
subject, which happened to be a docs-only `[skip vercel]` one sitting on top of
all the real work.

Two consequences, both cheap:

1. **`tools/vercel-ignore.sh` must BUILD when it cannot see the range.** A
   marker only ever describes the commit it sits on; losing sight of the range
   does not make the unmarked commits under it disappear, it makes them
   invisible. Fixed in the blueprint 2026-09-10 - make sure the project's copy
   is in sync, since a stale copy fails silently and in the expensive direction.
2. **After a promote, read the deployment's own state, not the app's.** One
   call, and it is the difference between "shipped" and "looked shipped":

```bash
curl -s -H "Authorization: Bearer $VERCEL_TOKEN" \
  "https://api.vercel.com/v6/deployments?projectId=<id>&teamId=<team>&target=production&limit=1"
# state must be READY, and meta.githubCommitSha must be the commit you promoted.
# CANCELED means the ignoreCommand skipped it - production did NOT change.
```

**Never end a promote on a green health check alone.** The one signal that
distinguishes the two outcomes is the deployment record; the endpoint cannot.

**A practical habit that avoids the whole class:** put the `[skip vercel]` docs
commit UNDER the code, or push it separately - do not leave a marked commit at
the head of a range you are about to promote.

Deeper checks (schema-version comparisons, env audits, deployment archaeology)
are ONE-TIME diligence for a project, not per-promote work - record what they
find in the project's CLAUDE.md and deploy memory, then stop repeating them. The
one release that still deserves care is a **non-additive migration**, because
the schema bootstrap runs DDL on the first request of every cold start: if
preview and production share a database, that migration lands on production the
moment it hits `beta`, before anyone promotes anything. See `env-isolation`.

## Credentials
The working `VERCEL_TOKEN`, Turso API token, and other provisioning keys may
live in a machine-global secrets file outside any repo, not necessarily in the
project `.env`. The project's own `.env` / Vercel env holds runtime secrets like
`PIPELINE_SECRET`. Refer to all of these by name; never print their values.

## Env var promotion (`_PROD` convention)

`template/tools/push-env.mjs` (`npm run env:push` in a generated app) is the
**only sanctioned way** to push env vars to Vercel — never paste values into
the dashboard by hand. It applies the `_PROD` -> scope mapping below
automatically and a `--dry-run` shows name + scope + a value fingerprint, never
the value itself.
Blueprint-based projects' `.env` may hold a `_PROD`-suffixed twin of a var
(e.g. `CLERK_SECRET_KEY_PROD` next to `CLERK_SECRET_KEY`) whenever a service
needs a genuinely separate production credential — a distinct live instance,
not just a different value of the same one (Clerk's `pk_test_`/`pk_live_`
split is the recurring case). No app code reads the `_PROD` name; it only
exists so the value has somewhere to live locally before being pushed.

When pushing env vars to Vercel:
- Push the **unsuffixed** name/value to the **Preview + Development** env scopes.
- Push the **`_PROD`** value under its **unsuffixed** name to the **Production**
  scope only (strip the `_PROD` suffix — Vercel env vars aren't scope-aware by
  name, the suffix is purely a local-file staging convention).
- The **app database and the R2 bucket are MANDATORY `_PROD` splits**: a preview
  must never read or write production data, because the schema bootstrap runs
  DDL against whatever `TURSO_DATABASE_URL` points at on the first request of
  every cold start — so a shared DB means pushing `beta` migrates production
  before anyone promotes anything. Preview stores are the production name plus
  `-preview` (`<slug>-db-preview`, `<slug>-storage-preview`), and a
  blueprint-based app REFUSES to start when the pairing is wrong. Full rule:
  `$WORKSPACES_ROOT/blueprint/docs/env-isolation-instruction.md`.
- The central-logs DB, Upstash Redis, Resend, and the AI providers stay on ONE
  instance across every environment and have no `_PROD` twin — don't invent one
  (isolate the shared ones by project slug / key prefix instead).
- Via REST: `POST /v10/projects/{id}/env?upsert=true` with `target` set to
  `["production"]` or `["preview","development"]` per push (see the
  `scaffold` skill's Phase 9 for the full env-push flow).

## Crons / schedules
Production background jobs are typically triggered by Vercel crons +/or a queue
schedule (see the **background-pipeline** skill). A shared free queue account
may be used across several projects, so watch the shared daily message quota.

See also: **house-stack**, **background-pipeline** skills.

## No deployments as a debugging move

Reproduce locally. A push or redeploy is a deployment on the one shared Hobby account, never a probe.
