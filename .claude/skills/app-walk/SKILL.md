---
name: app-walk
description: >-
  Walks this app end to end in a real browser (Playwright, phone/tablet/desktop,
  both themes) with synthetic data and files, checks every workflow in the
  feature doc against the screens that actually exist, reviews every screen
  against a fixed UX/UI checklist (mandatory vs optional, progressive
  disclosure, input load, primary action above the fold, empty space, no
  horizontal scroll, phone layout, bottom nav, states, feedback), writes a gap
  register to docs/walks/, asks the owner once about product decisions, then
  fixes the rest and re-walks to prove each fix. Start it ONLY when the owner typed
  /app-walk or when section D of a running /goal-implement-all says to; never on your
  own initiative, however useful it looks: a walk is long and costly. The full standard
  is docs/standards/app-walk-instruction.md, loaded first.
  Optional argument: an area/workflow name, or "report" to fix nothing.
---

# /app-walk - walk the app as its users, record the gaps, fix them, prove it

**Before anything else, read `docs/standards/app-walk-instruction.md`** (in this repo, or in the
blueprint). It holds the prompt, the checklist, the severity table and the rules. This
file only adds the procedure.

This file, the standard and `tools/app-walk.mjs` are copies of the blueprint's. To change
the skill, edit the blueprint and run `npm run app-walk:apply` there (standard, "Changing the
skill"); an edit made to a copy is overwritten.

## Argument

`$ARGUMENTS`: empty = every workflow; a word = only workflows/screens matching it (still
build the full matrix, walk the slice); `report` = steps 1-5 and 8 only, no fixes, no
questions (use this for scheduled runs).

## Procedure

1. **Orient.** `git status` (shared tree), `git fetch origin beta`; work on the session
   branch cut from `origin/beta`, never `main`. Read `CLAUDE.md` and the last
   `docs/walks/*.md` if one exists - its open gaps are the starting list.
2. **Matrix** (standard step 1). Write it into the new `docs/walks/<date>.md` before
   opening a browser. Use an Explore subagent for the router/API sweep when the app is
   large; keep the conclusions, not the file dumps.
3. **Browser.** Playwright must resolve: the template carries `@playwright/test`; if this
   repo does not, `npm i -D @playwright/test` (a dev dependency, mention it in the report).
   Never `playwright install` in a cloud session: Chromium is at `/opt/pw-browsers`
   (`PLAYWRIGHT_CHROMIUM=/opt/pw-browsers/chromium` if the pinned version differs). If
   `tools/app-walk.mjs` is missing, copy it from blueprint `template/tools/`. Start
   `npm run dev` in the background with no Clerk key; wait on the port, not on `sleep`.
4. **Seed** (step 2) through the API as simulated users; fixtures in the scratchpad.
5. **Walk** (step 3): drive each workflow with a Playwright script in the scratchpad,
   then run the probe with a `walk.routes.json` listing every screen and its role.
   Check `document.visibilityState` before trusting any animation or scroll check.
   READ every screenshot. Delegating the per-workflow walks to subagents is fine
   when there are many; each returns gaps in the register's row format.
6. **Review** (step 4) and **register** (step 5): every checklist item, every screen.
7. **Ask once** (step 6): one `AskUserQuestion` call, only **decide** gaps. Skip when
   `report` or unattended. No one to ask (no `AskUserQuestion`, or a non-interactive routine): follow `owner-questions` > "No one to ask": safe default, `owner-action` issue with a `decision` block, continue.
8. **Fix and prove** (step 7), P0 first, one local commit per gap or cluster, message
   citing the gap id. Iterate with `npm run test:affected`; re-run the probe on touched
   screens; before/after screenshots into the register. Full `npm run lint && npm run
   build && npm test` once at the end.
9. **Report** (step 8): register status + diff against the last walk, regressions first;
   commit the register (`[skip vercel]` if docs-only). **Push only when the owner says so.**
   Offer the screenshot folder via `SendUserFile` for the P0/P1 before/after pairs.

## Hard limits

- Dev server and synthetic data only; never a preview/production URL, never a real account.
- No product-scope changes without the owner: a missing screen is **decide**, not **fix**.
- No pricing, entitlement, catalogue or schema changes in this run (schema = **issue**).
- No edits to `src/shared/**` in a generated repo (fix in blueprint, re-sync).
- No skipped or weakened tests to get green; no `--no-verify`.
- Issues filed (class **issue**) are searched for duplicates first and carry the Claude Code footer.
