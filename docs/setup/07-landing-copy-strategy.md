# 07 — Landing Copy Strategy

> Slot 07 of the definition set for **cmdnudge**. Convinces: a stranger, in five seconds. StoryBrand source: [`cmdnudge-brief.md`](cmdnudge-brief.md). Features it may promise: [`02-features.md`](02-features.md) only.
> Standard: blueprint `docs/standards/project-docs-instruction.md`. Before the copy ships: `public-feature-copy` and `writing-human` passes.

## Who must be convinced, and of what

A Windows power user who just got a Mac (or keeps both) and is tired of looking up shortcuts. In five seconds they must get: **it watches my Windows habits on the Mac and shows me the Mac key, right when I slip, and it doesn't log my typing.**

## The one-liner

> Your Windows shortcuts, translated the moment you press them. cmdnudge shows the Mac shortcut right when your old habit slips, until you don't need it anymore.

## Page spine

1. **Hero:** the one-liner + an animated toast (`Ctrl+C → ⌘C · Copy`) over a Mac window. CTA: **Download for Mac**; secondary: Windows recorder.
2. **The pain, in the owner's words** (internal problem): quitting the chat app when you meant to type "@"; working out the screenshot shortcut every single time; not knowing how long relearning takes. Source: `context/02-interview-answers.md`.
3. **How it works, 3 steps:** install → work as usual → each slip shows the Mac key; mastered habits fade out.
4. **The Cmd+Q save:** one short section on the guard. It is the most concrete, most shareable moment.
5. **Your own top habits:** the Windows recorder ranks what you use most; your Mac coach teaches those first.
6. **Privacy, provably:** "We never record what you type. Only key combinations like Ctrl+C, counted per app. Read the code." with a link to the exact file ([`09-input-capture-and-privacy.md`](09-input-capture-and-privacy.md)). Sync options: account or your own folder.
7. **Not a remapper:** one honest line for the anti-persona: if you want your Mac to act like Windows forever, use Karabiner. cmdnudge teaches you the Mac.
8. **FAQ:** permissions, layouts (US/DE/AT), Apple vs PC keyboards, remote desktop, free forever, open source.
9. **Footer:** GitHub, privacy, imprint, **"Also from us: Mac Mouse Fix NG"** (owner's request).

## Claims allowed, and their limits

- "Free and open source" — MIT, yes.
- "Never records what you type" — only if [`09-input-capture-and-privacy.md`](09-input-capture-and-privacy.md) is implemented as written; the claim links to the code.
- "Works in every app" — **not allowed.** Habit hints work in every app; app-specific hints depend on the library and menus. Mouse-to-menu hints are not promised until **Open-3** is resolved.
- "Learn in two weeks" — not allowed; no data. Use "watch your misses drop".
- Layouts: name US, German and Austrian explicitly.

## Contradiction flagged (C3)

"Always transparent with source code to prove that no personal data is logged" (`context/02-interview-answers.md`): open source code shows what the code does, not what a downloaded binary does. The copy says "read the code" and the release builds come from public CI with published checksums (D15); it does not say "proven". See [`cmdnudge-open-questions.md`](cmdnudge-open-questions.md).
