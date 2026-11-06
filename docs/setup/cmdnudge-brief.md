# cmdnudge - Project Brief

> Produced by the `project-brief` skill on 2026-11-06. This file is the single
> source the `new-project` + `brand-identity` skills consume. Keep it honest:
> it should be concise enough to read in 3 minutes and complete enough that a
> stranger could build the right MVP from it.

## One-liner

People switching from Windows to Mac get their Mac shortcuts into muscle memory fast, because cmdnudge catches each Windows habit the moment it happens and shows the right Mac shortcut for that app.

## The idea in one paragraph

Switchers carry years of Windows shortcuts in their fingers. On the Mac those habits either do nothing, do the wrong thing, or quit the app. Today the options are cheat sheets you never look at, practice drills disconnected from real work (KeyCombiner, Mouseless), or remappers that make the Mac behave like Windows forever (Karabiner configs, Ctrl2Cmd), which stops you from ever learning. cmdnudge is a free, open-source background app for Mac and Windows that listens only to key combinations. On the Mac it spots a Windows habit (Ctrl+C, Alt+Tab, Win+Shift+S, AltGr+Q) in the frontmost app and shows a small toast with the Mac shortcut. It guards the destructive ones, such as a habit that would quit the app. On Windows it records which shortcuts you really use, so the Mac coach teaches your own top habits first. Nothing on the market does this: no tool watches real work on the Mac and translates Windows habits in context (research of 2026-11-06).

## StoryBrand (SB7)

| Element | Answer |
|---|---|
| **Character (hero)** | A Windows power user who switched (or half-switched) to the Mac and wants to be as fast as before |
| **Problem - external** | Windows shortcuts fail on the Mac: nothing happens, the wrong thing happens, or the app quits. Looking up each shortcut breaks the flow |
| **Problem - internal** | From slow and clumsy to annoyed and desperate. Pressing what used to be "@" mid-conversation quits the chat app and you can't find your place again; thinking about how to take a screenshot every time you want to show something is agonizing; not knowing how long unlearning takes feeds regret about the switch |
| **Problem - philosophical** | Your computer knows exactly what you meant. It should tell you, not punish you |
| **Guide** | Built by a Windows-to-Mac switcher who still uses both every day. Open source, so anyone can check that no typed text is ever logged. Uses the verified shortcut library of Mac Mouse Fix NG |
| **Plan** | 1. Install on your Mac (and your PC if you still use one). 2. Work as usual. 3. Each slip shows the Mac shortcut; your top habits drop off the list as you master them |
| **Call to action** | Direct: Download for Mac. Transitional: see your top 10 Windows habits and their Mac shortcuts |
| **Failure** | Months of slow, error-prone work; lost windows and messages; the feeling the switch was a mistake |
| **Success** | Fast again within weeks; Mac shortcuts feel native; you stop thinking about the keyboard |

## Value Proposition Canvas

**Customer profile**
- Jobs to be done: functional - work at full speed on the Mac; social - not fumble in screen shares and meetings; emotional - feel competent again and sure the switch was right.
- Pains: 1. destructive slips (quit the app, close the window); 2. constant lookup of everyday shortcuts (screenshot, word jump, rename, switch apps); 3. no idea how long relearning takes or what to learn first; 4. remappers keep you dependent on Windows habits; 5. privacy worry about anything that listens to the keyboard.
- Gains: expected - the right shortcut shown when needed; desired - learn in order of your own real habits, see progress; unexpected - learn shortcuts for things you did with the mouse.

**Value map**
- Products & services: Mac habit coach (event tap + frontmost app + toast); destructive-collision guard; mouse-to-menu hints; stats screen with missed list, streaks, mastered; Windows recorder; hosted sync (account) or file sync (no account); shared action-based shortcut library with MMF NG; landing page.
- Pain relievers: guard -> pain 1; toast in context -> pain 2; Windows-ranked list + mastered progress -> pain 3; toast-only default (no remap) -> pain 4; counts-only data, open source, file-sync option -> pain 5.
- Gain creators: toast -> expected gain; Windows recorder + ranking + stats -> desired gain; mouse-to-menu hints -> unexpected gain.

**Fit check:** the MVP covers all five pains and all three gains. Consciously deferred: practice drills, more keyboard layouts than US/DE/AT, Linux.

## Audience

- Primary persona: knowledge workers and developers moving from Windows to Mac, often keeping a Windows PC at work or at home; found on r/mac, r/macapps, Hacker News, switcher guides, IT onboarding pages. Willingness to pay: low; free and open source.
- Secondary: people who use both systems every day and keep switching back and forth; IT teams onboarding staff to Macs (point them at the download, no B2B product).
- Anti-persona: people who want the Mac to behave like Windows forever - they should use a remapper such as Karabiner. Also not a cheat-sheet app for Mac natives (KeyCue, KeyClu already do that).

## MVP cut

- Must (the demo moment): in Chrome or Finder you press a Windows habit (Ctrl+C, Win+E, Win+Shift+S) and a toast instantly shows the Mac shortcut for that app; a destructive collision (right Cmd+Q from the AltGr+Q "@" habit) is blocked and the toast shows Option+L.
- Should (also in the first public release): stats screen + missed list; mouse-to-menu hints ("you could have pressed Cmd+Shift+T"); Windows recorder; hosted sync by default (Turso + Clerk; counts and progress only) with file sync as the no-account option; action-based shortcut library shared with Mac Mouse Fix NG; landing page on cmdnudge.com with a link to MMF NG in the footer; US + German/Austrian layouts.
- Later (named, deliberately deferred): practice drills with a speed/accuracy confidence score; strict mode polish; more layouts (UK, FR, ES, IT, Nordic); Linux; per-team rollout.

## Name

**Decision: cmdnudge** (slug: `cmdnudge`)

| Candidate | Why | Risk check result |
|---|---|---|
| cmdnudge ✅ | Says the mechanism (a gentle nudge toward Cmd) and the platform | Web search: no product named cmdnudge or keynudge. "Nudge" alone is common (macadmins/nudge macOS update tool, reminder apps), but not as a compound. GitHub handle free. cmdnudge.com and .app available at standard price |
| cmdcue | Short, "cue" fits hints | cmdcue.com taken, cmdcue.eu available. Too close to KeyCue (Ergonis), a direct Mac shortcut competitor |
| cmdctrl / cmdcntrl | Owner's first idea | cmdctrl.com registered since 2004; CMDCTRL developer tool for Claude Code/Cursor agents; pending US application "CMD+CTRL" in class 9 (software, filed 2024-11-19); Messe Muenchen holds "CMD CTRL". Dropped |
| ctrl2cmd | Describes the switch | Existing paid Mac remapper Ctrl2Cmd (the remap approach we position against). Dropped |
| musclekeys, relearnkeys | Promise-led | .com and .app free, no collisions found; less distinctive. Not chosen |

Risk research notes: searched the web for each name plus "app", "software", "trademark"; checked registry RDAP (Verisign, Google Registry) and Spaceship availability; checked GitHub handles. EUIPO/USPTO databases were not queried directly for cmdnudge - run a proper search before any paid marketing. This is a red-flag scan, not legal advice.

## Domain

**Decision: cmdnudge.com** - registered 2026-11-06 via the Spaceship API (order 0391ddd0-e3e5-4888-9bb3-1853ba1dc4a9), 1 year, auto-renew on, WHOIS privacy high. Standard price (about $10/yr).

| Option | Available | Price/yr | Notes |
|---|---|---|---|
| cmdnudge.com | Bought | ~$10 | Primary |
| cmdnudge.app | Yes (2026-11-06) | ~$15 | Optional later |
| cmdcue.eu | Yes | ~$5 | Backup name only |

Owned-domain check: none of the 66 owned Spaceship domains fit. House patterns: playful TLD-hacks or clean .com; cmd.coach was not available.

## Monetization hypothesis

None. Free and open source under the MIT license, code and shortcut data. Costs must stay on free tiers (Vercel Hobby for the site, Turso + Clerk free tiers for sync); the file-sync option means sync never has to scale with paid infrastructure. Donations or sponsorship can be added later without changing the product.

## Open questions for the owner

- Windows recorder technology: shared Tauri (Rust) core for both platforms, or a native Swift Mac app plus a small Windows tray app? (Default: Tauri.)
- Does catching menu selections through Accessibility work reliably in every app? Needs a prototype before it is promised on the landing page.
- Code signing and notarization for a public download: reuse the Apple Developer account of MMF NG? Windows signing certificate or unsigned first?
- Repository home: personal GitHub (soyoxymor0n) or a cmdnudge organisation?

---
*Next steps: `brand-identity` skill (visual identity + tokens) -> `new-project`
skill (generate the app; pass this file via `--brief`).*
