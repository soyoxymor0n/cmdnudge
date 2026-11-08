---
name: owner-questions
description: How to ask the owner a decision that is theirs to make. Use whenever you are blocked on a choice you cannot settle from the request, code, docs or a sensible default - ask with AskUserQuestion, never a prose question.
---

# Asking the owner

Use `AskUserQuestion`, never a prose question in the output. The owner is often on a phone with a
remote session; a structured question is answered with a tap and notifies them, a paragraph waits
until they are back at a computer.

- Each question is self-contained (no scrollback assumed): say what is decided and why it matters.
- Recommended option first, labelled "(Recommended)"; short labels, trade-off in the description.
- Batch related questions into ONE call (max 4) rather than asking serially.
- Ask only when the answer changes what you do next and you cannot settle it from the code, the
  docs or a sensible default. Otherwise pick the default, state the assumption in your summary and
  continue. Never ask "OK to proceed?" about a plan.
- Subagents and unattended/headless runs cannot reach the owner: report the open question back in
  the final message instead of asking.

## No one to ask

If `AskUserQuestion` is unavailable, errors, or the session is non-interactive (`CLAUDE_CODE_REMOTE` set and
running as a routine), never block or wait. (1) Take the safe, reversible default and continue. (2) Record the
question as an `owner-action` issue with a valid ```` ```decision ```` block (recommended option = the default
taken; `docs/standards/owner-decisions-instruction.md`): cloud `node tools/gh-rest.mjs issue-create --title T
--label owner-action --input body.json`; local `node tools/feature-issues.mjs --decisions`. (3) Say in the
summary which default was taken and the issue number.
