# cmdnudge — Open Questions and Assumptions

> Companion to the `01`–`09` definition set. Two jobs: record what in the source
> material is **ambiguous or contradictory** (flagged, never silently resolved), and
> record every **decision the source material did not determine**, so the owner can
> confirm or correct it.
> Sources: `context/01-original-idea.md`, `context/02-interview-answers.md`, `context/03-prior-art-research.md`, [`cmdnudge-brief.md`](cmdnudge-brief.md).

## Part 1 — Ambiguities and contradictions found in the source

Ordered by how much damage they do if left unresolved.

| # | What conflicts | Where | Working assumption until confirmed |
|---|---|---|---|
| ~~**C5**~~ | **Resolved 2026-11-06: owner chose to re-home the data they authored under MIT, crediting MMF NG.** The library is to be shared with Mac Mouse Fix NG and cmdnudge is MIT. MMF NG's repo is under the **MMF License** (Noah Nuebling): derived work must credit MMF, and there are conditions on published programs. The shortcut data in NG was written in this fork, but it sits in a repo under that licence | `context/02-interview-answers.md` (MIT, "sync with shared shortcut library from mmf ng"); MMF NG `License` | Treat the facts (shortcuts are vendor facts) as re-verifiable. Move the data the owner authored into `packages/library` under MIT with the owner as author, credit MMF NG, and re-check that no upstream-authored file is copied. **Owner confirms** |
| **C1** | The brief's rule "Must = the demo moment, everything else Should/Later" vs. the owner putting every Should into the first public release | brief "MVP cut"; `context/02-interview-answers.md` round 2 | Two milestones: P0 private build (~11 person-days), then public release with P1 (~34). [`02-features.md`](02-features.md) |
| **C6** | Hosted sync with an account is the default, but the brand promise is "no personal data". An account means an email address and a server (Clerk + Turso) that must be run, secured and covered by a privacy page, for a free tool | `context/02-interview-answers.md` ("2 by default, 1 as alternative") | Kept as decided: hosted by default, file sync offered on the same screen as an equal choice. Privacy page lists the email + counter rows. [`09-input-capture-and-privacy.md`](09-input-capture-and-privacy.md) |
| **C4** | "Toast only" default vs. "guard destructive ones" default: the guard blocks keys, which needs Accessibility on the Mac, a heavier permission than a listen-only tap | round 1 vs round 4 | Onboarding asks for both permissions; without Accessibility the guard is off and the app says so |
| **C3** | "Always transparent with source code to prove that no personal data is logged": source code shows what the code does, not what a downloaded binary does | round 2 | Release builds from public CI with published checksums (D15); copy says "read the code", never "proven". [`07-landing-copy-strategy.md`](07-landing-copy-strategy.md) |
| **C9** | The original idea stores "application plus shortcut and shortcut meaning" for every shortcut used and builds "a repository of the shortcuts that I use very often". The privacy rule keeps only combos that match a library action | `context/01-original-idea.md` vs invariant 1 | Unknown combos are dropped; an opt-in, local-only "unknown combos" list helps grow the library (D17) |
| **C2** | The original plan is "on windows first" with a toast on Windows; the agreed plan is Mac coach first, Windows as a recorder | `context/01-original-idea.md` vs brainstorm + round 1 | Mac coach is P0, Windows recorder P1, optional Windows preview toast P2 |
| **C7** | "Counts + progress only" leave the device, yet stats show streaks and trends | round 4 | Days, not timestamps: counters carry first/last seen **day**; daily aggregates stay local (D9) |
| **C8** | The original example "Win+E > Cmd+Space - finder" is wrong: ⌘Space is Spotlight; ⌥⌘Space opens a Finder window | `context/01-original-idea.md` | Corrected in [`08-shortcut-library-and-habit-map.md`](08-shortcut-library-and-habit-map.md). Shows that every mapping needs a source |

## Part 2 — Decisions made that the source did not determine

| # | Decision | Why | Cost to reverse |
|---|---|---|---|
| **D1** | Desktop app on Tauri 2 (Rust core + React UI) for both platforms. **Confirmed by owner 2026-11-06** | one codebase, small binary, React reuse | **High** once capture exists |
| **D2** | One monorepo: `apps/desktop`, `apps/web`, `packages/library` | library, app and site change together | Low |
| **D3** | Sync as per-device counters merged by sum, same rows for hosted and file sync | no conflicts, no CRDT | Medium (data migration) |
| **D4** | Clerk sign-in through the system browser + deep link/loopback, token in Keychain/Credential Manager | Clerk has no Tauri SDK | Medium; see Open-4 |
| **D5** | Key-combo filter as in [`09-input-capture-and-privacy.md`](09-input-capture-and-privacy.md) | invariant 1 | Low in code, **high in trust** if loosened later |
| **D6** | Toast bottom right, non-activating, 2.5 s, one at a time | owner's original picture; macOS notifications sit top right | Low |
| **D7** | The guard blocks only combos that match a habit rule (e.g. **right** ⌘Q on Apple keyboard + DE/AT), never a deliberate left ⌘Q | avoid blocking real intent | Low |
| **D8** | Mouse-to-menu hint after 3 mouse uses of the same item | Key Promoter X threshold pattern | Low |
| **D9** | Daily aggregates are local only, never synced; no finer grain than a day anywhere | invariant 5, C7 | Low |
| **D10** | Windows recorder shows no toast by default | Windows phase is for ranking | Low |
| **D11** | Terminals, remote desktop, VMs, Citrix excluded by default | Windows shortcuts are correct there | Low |
| **D12** | Mastered = ≥ 10 correct uses and no miss in 14 days | simple, explainable | Low |
| **D13** | Keyboard type (Apple / PC) is part of every habit rule, auto-detected with manual override | AltGr trap differs by keyboard | Medium (data shape) |
| **D14** | Public GitHub repo, MIT, code and data | owner chose MIT | High once others depend on it |
| **D15** | Release builds only from public CI, checksums published | makes C3 checkable | Low |
| **D16** | `packages/library` lives in the cmdnudge repo; MMF NG reads it (submodule or release artifact) | one source; no third repo yet | Low to move later |
| **D17** | Local "unknown combos" list, opt-in, never synced | C9 | Low |
| **D18** | Landing + sync API on the house stack at cmdnudge.com (Vercel Hobby) | house default; domain bought 2026-11-06 | Low |

## Part 3 — Open questions carried forward

| # | Question | Why it matters | Status |
|---|---|---|---|
| ~~**Open-1**~~ | Is there a target date for the private P0 build and the public release? | ~34 person-days total | **Answered 2026-11-06:** "Everything built tonight, as far as possible. Ready to be used tomorrow on mac". Sharpens C1: tonight's build is the Mac P0 for the owner's own Mac; P1 follows |
| ~~**Open-2**~~ | Repo home: `soyoxymor0n/cmdnudge` or a `cmdnudge` GitHub organisation (handle is free)? | release URLs, brand | **Answered 2026-11-06:** `soyoxymor0n/cmdnudge`, public |
| **Open-3** | Can Accessibility reliably catch menu items picked with the mouse in every app (Electron, Catalyst, Java apps)? | P1 feature and landing claim | Needs a 1-day prototype |
| **Open-4** | Current Clerk support for desktop/native sign-in (device flow, deep link)? | D4 design | Check before sync work |
| **Open-5** | Windows code signing: buy a certificate, use Azure Trusted Signing, or ship unsigned first? | SmartScreen warnings scare switchers | Owner decision #25 |
| **Open-6** | Brand identity (colours, logo, toast look) via `brand-identity` | toast and landing need it | Next step |
| **Open-7** | Auto-pause when screen-sharing apps are in front (Zoom, Teams, Meet in browsers)? | hints during presentations | Owner decision #24 |
| ~~**Open-8**~~ | Measure the habit table on real hardware: Apple keyboard DE/AT, PC keyboard on Mac DE/AT, US | rows in [`08-shortcut-library-and-habit-map.md`](08-shortcut-library-and-habit-map.md) are design intent | **Measured 2026-11-06:** Apple keyboard, Austrian layout; guard on for DE/AT Apple |
| **Open-9** | Reuse the Apple Developer account used for Mac Mouse Fix NG for notarization? | Mac release | Owner decision #23 |

## Part 4 — Constraints that are NOT open questions

Recorded so they are not re-litigated.

- Name **cmdnudge**, domain **cmdnudge.com** (registered 2026-11-06, Spaceship, auto-renew on).
- Free and open source, MIT. No payments.
- Audience: switchers, public from day one. Anti-persona: remap-to-Windows people.
- Demo moment: habit caught on the Mac. Default mode: toast only. Guard for destructive collisions on by default.
- Hosted sync default, file sync alternative; only counts + progress sync.
- Layouts in the first release: US, German, Austrian.
- Landing footer links to Mac Mouse Fix NG.

## What to confirm first

~~C5, D1, Open-1~~ answered 2026-11-06 (MIT re-home, Tauri 2, build tonight for use on the Mac tomorrow). Next:

1. **Open-8 — measure the habit table on the owner's Mac** (keyboard type + DE/AT), since the P0 guard depends on it.
2. **Open-3 — menu-by-mouse prototype**, before it is promised anywhere.
3. **Open-9 — Apple Developer account for signing**, so the P0 build runs without Gatekeeper friction.
