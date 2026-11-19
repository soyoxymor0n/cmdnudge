# App walk - end-to-end UX/UI review and fix (workspace standard)

> Walks a house-stack app the way its users will, at phone, tablet and desktop width,
> with synthetic data and files, through every workflow its feature doc promises. It
> records each gap with its evidence, fixes what it may fix, re-walks to prove each fix,
> and hands the owner only the decisions that are theirs. Run it after an
> implementation round, and on a regular cadence. The goal: the owner never again finds
> out by hand that half the screens a workflow needs were never built, or that the
> phone layout is the desktop squeezed.

## Where it lives, and how it is triggered

| Piece | Location | Role |
|---|---|---|
| This standard | `blueprint/docs/standards/app-walk-instruction.md` | the single source of truth; edit here |
| The skill | `blueprint/.claude/skills/app-walk/SKILL.md` | thin wrapper; started only by the owner (`/app-walk`) or by section D of `/goal-implement-all`. Claude Code has no per-caller gate for `disable-model-invocation`, so the rule is in the description |
| The probe | `template/tools/app-walk.mjs` (`npm run app:walk`) | measures what screenshots cannot show; sibling of `landing-walk.mjs`. A route may declare the statuses it intends with `expectStatus: [404]` (an API call or the page itself); an undeclared failure still is one (rules: `app-walk-rules.mjs`, #108) |
| Stamped copies | each repo's `.claude/skills/app-walk/` + `docs/standards/app-walk-instruction.md` | via `tools/add-claude-skills.mjs` |
| Walk reports | `docs/walks/<YYYY-MM-DD>.md` in the app's repo | one per run; the next run diffs against the last |
| Fleet list + drift check | `tools/app-walk.fleet.json`, `tools/app-walk-fleet.mjs` (`npm run app-walk:check` / `app-walk:apply`) | every repo holding a copy; byte-compares all three files against the blueprint |

**Manual trigger:** `/app-walk` (whole app), `/app-walk <area or workflow>` (one slice),
`/app-walk report` (walk and report, fix nothing).
**Scheduled trigger (on request only):** a Routine that fires `/app-walk report` in a fresh
session; the fixes run in the next interactive session. A Routine is created only when the
owner asks.

**Changing the skill (blueprint only).** The skill, this standard and the probe are copies in
every repo listed in `tools/app-walk.fleet.json`. Edit them HERE, never in a copy, then:

1. `node tools/add-claude-skills.mjs --dir template --only app-walk --apply --force` (the
   template's copy; `tools/tests/app-walk-fleet.test.mjs` fails until it matches).
2. `npm run app-walk:apply` with the repos checked out as siblings (`--root <dir>` otherwise):
   it rewrites every copy that differs and commits nothing.
3. Commit and push each touched repo (`[skip vercel]`); `npm run app-walk:check` is then clean.

A fix found while walking some app goes back here first; a copy edited in place is overwritten
on the next apply. A new repo that receives the skill gets its line in the fleet list in the
same change.

**Not this skill:** the public landing page (`landing-walk.mjs`, `landing-first-round-instruction.md` §5),
a market/feature review (`/module-next-level`), building from issues (`/next`).

## The prompt (the owner's request, refined)

The owner's original request was: walk every implemented feature in a browser, test end to
end with synthetic data and files in and out, document each gap with its context, close
the gaps, and do a thorough UX/UI review (elements where they are needed, mandatory vs
optional, progressive disclosure, no overload, no horizontal scroll, mobile layout and
bottom nav). The refinements below each close a hole in that wording:

- **Walking what exists cannot find what is missing.** The coverage matrix (step 1) is
  built from the feature doc and the workflows BEFORE the browser opens; a workflow step
  with no screen is a gap the walk would otherwise never meet.
- **"Synthetic data" needs states, not one happy row.** Empty, one, many, long, broken,
  forbidden (step 2).
- **"Thorough" needs a definition** or it means "whatever got looked at". Measured checks
  run as a script with fixed thresholds; judged checks run against a numbered checklist,
  and every screen gets every item (steps 3-4).
- **"Close the gaps" needs a boundary.** Layout, affordance and state fixes are made in the
  run; a missing screen or a changed workflow is a product decision and goes to the owner
  in one batch (step 6).
- **A fix is not done until the walk says so.** Re-walk, before/after screenshots (step 7).
- **"Regular intervals" needs memory.** Each report diffs against the last; a regression is
  called out as one (step 8).

Adapt the braces; everything else stays.

> Walk **{app name}** (`{repo}`) end to end, as its users, and fix what you find.
>
> 1. **Coverage matrix first, browser second.** Read `CLAUDE.md`, `docs/{slug}-features.md`,
>    the workflow/user-journey docs (`docs/setup/*`, `docs/features/*`), `project.json`, and the
>    router (`src/App.tsx` or `appSections.ts`) and API routes. Build one table:
>    *workflow -> step -> screen/route -> API calls -> status*, where status is **missing**
>    (no screen or no route), **stub** (route renders but does nothing real), **built**, or
>    **verified** (walked green in this run). Every feature the doc calls built gets a row.
>    Also list routes that serve no workflow (orphans), and roles/personas (user, org admin,
>    platform admin, guest link, signed out - walked with `--user anon`, the simulated `anonymous` identity, which the server answers with no user, org or admin; its 401 on an API call is expected).
> 2. **Seed synthetic data and files.** Run the dev server with zero credentials (simulated
>    identities, local file DB, AI heuristic fallbacks). Seed through the app's own API as
>    simulated users (`x-simulate-user`, `x-simulate-org`), never by writing the DB directly,
>    so the seed exercises the same validation the UI does. Create fixtures in the scratchpad:
>    at least one realistic file per accepted upload type, one oversize, one wrong type, one
>    empty, one with a long non-ASCII filename. For each list screen produce these states:
>    **empty**, **one**, **many** (50+ rows), **long** (80-char names, long words with no
>    break), **error** (an API that fails), **forbidden** (another user's id in the URL).
> 3. **Walk every workflow, as a user would.** Playwright against the dev server, at 390
>    (iPhone, touch), 768 (tablet, touch) and 1440, light and dark. Click through each
>    workflow from its entry point to its outcome; do not navigate by typing URLs except to
>    test deep links and forbidden ids. Upload the fixtures; download every export and open
>    it (parse the CSV/JSON, read the PDF text) to check it holds what the screen showed.
>    Reload mid-workflow: does the state survive? Use Back: does it go where a user expects?
>    Then run the probe over every screen: `node tools/app-walk.mjs --routes walk.routes.json
>    --out <scratchpad>/walk` and read every screenshot it saves, all of them.
> 4. **Review every screen against the checklist** below. Every item gets a verdict per
>    screen (pass, gap, n/a); a screen nobody scored is not reviewed.
> 5. **Write the gap register** in `docs/walks/{date}.md`: per gap an id, the screen and
>    width, the workflow step, what was expected (with the rule or doc it comes from), what
>    happened, the screenshot path, severity, and fix class (see the table below).
> 6. **Ask the owner once.** One `AskUserQuestion` batch (max 4 questions, recommended
>    option first) covering only the **decide** gaps: missing screens, workflow changes,
>    removals. Then continue without them; an unanswered question is listed in the final
>    message, and its gap stays open. Unattended runs skip this step and report. No one to ask (no `AskUserQuestion`, or a non-interactive routine): follow the `owner-questions` skill rule "No one to ask": safe default, `owner-action` issue with a `decision` block, continue.
> 7. **Fix and prove.** Fix every **fix** gap, P0 first. One local commit per gap or per
>    tight cluster, referencing the gap id. After each cluster, re-run the probe on the
>    touched screens and re-check the item by eye; add a before/after screenshot pair to
>    the register. A logic bug gets a test that fails before the fix. A layout bug that a
>    future change could bring back gets a Playwright assertion in `e2e/` where the repo
>    has one. Ship green on `npm run lint && npm run build && npm test` before the last
>    commit.
> 8. **Report.** Update the register's status column, and diff against the previous walk:
>    new gaps, closed gaps, and **regressions** (closed before, open again) called out
>    first. Keep `docs/{slug}-features.md` statuses in sync with the matrix. The final
>    message lists: counts by severity and class, what was fixed with commits, what is
>    open and why, the owner's decisions, and the lint/build/test output.
>
> Commit locally; push only when the owner says so. Never against production data.

### Severity and fix class

| Severity | Meaning |
|---|---|
| **P0** | A workflow cannot be completed (missing screen, dead button, crash, data loss, forbidden data shown) |
| **P1** | It completes, but a user would get stuck or get it wrong (hidden primary action, unclear mandatory field, no feedback, horizontal scroll, broken phone layout) |
| **P2** | It works and reads, but costs effort (extra steps, overload, wasted space, misaligned controls) |
| **P3** | Polish (spacing, wording, a missing tooltip) |

| Class | Who acts | Examples |
|---|---|---|
| **fix** | the run, without asking | layout, overflow, alignment, states, affordance placement, progressive disclosure of an existing form, a missing empty/error state, bottom nav wiring, copy |
| **decide** | the owner, in the step 6 batch | a screen the workflow needs and nobody built; merging, splitting or removing a workflow step; a field becoming mandatory or optional when the doc is silent |
| **issue** | filed, not fixed | larger than the run can verify (multi-screen rebuild, schema change, cross-module contract) - one GitHub issue each, duplicates checked, Claude Code footer |

A **decide** gap the owner answers in the batch becomes **fix** (small) or **issue** (large).

## The checklist

Each item names the standard that owns the detail; read it there, not here.

**A. Coverage - does the workflow exist?**
1. Every workflow step in the matrix has a screen, and the screen reaches its API.
2. Every screen is reachable from navigation, not only by URL; every screen has a way back.
3. No dead control: every button, link and menu item does something visible.
4. Every input file type the doc promises is accepted, and every promised output (export, report, PDF, email preview) is produced and holds the data the screen showed.
5. Every role sees what it should and is refused what it should not (404-for-both on a foreign id; the admin gate on the data - `admin-area`).

**B. Input load - is the user asked for too much?**
6. Mandatory vs optional is legible before submit: mandatory is the default and optional is labelled, or the reverse, but one convention per app and the submit error names the field.
7. A create form asks only for what is needed to create; the rest is edited after (progressive disclosure). More than ~7 visible fields on one step is a finding unless the doc says why.
8. Advanced or rare options are folded behind a disclosure, with the count of what is inside.
9. Defaults are filled where the app can know them (today's date, the user's org, the last choice).
10. Nothing asks for what the app already holds (no retyping data another module or an earlier step has).

**C. Placement and layout**
11. The primary action of each screen is visible in the first viewport at every width (probe: `primary-below-fold`; mark it with `data-primary`).
12. No large empty regions pushing content below the fold; content fills its column; no lone card centred in a desktop void (probe: `sparse-first-viewport` - a heuristic, confirm by eye).
13. Controls sit next to what they govern (`interface-polish` 5); one control height and shape (`interface-polish` 1); actions align on one row and one edge.
14. Say it once: no field or action twice on a screen (`interface-polish` 3).
15. Tables become cards below the breakpoint (`mobile-instruction.md`, `ResponsiveList`).

**D. Phone**
16. No horizontal scroll at 390, ever, including with long data (probe: `horizontal-overflow`). A deliberate horizontal scroller is marked `data-walk-scroll-x`.
17. Primary navigation is a bottom bar on a phone with 3-5 destinations and "More" (`navigation-instruction.md`, `MobileBottomNav`); nothing fixed overlaps it (`--bp-bottom-chrome`; probe: `fixed-overlap`).
18. Tap targets: a 44px hit area on touch (probe: `tap-target`, which counts a covered hit area, #226), not a
    44px drawing; a control redrawn taller on a phone is a finding (#237). Inputs not covered by the keyboard; safe
    areas respected.
19. Fewer elements per screen, not the desktop squeezed: set-once controls fold behind the avatar; sheets replace dropdowns and dialogs (`mobile-instruction.md` §1.4).

**E. States and feedback**
20. Loading, empty, error and partial states exist and explain themselves, with the way out (`interface-polish` 6, `<Async>`).
21. Every action toasts and carries Undo; no native browser dialog (`interface-polish` 7, `saving-and-undo-instruction.md`).
22. Long and non-ASCII data wraps or truncates with the full value reachable; nothing clips silently.
23. Reload and Back keep the user where they were (URL holds the state that matters).

**F. House floor**
24. Both themes legible; contrast; focus visible on every control; reduced motion honoured.
25. Plain hyphens in copy; no compliance score or readiness %; no coloured left-edge accent line on a card.

**G. Speed** (the numbers and the levers are owned by `loading-instruction.md`; the measurement is `npm run check:load`)
26. A screen draws its frame at once and never a blank viewport: header, navigation, title and a skeleton in the shape of the content (`loading-instruction.md` section 1, Frame).
27. First content, Usable, CLS and the longest task are inside the budget table, for a first visit, a return and an in-app navigation, on the desktop and the phone profile (probe: `npm run check:load`; every number over budget is a gap with its measurement).
28. A long list shows its first screenful first and the rest after it (`RenderMore`); no whole fetched array mapped into the first commit.
29. Nothing moves after First content: a skeleton holds the height of what replaces it, images carry their size, rows append below and never above what is read.
30. A screen the person has seen comes back from memory (`useQuery` with `persist`, or `useLastKnownAsync`), and a navigation to one needs no request before it paints.
31. An over-budget screen is a gap of class **fix**, written with its numbers and the lever of `loading-instruction.md` section 3 that is missing, fixed and re-measured in the same run. A screen that still misses after the levers were applied becomes an issue with the measured breakdown, not a silent pass.

## Rules for every run

- **Dev server, zero credentials, simulated identities.** Never point the walk at a preview or production URL with real data; never sign in with a real account.
- **Synthetic means synthetic.** No real names, emails, customer files or regulatory documents under NDA in fixtures. Generated files stay in the scratchpad unless one is worth keeping as a test fixture.
- **Commit locally; push only on the owner's say-so.** Docs-only commits carry `[skip vercel]`.
- **The probe's thresholds are floors, not the review.** A screen that passes the probe still gets every checklist item by eye.
- **Do not invent workflows.** The matrix comes from the docs and the code. A workflow that seems obviously needed but appears nowhere is a **decide** gap, not something to build.
- **Generated code stays generated.** A gap inside `src/shared/` is fixed in blueprint `packages/*` and re-synced; in a module repo, file it as an issue against blueprint instead.

## Why this shape

- The owner was the test harness: half-built workflows and phone layouts were found by hand, after the agent called the work done. The coverage matrix and the probe move both discoveries into the agent's loop.
- Workflows, not routes: a route list says what exists; only the feature doc says what should.
- Fixed thresholds plus a numbered checklist make two runs comparable, which is what makes a regular cadence worth anything.
- Fix-and-prove in one run, with decisions batched once, matches `/next`: the owner answers a few taps and comes back to committed work.
