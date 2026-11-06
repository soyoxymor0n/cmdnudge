# 06 — Metrics and Analytics

> Slot 06 of the definition set for **cmdnudge**. Success criteria: [`01-project-description.md`](01-project-description.md). Data model: [`03-architecture.md`](03-architecture.md).
> Standard: blueprint `docs/standards/project-docs-instruction.md`.

## Principle

The app sends **no telemetry**. Every learning metric is computed on the device from counters; only counts and progress sync (invariant 5). The project's own adoption is measured from public signals only.

## Learning metrics (local, shown to the user)

| Metric | Definition | What it means |
|---|---|---|
| Misses per active hour | `habit_miss` count / hours with at least one key combo, per day | The headline trend. Success criterion 3: half within 4 weeks |
| Mastered actions | an action with ≥ 10 `mac_correct` and no `habit_miss` in the last 14 days (D12) | Progress the user can see; replaces "how long will this take" |
| Top habits still costing you | `habit_miss` count over 14 days, ranked; ties broken by Windows `win_use` rank | The list the user learns from |
| Mouse-to-menu uses | `menu_by_mouse` per action | Candidates to learn next |
| Guard saves | blocked destructive combos | Shown once a week ("cmdnudge stopped 3 accidental quits") |

## Project metrics (public signals only)

- GitHub release download counts per platform, stars, issues.
- Landing page: Vercel Web Analytics (cookieless) for visits and download clicks.
- No in-app ping, no update-check identifiers beyond what the update feed needs (the update check sends no device id).

## Volume estimate (free-tier fit)

Per user: ~150 actions × ~6 kinds × 2 devices ≈ 2,000 counter rows, rewritten at most every 10 minutes while active. 1,000 users ≈ 2 million rows — inside Turso's free tier. Writes are bounded by syncing every 10 minutes plus on quit, not on every key press. Check against `free-tier-budgets` before launch.

## Must NOT be built

- Telemetry, crash reporting with key data, analytics SDKs in the desktop app.
- Leaderboards, social sharing of stats, streak-loss notifications. A tool that is a key listener must never feel like it watches you.
- Auto-tuning of thresholds from aggregate user data (there is no aggregate data, by design).
- Per-keypress timelines, even locally. Daily aggregates are the finest grain (D9).
