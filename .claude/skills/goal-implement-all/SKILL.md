---
name: goal-implement-all
description: >-
  Owner-typed. "/goal-implement-all" (or "/goal-implement-all cloud") starts one overnight autonomous run that implements every open feature, fix and
  decision-backed change (feature doc rows, feature and fix issues, decision-doc items), phase by phase, tags each
  green phase, runs /app-walk, pushes once to the trunk (alpha) at the end, and writes a decisions doc. "/goal-implement-all plan"
  writes the plan and changes nothing. A local run opens its own morning interview when it ends, so the owner types
  nothing; "/goal-implement-all morning" re-runs the review by hand (summary turn, then the interview in its own
  turn), "/goal-implement-all interview" is the interview alone. The standard
  docs/standards/goal-implement-all-instruction.md is read first.
disable-model-invocation: true
model: opus
effort: medium
---

# /goal-implement-all - build everything that can be built, then review it in the morning

**Before anything else, read `docs/standards/goal-implement-all-instruction.md`** (in this repo, or in the blueprint).
It holds the rules, the reasons and the owner's interview record. This file is the procedure.

## Modes

`$ARGUMENTS` picks the mode. The launch parameter defaults to local.

- empty or `local`: start the run in this session (sections A to F). The session must stay open. If the app or the
  terminal closes, the run stops with no push, and the morning shows where it got to.
- `cloud`: start the run as a cloud routine with the `schedule` skill, not in this session. A routine has only its
  prompt, so the prompt is this file's sections A to F plus the done-condition from the standard, written out in full.
  Before creating it, check that every touched repo is reachable from the cloud with push access, and that the permit
  and the spend cap can be recorded there. If a check fails, stop and say which. Cloud is opt-in: routines often lack
  permissions that a local session has.
  Cloud first step: `node tools/cloud-selftest.mjs`; if git push or GitHub REST fails, stop and file an `owner-action`
  issue (see `owner-questions` > "No one to ask"). No one to ask (no `AskUserQuestion`, or a non-interactive routine): follow `owner-questions` > "No one to ask": safe default, `owner-action` issue with a `decision` block, continue.
- `plan`: write the plan (section A) and the decision list. Change nothing else.
- `morning`: review the last run (section G), by hand. A local run already starts it (section F).
- `interview`: section G steps 3 to 7 only, with no summary turn first. Section F and G enqueue it themselves.

## Hard limits, whatever the sources say

- One push per repo, at the end of the run, to the trunk (`alpha`). Never `beta` or `main`: both move only by `/ship`. Never bypass a hook (`--no-verify`,
  `ALLOW_PUSH`, `COMMIT_MSG_SKIP`, `PRE_PUSH_SKIP_TESTS`).
- Never promote or release. Never close an issue. Never create a label. Never open a PR. Never comment on an issue
  except the orchestrator's brief in a repo that needs a change.
- External spend stays at or under $1 per night in total (`jev` calls, paid API calls, new paid services).
- Customer data stays out of the run's payload to `jev`. Code may: the owner judged this run's code not sensitive, since anyone with a
  subscription can build similar code. `jev` gets the issue, the acceptance-test names and the chunk's files. The key is
  `JEV_AI_GATEWAY_API_KEY`, from `.scaffold-secrets` or the Mac's `~/.claude/settings.local.json` env. Name the variable;
  never print its value.
- The house rule that pushes a docs-only commit at once does not apply during a run. The run's own commits are
  unpushed, so docs commits ride along to the one final push.
- Commit only paths this run changed (`git commit -F <msg> -- <paths>`, never `add -A` or `.`). The tree may be shared:
  read `CLAUDE-HANDOFF.md` before touching an unexplained change.
- Decisions are stand-ins, logged in the decisions doc. Nothing waits for the owner except the limits above.

## A. Preflight and plan

1. **Preflight.** Stop and say why if any fails: current branch is the trunk (`alpha`; `node tools/trunk.mjs` says `beta` on a repo not cut over yet), never `beta` or `main`; the working tree
   is clean or holds only changes this run does not own; `npm run lint`, `npm run build` and `npm run test:affected`
   (or the repo's named equivalents, from CLAUDE.md) exist; `gh auth status` is fine.
2. **Sources** (standard section 3): the feature doc rows marked 🔨 or 📋; `gh issue list --state open --label feature`
   and `--label fix`; open items in `docs/decisions/*.md`. Skip `owner-action` issues, and `todo` issues that no
   feature-doc row or decision backs; list them in the report. **Dependencies first:** search blueprint and
   regops-suite for open issues with `needed-by: <this repo>` in the body (`gh search issues --owner <owner>
   "needed-by: <repo>" --state open`); they are the first phases, built in their own repo, blueprint before
   regops-suite before this repo.
3. **Plan.** Write `docs/plans/goal-<YYYY-MM-DD>.md`: at most six phases. Each phase lists its issues, its files, its
   repos, the model and effort for each chunk (section B), and its acceptance test. Commit the plan on its own with
   `[skip vercel]`. Nothing is pushed.
4. **Decisions doc.** Create `docs/decisions/goal-<YYYY-MM-DD>.md`. It grows as the run goes.
5. **Permit.** The owner typed this command, which is the grant. For each repo the plan will push to, run the
   `/push-permit` procedure with the run's issue numbers, `max 1`, `for 12 h`. Show the entries in the start message.
   If `plan` mode was typed, skip this step.

Stop after step 5 in `plan` mode and report the plan.

## B. Each chunk

0. **Design first, for UI/UX and landing content.** A chunk that changes a screen, a layout, an interaction or landing
   copy is defined by Opus 5.5 before any worker touches it: the screens, states, copy and acceptance tests, written
   into the plan. Workers implement that spec and do not design it. Opus reviews the built result against the spec.
1. **Model and effort.** Ask `jev` which model and effort the chunk gets: `node tools/jev-chunk.mjs --issue "<text>"
   --test "<name>" --file <path> [--hard]` (#242). It calls the gateway's decision API, not chat, and books each call
   against the cap. If it fails, times out or answers unclearly, use Haiku 5.5 at extra-high effort. Sonnet 5.5 only for a hard
   chunk. The orchestrator is Opus 5.5 at medium effort (high when needed). `jev` gets only the payload in the hard
   limits. This command's model choice overrides the house delegation default (`~/.claude/docs/delegation.md`) for this
   command only.
2. **Brief.** The worker gets the issue, the acceptance test, the files and the house skills it must load (for example
   `issues-as-features`, `authorization-discipline`). The brief is narrow and self-contained.
3. **Isolation.** Work in the main tree. Use a git worktree only for a cross-repo change or when a merge conflict forces
   it.
4. **Cross-repo change.** If the chunk needs a change in another RegOps module repo, wake that repo's orchestrator
   (agent communication) or start one, after filing a GitHub issue in that repo with the exact change and a `needed-by: <this repo>#N` line in its body. Its work is
   committed on that repo's trunk (`alpha`) and never pushed here.
5. **Check.** Read the diff yourself. Run the repo's lint, build and `test:affected`. A bug fix's repro must fail first.
   A phase that touches a screen, a list or a data read also runs `npm run check:load` (and `check:bundle`) where the
   repo has them. Over budget: take the next lever of `loading-instruction.md` section 3, re-measure, repeat; after
   three rounds record the breakdown and the remaining gap as a `todo` issue and continue.
   Authz: a negative test per caller-supplied id.
6. **Red?** Follow the red ladder (standard section 8): two retries with the failure output and the instruction to fix
   code or tests; one attempt by Opus 5.5 at high effort; then stop. A red phase drops its uncommitted work.
7. **Commit.** One commit per issue. `feat:` or `fix:` with `#N` in the subject. Update the feature doc row (🔨 or ✅
   with `file:line` evidence) and the decisions doc in the same commit. Then add the `built` label to the issue if the
   label exists. Report it as "built (local, unpushed)".

## C. Decisions

For every open question, write a decisions-doc entry: the question, the background, the options, the stand-in chosen
and why, how reversible it is, the files and commits, and what the owner should decide. Stand-ins are chosen by the
most-confident, most-reversible rule. They obey the project's rules, including `SCHEMA_VERSION` and the authz tests.

Track the spend. Each `jev` call and each paid call is recorded in the decisions doc with its cost. At $1 for the
night, stop buying anything and finish with what you have.

## D. End of the phases

1. Mark each green phase with a tag `goal/<YYYY-MM-DD>/phase-<N>` on its last commit in each touched repo. Tags stay
   local.
2. Start the `app-walk` skill with the Skill tool, under its standard. Its product questions become decisions-doc stand-ins. Gaps it can fix without a
   product decision become one more phase, walked again. Its part G runs `npm run check:load`; an over-budget screen is
   a fix gap and goes through the same tune loop as step B5.
3. Run the full suite once in each touched repo: `npm test` or the repo's equivalent.
4. In each touched repo, update `CLAUDE-HANDOFF.md` with what this run left: branch, commits, tags, open stand-ins,
   anything not pushed. The shared-tree rule requires it.

## E. Push

For each repo with commits on its trunk (`alpha`; `node tools/trunk.mjs`):

1. `git fetch origin` and rebase local commits onto `origin/alpha`. A conflict stops that repo's push. Report it and push
   the other repos.
2. Check that every `feat:` and `fix:` commit cites `#N`.
3. `git push origin alpha`, once. The trunk never deploys, so no permit and no build slot; the pre-push gate runs the scoped tests.
4. Never `beta` or `main` (only `/ship` moves them). Never `--force`.

## F. Report

Write the report at the end of the decisions doc, then tell the owner, in the terminal and in the final message:
phases and tags, commits per repo, anything that went down the red ladder, the spend against the cap, the number of
stand-ins, the issues that are `built` and the ones waiting for their push, and the local
`npm run dev` (the trunk never deploys; a beta build exists only after the owner's `/ship test`).

**Hand over to the morning without the owner typing.** The report is the final message of its own turn, so it stays
on screen and a text-to-speech reader gets all of it. Just before writing it, in a local run, call `CronCreate` with
`recurring: false`, the cron pinned to about two minutes from now, and the prompt `/goal-implement-all interview`.
The job fires when the session is idle, so the interview opens right after the report, as a separate turn, and its
questionnaire waits until the owner is back. Never put the interview in the report's turn: in focus mode the owner
sees only a turn's final message, and an `AskUserQuestion` call would push the report out of it. End the report with
one line: "The interview is open below; `/goal-implement-all morning` repeats this review." Cloud runs have no
session to wait in: end with "Type `/goal-implement-all morning` in a local session."

## G. Morning: `/goal-implement-all morning`

Typed by hand (the interview is already queued after a local run). Two turns, for the reason in section F.

1. **Summary** from the decisions doc and each touched repo's `CLAUDE-HANDOFF.md`: phases, tags, commits, failures,
   spend, stand-ins. If the run stopped early, say so first.
2. **A live look:** `npm run dev` (the trunk never deploys; beta only after the owner's `/ship test`). Then call `CronCreate` (`recurring: false`, about
   one minute from now, prompt `/goal-implement-all interview`) and end the turn with steps 1 and 2 as the final
   message. Steps 3 to 7 run in that next turn.
3. **Interview.** Each question carries enough background to be answered without scrolling up. One `AskUserQuestion` batch per group, at most four per call. Each question carries its background:
   what was built, the stand-in, what changes if the owner picks differently. Recommended option first. Options:
   keep the stand-in, change it, revert it, decide later. Do not ask about anything that has no decision behind it.
   Then the **blocked work**: the issues not taken and open decisions not built, grouped by blocker (owner-only,
   blueprint/suite component, gold set, live checks, "later"), one batch per group, asking what would unblock each
   for the next run.
4. **Status sync.** Feature doc statuses per the evidence. Labels per the house lifecycle (standard section 14). List
   the issues the workflow will close on the next push, and the `fix` issues the owner should close. Do not close them.
5. **Fleet.** Ask whether to stamp blueprint changes into the fleet copies now. Stamp only what the owner confirms.
   Then list stranded cloud branches: `node tools/fleet-merge-cloud.mjs` (read-only; `--open-prs` opens a PR to the trunk for
   each CLEAN one; `--merge --yes` and `--delete-merged --yes` only when the owner says so).
6. **Owner-action.** For items the owner confirms need their own action, file them with
   `node tools/feature-issues.mjs --decisions`.
7. **Record.** Put the answers under a "Morning" heading in the decisions doc and commit it, with `[skip vercel]`.
   Nothing is pushed without a permit.
