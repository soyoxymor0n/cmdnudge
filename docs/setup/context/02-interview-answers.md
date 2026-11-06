# Interview answers (verbatim, 2026-11-06)

Questions as asked (abridged to the question line), answers exactly as given.

## Brainstorm round

- Q: Do you still use Windows every day, or are you mostly on the Mac now?
  A: "Both, every day"

## Research request

> Do a quick research first of other projects out there and have solved this already. Either there's a perfect free solution out there or we can learn something from them and build our perfect solution based on others learnings

(Result: see `03-prior-art-research.md`.)

## Brief round 1

- Q: Who is the shortcut-coach app for, beyond you?
  A: "Switchers from day one"
- Q: Which single moment should feel magical in the first demo?
  A: "Habit caught on the Mac (Recommended)" - you press Ctrl+C or Win+E out of habit in Chrome or Finder, and a toast instantly shows the right Mac shortcut for that app.
- Q: How should the coach react when it catches a Windows habit on the Mac, by default?
  A: "Toast only (Recommended)"
- Q: Money: what's the plan for paying?
  A: "Free + open source (Recommended)"

## Brief round 2

- Q: Internal problem: what does a Windows-habit slip on the Mac feel like?
  A: "From slow and clumsy to annoyed and desperate. Closing apps with CMD+Q whenever you want to tag somebody mid conversation and then not fi Ding your app back quickly is a nightmare. Having to think how to make a screenshot every time when you want to show someone something quickly is agonizing. The worry of not knowing how long unlearning and relearning takes can cause feelings of regret"
- Q: How should progress sync between someone's Windows PC and Mac? (options: 1 local first/file sync, 2 hosted sync with account, 3 no sync)
  A: "2 by default, 1 as alternative for people who want no account or data sharing. Also always transparent with source code to prove that no personal data is logged"
- Q: What belongs in the first public release besides the Mac habit coach?
  A: "Stats screen + missed list,Windows recorder,Mouse-to-menu hints,Landing page,Sync with shared shortcut library from mmf ng. Also link to mmf ng on bottom of landing Page"
- Q: Which keyboard layouts must the first release handle correctly?
  A: "US + German/Austrian (Recommended)"

## Brief round 3 (name)

- Q: Pick names to research (cmd.coach, unwindow, keyshift, rekey, ...)
  A: "CMD.coach is nice but tld is reserved. Rekey is also nice but heavily taken. cmdctrl.com is available"
- Q: Anti-persona?
  A: "Remap-to-Windows people (Recommended)"
- Q: cmdctrl.com is registered since 2004 and the name is crowded; which way?
  A: "My bad, I had checked cmdcntrl.com like removing all vowels but it's probably a recipe for disaster"
- Q: ctrl2cmd is out (existing paid remapper). cmdnudge / musclekeys / relearnkeys / unwindow?
  A: "cmdnudge.com is fine. cmdcue.eu is available and cheap (but cmdcue.com is taken)"

## Brief round 4

- Q: Should destructive collisions (right Cmd+Q from the AltGr+Q "@" habit) be guarded?
  A: "Guard destructive ones (Recommended)" - blocked by default, toast shows the right key; everything else toast only; can be turned off.
- Q: Register cmdnudge.com now via Spaceship?
  A: "I have several Domains in my spaceship shopping cart. Any way you can buy cmdnudge.com alone and "restore" my shopping cart?"
  Follow-up Q (direct API registration, cart untouched): A: "Yes, buy cmdnudge.com"
  Outcome: registered 2026-11-06 via API, order 0391ddd0-e3e5-4888-9bb3-1853ba1dc4a9, 1 year, auto-renew on, privacy high.
- Q: What may leave the device with hosted sync?
  A: "Counts + progress only (Recommended)" - per app family and action: how often, last miss, streak, mastered. No timestamps per key press, no window titles, no typed text.
- Q: Which open-source license?
  A: "MIT (Recommended)"

## Request for this set

> Great, let's build the audience brief now. Interview me on key decisions. Then build the project description docs as per blueprint project standard
