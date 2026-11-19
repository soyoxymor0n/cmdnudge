# goal-implement-all: the overnight build and the morning review

> Canonical copy: `blueprint/docs/standards/goal-implement-all-instruction.md`. Stamped copies, byte-identical,
> sit in each repo as `docs/standards/goal-implement-all-instruction.md` and `.claude/skills/goal-implement-all/SKILL.md`.
> Edit here, then re-stamp. Written 2026-11-01 from the owner's interview; the record is in section 16.

## 1. What it is

The owner types `/goal-implement-all` once. That starts one long autonomous run (a `/goal`-style continuous run with
a done-condition). The run implements every open feature, fix and decision-backed change it can, in phases, and
commits each green phase with a tag. It then runs `/app-walk`, makes one push to the trunk (`alpha`) at the end, and leaves a
report and a decisions document for review.

`/goal-implement-all morning` is the next-day review: a summary of the run, an interview on the decisions, and a
sync of feature and issue status with what was built.

The owner types nothing else during the night.

**Launch.** The command takes one optional parameter. `/goal-implement-all` (or `local`) runs in the current session,
which must stay open. `/goal-implement-all cloud` creates a cloud routine instead. Cloud is opt-in, because routines
often lack permissions that a local session has. A cloud run's first step is `node tools/cloud-selftest.mjs`; if git push or GitHub REST fails it stops with an `owner-action` issue. Where `AskUserQuestion` is unavailable, every skill follows the `owner-questions` rule "No one to ask" (safe default, `owner-action` issue with a `decision` block, continue). The owner chose this on 2026-11-01.

## 2. The done-condition

The run works until this holds. It never stops early for a choice it can make itself.

> Every feature, fix and decision-backed change from the sources in section 3 is implemented, tested and committed
> on the trunk (`alpha`), except items that need something only the owner can do (promote or release, spend above the cap, an
> account or secret the owner must create). Each stand-in is logged in the decisions document. The app-walk has run
> and its fixes are committed, and every screen of an app that has `npm run check:load` is inside its load budget
> (`loading-instruction.md`), or the remaining gap is a `todo` issue with its measured breakdown. One push to the trunk (`alpha`) per repo has been made at the end. Stop when this holds, or when a
> stop rule in section 13 ends the run.

The done-condition is written out in full, so the run does not depend on whether the host has a native `/goal`
command.

## 3. Sources

- Feature rows marked 🔨 (in progress) or 📋 (planned) in the repo's feature doc. In regsupply:
  `docs/features/regsupply-features.md`.
- Open GitHub issues labelled `feature` or `fix`.
- Open items in the repo's decision docs (`docs/decisions/*.md`) that are not built yet.
- Never built overnight: issues labelled `owner-action` (the owner's job). A `todo` issue is built only when a
  feature-doc row or an open decision backs it (owner, 2026-11-08); the rest are listed in the morning report.
- **Dependencies first (owner, 2026-11-08, blueprint#166).** Preflight also scans the blueprint and regops-suite for
  open issues whose body carries `needed-by: <this repo>#N` (any label but `owner-action`). They become the first
  phases and are built in THEIR repo, in dependency order: blueprint, then regops-suite, then this repo. Each touched
  repo gets its own permit and one push (section 12). The owner never has to remember to start a run there.
- Other repos: a feature may need a change in another RegOps module repo. Section 7 covers that.

## 4. Phases and badges

- **Plan first.** The run cuts the work into at most six phases. Each phase is one coherent, testable chunk. The
  plan goes to `docs/plans/goal-<YYYY-MM-DD>.md` with, per chunk: the issue numbers, the files, the model and effort
  (section 5), and the acceptance test.
- **Green** means the phase's tests pass and its commits are on the trunk (`alpha`). A green phase gets an annotated tag,
  `goal/<YYYY-MM-DD>/phase-<N>`, on its last commit in each repo it touched. Tags stay local. They are not pushed.
- **Commits.** One commit per issue, with `feat:` or `fix:` and `#N` in the subject. A docs-only commit carries
  `[skip vercel]` in its subject, per the house rule.

## 5. Models

- **Orchestrator:** Opus 5.5, medium effort, high when a chunk needs it. It plans, splits the work, reviews every
  diff and decides.
- **Workers:** Haiku 5.5 at extra-high effort, by default.
- **UI/UX and landing content** are planned or defined by Opus 5.5 before implementation, for example a screen's
  layout, states and copy. Workers build to that spec. Opus reviews the result. The owner's reason: Opus's output
  quality here is much higher. Added 2026-11-01.
- **Sonnet 5.5** only for a hard chunk: when `jev` says so, or the plan marks the chunk hard.
- **jev** decides. The orchestrator asks `jev` which model and effort a chunk gets, with `node tools/jev-chunk.mjs`
  (#242, owner ruling 2026-11-13). `jev` is a decision model: the tool calls the Vercel AI Gateway's decision API
  (`/typesafe/v1/systemone`), never chat completions, and books each call in `.fleet/jev-chunk-spend.json`. If the call fails, times out or answers unclearly, the chunk gets Haiku 5.5 at extra-high.
  Each `jev` call costs well under $1 and counts against the spend cap (section 9).
- **jev payload.** The issue, acceptance-test names and the chunk's code may be sent. Customer data stays out of the run's payload (the owner's 2026-11-13 decision on runtime use of Jev is in `docs/decisions/goal-2026-11-10.md`, Morning interview). The owner
  judged this run's code not sensitive (anyone with a subscription can build similar code), and customer data is not
  part of implementation work anyway. The Hobby plan rejects zero data retention (synced note `jev-ai-gateway-key`),
  so it stays out of the payload. The key is `JEV_AI_GATEWAY_API_KEY`; its value is never printed or written anywhere.
- This overrides the house delegation default (Haiku at low effort) for this command only. The owner chose it.

## 6. One orchestrator per repo

Each repo has one long-lived orchestrator. When the run needs a change in a repo:

1. If that repo's orchestrator is running, message it through agent communication.
2. If none is running, start one for that repo.
3. Either way, the brief is a GitHub issue in that repo, filed by the run's orchestrator. It says what changes, why,
   and the acceptance tests, and its body carries one line `needed-by: <repo>#N` naming the issue that waits for it.
   That line is what the next run's preflight finds (section 3), so a change that cannot land tonight is still built
   first next time. The issue is the steering.

The repo's orchestrator implements the change in its own repo (worktree only if section 7 requires it), commits on
that repo's trunk (`alpha`), and reports back to the run.

## 7. Other repos and the blueprint

- **Scope.** Any RegOps module repo. Changes there are committed on that repo's trunk (`alpha`; `tools/trunk.mjs`). Nothing is pushed except in
  the final push (section 12).
- **Worktree only when needed.** Use a git worktree for a cross-repo change that cannot be made in the attached
  tree, or when a merge conflict forces it. Otherwise work in the main tree.
- **Cannot land.** A merge conflict, a dirty tree that is not ours, or missing access stops that change. File a
  GitHub issue in that repo with the exact change, and log it in the decisions document. Do not force it.
- **Generic fixes go to the blueprint.** When a fix is not specific to the project, the generic version is committed
  on blueprint `alpha` during the run. Stamping it into the fleet waits for the morning (section 15, step 5).

## 8. The red ladder

When a chunk's tests fail:

1. Retry the same worker twice. Each retry gets the failure output and a direct instruction: fix the code or the
   tests, whichever is wrong.
2. Still red: one fix attempt by a more capable model, Opus 5.5 at high effort.
3. Still red: stop the run. Drop the red phase's uncommitted work. Keep the green phases committed and tagged. The
   morning report leads with the failure.

## 9. Decisions, stand-ins and hard limits

The run decides and goes on. Nothing waits for the morning except the two hard limits below.

- **Stand-in.** When a decision is open, the run picks the option it is most confident in and that is easiest to
  reverse, builds it, and logs it. This covers every decision type, including schema or stored data, auth and
  permissions, legal, regulatory and public copy, and new services. Stand-ins still obey the project's own rules: a
  negative authz test per caller-supplied id, the `SCHEMA_VERSION` bump, and the test triage in CLAUDE.md.
- **Decisions document.** `docs/decisions/goal-<YYYY-MM-DD>.md` in the home repo, the repo the command was typed in.
  One entry per decision: the question, the background, the options, the stand-in chosen and why, how reversible
  it is, the files and commits involved, and what the owner should decide. Cross-repo decisions go in the home repo
  too, naming the repo.
- **Hard limit 1, spend.** External spend is capped at $1 per night in total. External spend is money the run pays
  out: `jev` calls, paid API calls, new paid services or plans. The owner's Claude subscription usage is not counted,
  but the morning report shows it. At the cap the run stops buying and finishes with what it has.
- **Hard limit 2, release.** Promote to `main` and release are always the owner's. The run never promotes.
- **Owner action.** Anything that needs the owner's own act (creating an account, a secret value, a DNS record) does
  not block the run. The run builds what it can without it, logs the item, and files an `owner-action` issue in the
  morning, only once the owner confirms.
- **Owner-action issues already open.** The run never answers, closes or comments on one. Where such an issue only
  gates an item a source names, the run takes the option the issue recommends as a logged stand-in, if it is
  reversible and buildable in the repo; otherwise the item stays unbuilt. Nothing else behind the issue is built.
  (Owner, morning of 2026-11-02.)

## 10. Tests and gates

- Per phase, in each touched repo: lint, build and `test:affected`, or the repo's named equivalents. A red result
  goes to the red ladder (section 8).
- A phase that adds or changes a screen, a list or a data read also runs `npm run check:load` (and `check:bundle`)
  in a repo that has them, and adds the screen to `load-budget.json`. Over budget is not a test failure: it is a
  tune loop. Take the next lever of `loading-instruction.md` section 3, re-measure, repeat. After three rounds
  without reaching the budget, record the measured breakdown and the remaining gap as a `todo` issue and continue.
- The full suite runs once, at the end, before the push.
- Authz: a negative test for every caller-supplied id and every admin route. A bug fix's repro must be seen to fail
  before the fix.
- Docs stay in step in the same commit: the feature doc status, the plan, the decisions document.

## 11. App-walk

After the phases and before the push, start the `app-walk` skill with the Skill tool, under its own standard (the skill is model-invocable for this; regsupply D30). The walk's product questions become
decisions-document stand-ins, not blocking questions. Gaps the walk can fix without a product decision are fixed in
one more phase and walked again. The walk's part G (speed) runs `npm run check:load`; an over-budget screen is a gap
of class fix and goes through the same tune loop as in section 10.

## 12. Push

- **One push per repo, at the end.** Never per phase. The trunk never deploys; one push keeps the pre-push gate to one run per repo.
- **Rebase first.** Fetch, then rebase local commits onto `origin/alpha`. A conflict stops the push for that repo only,
  and the report says so.
- **No permit needed.** A push to the trunk (`alpha`) never deploys, so push-guard lets it through (global CLAUDE.md,
  "Push and deploy"). Never push `beta` or `main`: they move only by the owner's `/ship test` and `/ship release`.
  On a repo not cut over yet (`tools/trunk.mjs` prints `beta`) the old rule holds: one `/push-permit` entry per repo,
  `max 1`, `for 12 h`, covering this run only.
- **Guards.** Every `feat:` or `fix:` commit cites `#N`; the pre-push gate checks it.
- No PR. No comment on any issue. No label that does not already exist in the repo.

## 13. Stop rules

The run ends when the done-condition holds, or at the first of:

- the red ladder ends (section 8);
- the spend cap is reached (section 9);
- a rebase conflict on the final push, for that repo only (the other repos still push);
- the owner stops the session.

No wall-clock limit is set.

## 14. Issues and features: the house lifecycle

From `issues-as-features` and `/next`, applied as written:

- **Local commit:** add the label `built` to the issue if the repo already has that label. Never create a label.
  Report it as "built (local, unpushed)".
- **Feature doc:** 🔨 while in progress; ✅ once committed, with `file:line` evidence, in the same commit as the code;
  📋 planned.
- **Push to the trunk (`alpha`):** the pre-push hook's local `tools/issue-status.mjs` run (installed by `blueprint/tools/add-issue-discipline.mjs`;
  no CI job since 2026-11-17) swaps `built` for `on-alpha` and closes the `feature` issues (`/ship test` later labels `on-beta`). The run does not close issues. `fix` issues stay open until
  the owner closes them.
- **Promote to `main`** (owner): `released`.
- **Repos without `issue-discipline`:** nothing here is automatic. The morning sync moves the labels and says so.

## 15. Morning: `/goal-implement-all morning`

The owner types nothing to start it (owner, 2026-11-03). A local run ends with its report as the final message of
its own turn and, just before that, queues `/goal-implement-all interview` with a one-shot `CronCreate` a couple of
minutes out; the job fires once the session is idle, so the questionnaire is waiting when the owner comes back.
Summary and interview never share a turn: in focus mode only a turn's final message is shown (and read aloud by
text-to-speech), and an `AskUserQuestion` call ends the summary's place as that message. Typed by hand, `morning`
gives the summary turn and queues the interview the same way. Cloud runs cannot wait in a session; the owner types
`morning` in a local one.

1. **Summary.** Phases and tags, commits per repo, anything that went down the red ladder, spend against the cap,
   and the number of stand-ins.
2. **A live look.** `npm run dev` on the owner's machine (the trunk never deploys; beta only after `/ship test`).
3. **Interview.** Every decision in the decisions document, grouped, at most four per `AskUserQuestion` call. Each
   question carries its background (what was built, the stand-in, what changes if the owner picks differently) and a
   recommended option. The options are: keep the stand-in, change it, revert it, decide later.
   **Then the blocked work (owner, 2026-11-08, blueprint#163):** list the issues not taken and the open decisions not
   built, grouped by what blocks them (owner-only, a blueprint or suite component, a gold set, live checks, "later"),
   and ask for the decisions that would unblock them for the next run. One `AskUserQuestion` per group, recommended
   option first. An answer that unblocks an item is recorded so the next run's sources pick it up.
4. **Status sync.** Feature statuses per the evidence (section 14). The issues the workflow will close on the next
   push, and the `fix` issues the owner should close.
5. **Fleet.** Ask whether to stamp the blueprint changes into the fleet copies now. Stamp only what the owner
   confirms. Then list stranded cloud branches: `node tools/fleet-merge-cloud.mjs` (read-only; `--open-prs` opens a PR
   to the trunk for each CLEAN one; `--merge --yes` and `--delete-merged --yes` only when the owner says so).
6. **Owner-action issues.** For items the owner confirms need their own action, file them with
   `node tools/feature-issues.mjs --decisions`.
7. **Record.** The owner's answers go into the decisions document under a "Morning" heading.

## 16. Interview record (2026-11-01)

| Topic | Owner's answer |
|---|---|
| What "goal session" means | One long prompt that triggers `/goal`-style continuous work with a done-condition. The owner does not retype it. |
| Done-condition | Implement until everything is implemented that is not blocked by a decision the agent cannot make itself. |
| Command home | Blueprint, stamped to the fleet. |
| Work sources | Feature doc rows (🔨/📋); open feature and fix issues; open items in decision docs. |
| "Badges" | A git tag per green phase. |
| Other repos | Any RegOps module repo. Commit, do not push. Worktree only when needed. |
| Backports | Commit to blueprint during the run. Stamp the fleet in the morning. |
| Models | Opus orchestrator at medium effort (high if needed). Haiku 5.5 workers at extra-high. Sonnet only for hard chunks. |
| jev | Decides model and effort. Via the Vercel AI Gateway. On failure, Haiku 5.5 at extra-high. Code may be sent; customer data stays out of the run (owner, 2026-11-01). |
| UI/UX and landing content | Planned or defined by Opus 5.5 before any worker builds them (owner, 2026-11-01). |
| Orchestrators | One per repo. Message it if running, else start one. The brief is a GitHub issue in that repo. |
| Red phase | Retry twice with the failure output. One attempt by a more capable model. Then stop. |
| Schema, stored data, auth | Stand-in, log it, go on. |
| Legal, regulatory and public copy | Stand-in, log it, ask the next day. Commits and pushes stay on the trunk (`alpha`), which never deploys, so nothing goes public overnight. |
| New services | Stand-in, log it, ask the next day. |
| Spend | Hard cap of $1 per night on external spend. Sub-$1 calls such as `jev` are fine while the nightly total stays at or under $1. |
| Promote and release | Always the owner's. |
| Push | One push to the trunk (`alpha`) at the end. Autonomy first. |
| Morning link | A local server (`npm run dev`); beta only after the owner's `/ship test`. |
| Issue and feature status | Apply the house convention (section 14). |
| Push permit | The typed command writes it. |
| issue-discipline | Install now in regsupply. |
| Escalation model | Opus 5.5. |
| Launch mode | A parameter. `local` is the default. `cloud` is opt-in, as a /schedule routine (added 2026-11-01). |

## 17. Assumptions (not asked; change them in review)

- The plan, the decisions document and the tags are created in the home repo and kept local, except the final push.
- The decisions document is named `docs/decisions/goal-<YYYY-MM-DD>.md`.
- `todo` issues are excluded from the sources, since the owner's source list did not include them.
- App-walk runs after the phases. Its non-product gaps get one more phase.
- No wall-clock limit. The run stops on the done-condition or a stop rule (section 13).
- The house rule that pushes a docs-only commit at once does not apply during a run. The run's own commits are
  unpushed, so docs commits ride along to the one final push.
- Each touched repo gets a `CLAUDE-HANDOFF.md` update at the end, per the shared-tree rule.
- The permit lasts 12 hours and allows one push per repo.

## 18. Distribution

- **Canonical:** `blueprint/docs/standards/goal-implement-all-instruction.md` and
  `blueprint/.claude/skills/goal-implement-all/SKILL.md`.
- **Copies:** each repo gets both files, byte-identical, the way `/app-walk` is stamped. A fleet stamper modelled on
  `tools/app-walk-fleet.mjs` is not built yet. Build it before the first fleet rollout.
- **Revised 2026-11-01** after the owner synced CLAUDE.md and skills from another machine: the launch parameter, the jev
  payload limit, the handoff step and the delegation override. The synced skills are on disk. The session that made
  this revision still had the older skill list loaded, so the command has not been run against them.
