---
name: multi-session
description: >-
  How to work safely when more than one Claude Code session is live in the SAME
  working tree — claiming a workstream, staging explicitly, editing shared
  hotspot files, and proving HEAD still compiles. Use when the SESSION GUARD
  hook reports another live session, when `git status` shows changes you did not
  make, when a commit may have swept up someone else's files, or when deciding
  whether work needs an isolated git worktree.
---

# Working alongside another session

There is no branch isolation between concurrent sessions in one working tree:
same files, last write wins, and any `git commit` sweeps up whatever the other
session left uncommitted — staged or not.

The `SESSION GUARD` SessionStart hook detects this and names the other session's
claim. It is silent when you are alone, so if you are reading this skill without
that message, check `git status` before assuming you have the tree to yourself.

**Two known gaps.** The hook only fires at session start, so a session that began
alone was never told about you. And it is machine-local: **cloud and mobile sessions
never run it at all.** Never assume the other side is coordinating, and run
`git status` yourself.

**Talk to the other session.** Message it instead of waiting for the owner to relay: see the
`peer-sessions` skill (`[HELLO]` on joining, `[FYI]` after a shared change, `[REQ]` with a reply-back).

## 1. Claim before starting multi-file work

**Working an issue?** Claim the issue, not just the tree: `node tools/issue-claim.mjs claim <N>`
(in blueprint; it posts a marker comment and a `claimed` label that cloud sessions see too).
`/next` does this for its picks; `status` shows who holds what; `release` ends it with the
outcome git shows. Details in the `issue-claim` entry of blueprint's `docs/tools-catalogue.md`.

Write ONE line to the claim path the hook gave you:

```bash
echo "reworking the venue outreach letter - schema.ts, settings.ts, i18n admin" > .claude/sessions/<pid>.claim
```

The claim is a **lock, not a log**. It says what is in flight right now, in the
present tense. It is reaped automatically when the process dies — never delete it
by hand, never append to it, and never record finished work in it. Completed work
belongs in the project's decisions ledger and feature docs (that is step 4 of
"Implement"), and in git.

The directory is gitignored on purpose: a claim that gets committed becomes a
merge conflict in the very file meant to prevent conflicts.

## 2. Stage explicitly, commit small

Never `git add -A` or `git add .` — name the files. A blanket add is how one
session's half-finished work lands in another's commit. Commit often so the tree
returns to clean for the other side.

If a commit did sweep up files that are not yours, say so in the commit body
rather than quietly rewriting history the other session may already have built on.

## 3. Check before touching a shared hotspot

Each project lists its own hotspots in its `CLAUDE.md` — typically the schema and
DDL pair, the app shell, the global stylesheet, and any file the translation
contract spans. Before editing one, run `git status`. If it is already modified
and not by you, wait for the other session's commit or coordinate through the
claim files.

## 4. After committing a hotspot change, verify HEAD alone

```bash
npm run verify:head
```

It stashes your uncommitted work, type-checks HEAD in isolation, and restores
your work either way. This exists because of a real incident (hejsmart,
2026-07-30): two sessions each added keys to a shared i18n contract file, a
plain `git add <file>` carried the first session's declarations into the second's
commit without the matching values, and **HEAD stopped compiling while nobody
noticed** — because a normal `tsc --noEmit` checks the dirty working tree, which
still had the values, not HEAD on its own.

Where the script does not exist, the equivalent is: stash, type-check, restore.

## 5. Isolate only when the tree genuinely cannot be shared

Prefer staying in one tree. Rules 1-4 cover nearly everything, and the structural
fixes matter more than the process — hejsmart's per-feature i18n split means
adding a key now touches only that feature's files, so the collision that caused
the incident cannot recur the same way.

Reach for a worktree only for genuine multi-file, multi-commit work that overlaps
an active claim:

```bash
git worktree add ../<repo>-<topic> beta   # same branch, different directory
cd ../<repo>-<topic> && npm install
npm run dev -- --new                      # next free port in the project's block
```

Commit there on the same branch, so there is nothing extra to merge. Remove it
when done: `git worktree remove ../<repo>-<topic>`.

**Spinning off an implementation subagent (the `Agent` tool) is the one case
where a worktree should be the DEFAULT, not the high-bar exception above.** A
subagent editing files while the parent session (or another live session) also
edits in the same tree is exactly the App.tsx incident waiting to happen again,
except the parent may not even be watching that file. Pass
`isolation: "worktree"` when spinning off a subagent to do multi-file
implementation work in a PROJECT repo; a subagent doing read-only research
(Explore, a fork answering a question) needs no isolation, since it writes
nothing. **The one exception is `blueprint` itself** - see below, and never
worktree it.

Still shared, and NOT isolated by a worktree: the beta database and any in-process
settings cache. A schema change or a settings write in one worktree reaches the
other's dev server — restart it to pick settings up; a schema bump is additive and
safe either way.

A one-file doc fix does not need a worktree even with another session active. This
is a judgment call, and the bar is high: managing worktrees has its own cost.

## 6. Two hooks now do part of this for you

Both are global (`~/.claude/settings.json`), so they apply on every project,
every session, without per-repo setup - added 2026-09-08 after one evening
cost roughly two hours to OOM-killed test runs and an hour to a broken `beta`
from the App.tsx incident above.

**`heavy-run-guard.ps1`** serialises whole-suite test runs and builds
(`npm test`, a bare `npm run build`, a bare `vitest run` with no file
argument) across every session on the machine, via a TTL'd lease at
`~/.claude/locks/heavy-run.lock`. A second session's heavy command is denied
with who is holding it and for how long, rather than being allowed to start
and OOM-kill both runs ten minutes in. A SCOPED run
(`vitest run <file>`, `test:affected`) is exempt - it is the fast inner loop
this was already supposed to be the default (CLAUDE.md's "Implement" step 3),
and serialising it would defeat the point. Escape hatch for a confirmed-safe
overlap: `HEAVY_RUN_SKIP_LOCK=1 <command>`. It does NOT see the full suite a
project's own `.githooks/pre-push` runs internally as part of `git push` -
that is a nested process, invisible to this hook - so a push can still
collide with a direct heavy command from another session; closing that gap
needs the lease taken inside each project's pre-push script.

**`generated-file-guard.ps1`** denies editing or overwriting any file whose
header says `// GENERATED from ... — do not edit here.` (every file under
`src/shared/**` that came from the blueprint sync). Escape hatch for the
documented "urgent fix, then backport" exception:
`touch .claude/allow-generated-edit` in the repo root, honoured for 15
minutes from its own timestamp and then stops working on its own - never a
standing bypass. **Backport before the next sync runs**, or the fix is
silently discarded the moment it does.

## Cross-repo: blueprint is the one shared resource, not a tree to duplicate

Every project resolves blueprint by SIBLING NAME (`../blueprint`) and its own
`npm run sync` reads blueprint's **working tree**, not blueprint's HEAD - so an
in-flight edit under `blueprint/packages/` reaches every project that syncs
next, with nothing saying so. That makes blueprint different from a project
repo: it must stay ONE canonical checkout, never a per-agent worktree (a
worktree of blueprint at `../blueprint-<topic>` is invisible to `../blueprint`
- every project would keep reading the original).

Two structural guards now cover the failure modes this caused:

- `sync-packages.mjs` refuses to sync (not `--check`) when `packages/*/src`
  has uncommitted changes, unless `--allow-dirty`. Commit the change you
  intend to ship, then sync.
- `generated-file-guard.ps1` above stops a project's own `src/shared/**` copy
  from being hand-edited and silently discarded at the next sync.

**Record provenance in the commit trailer, in both directions**, so "did this
already go back?" is a `git log --grep`, not a memory note:

```
Backport-Of: regvoice#123        # on the commit landing in blueprint's packages/
Backported-To: blueprint@<sha>   # on the commit in the project that pulled a fix in
```

## Leaving a change behind for the other session

Sometimes the change has to go into a repo you are not the owner of right now.
Committing it in isolation is almost always possible — stage BY NAME, never
`git add -A` — and when it is not, leave it in the working tree. Either way write
a `CLAUDE-HANDOFF.md`:

```sh
node blueprint/tools/handoff-note.mjs --dir <repo>   --title "..." --why "..." --files "a,b"   [--committed <sha>] [--pushed] [--revert "git revert <sha>"]
node blueprint/tools/handoff-note.mjs --list     # every pending note
```

Untracked on purpose so it appears in every `git status`; never `git add` it.
The full rule, including why an unexplained diff strands, is "Leaving a change in
a repo another session is working in" in the global `CLAUDE.md`. **Do not push
the other session's unpushed commits** to get your own change out — commit yours,
note it, and let them ship it.

### The staging trap: `git add` does not scope a commit

```sh
git add a b && git commit -m "..."     # WRONG - commits the WHOLE index
git commit -m "..." -- a b             # right - commits ONLY a and b
```

`git commit` with no pathspec commits everything staged, including files another
session staged before you arrived. Staging by name protects nothing on its own.
Recover with `git reset --soft HEAD~1`, then re-commit with the pathspec form -
their staging survives intact. (Cost this once in blueprint, 2026-09-03.)

**Pathspec protects other FILES. It does not protect other EDITS IN THE SAME
FILE.** `git commit -- App.tsx` commits every hunk currently in `App.tsx`,
whoever wrote each one - it cannot tell your edit from a hunk another session
added to that file five minutes ago. (regvoice, 2026-09-08: a `/landing`
route change was pathspec-committed against `App.tsx`; another session had
half-finished a version-tag feature in the SAME file at the same time, and
its hunks - a function call with nothing yet defining that function - rode
along. HEAD called `formatVersionWithPreview`, which HEAD did not export, for
about an hour, unnoticed because the local build used the working tree, which
still had the missing half.) Before committing a file another session might
also be touching, `git diff --staged -- <file>` and read every hunk, or run
`npm run verify:head` (rule 4) afterward - it would have caught this one
immediately, since HEAD alone would not compile.
