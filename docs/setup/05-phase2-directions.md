# 05 — Phase 2 Directions

> Slot 05 of the definition set for **cmdnudge**. Architect for these, don't build them. [`02-features.md`](02-features.md) is the contract that wins; nothing here is built because it was written down.
> Standard: blueprint `docs/standards/project-docs-instruction.md`.

| Direction | Why it waits | Architect for it now by |
|---|---|---|
| **Practice drills** with a confidence score from accuracy + speed (KeyCombiner pattern, `context/03-prior-art-research.md`) | Passive coaching must prove itself first | storing per-action `mac_correct` counts and the miss → correct latency as a local daily aggregate |
| **More layouts** (UK, FR, ES, IT, Nordic, Swiss) | US/DE/AT first; each layout needs measured data | layout as a key in every `habit_rule` and `binding` variant ([`08-shortcut-library-and-habit-map.md`](08-shortcut-library-and-habit-map.md)) |
| **Linux recorder** | No owner need; KeyCat-style niche | keeping capture behind one `Chord` interface ([`03-architecture.md`](03-architecture.md)) |
| **Strict mode polish** (gradual escalation per action: toast → block after N misses) | Toast-only is the default; strict exists but basic | modes as a per-action setting in the matcher, not a global flag |
| **Mac → Windows direction** (people going the other way) | Different audience | the library is symmetric by action; habit rules are directional data |
| **Bind an action to a mouse button via Mac Mouse Fix NG** | Needs an MMF NG integration point | the shared action ids in `packages/library` are the same ids MMF NG uses |
| **Community data contributions** (suggest a mapping from the app, PR flow) | Data quality process first | `sourceURL` + `verifiedOn` required on every entry; checker in CI |
| **Team / IT rollout** (MDM profile, preconfigured settings) | No B2B product; anti-scope in [`01-project-description.md`](01-project-description.md) | settings readable from a managed plist / registry key |
| **App UI localisation** (German first) | English UI first | string keys from day one |
| **Mac App Store** | Event taps and Accessibility make sandboxing hard | nothing; direct download is the channel |
