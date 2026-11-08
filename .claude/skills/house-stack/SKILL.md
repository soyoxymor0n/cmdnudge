---
name: house-stack
description: >-
  Conventions for the "house stack" — a Vite + Express + React + Turso + Clerk
  app deployed on Vercel, where one process serves UI + API in dev. Use when
  editing api/* route handlers, server.ts, or vite.config; adding a route;
  wiring dev-vs-prod behaviour; using the frontend DataService; or debugging an
  import that resolves at build but fails at runtime.
---

# House stack conventions

Shared architecture across the workspace's web apps (centr-coach, mybeats,
newspills, skillbase, styleops, spark2app, regops-*, decide-monster, …). When a
repo follows this layout, these rules are load-bearing — breaking them breaks
dev/prod parity. Verify the repo actually uses this stack before applying.

## ESM with `.js` specifiers on `.ts` source
Always import sibling modules with a `.js` extension even though the file is
`.ts`:

```ts
import { db } from '../lib/database.js';   // the file is database.ts
```

Required for the Node/Vercel ESM runtime. A bare `'../lib/database'` will
type-check but fail at runtime.

## One framework-agnostic handler per `api/*` file
Each route is a single `(req, res) => {}` function (the Vercel function shape),
one per file in `api/`. `server.ts` mounts those **exact same handler
functions** on Express for local dev. There is **one** implementation of every
route.

- Never re-implement route logic inside `server.ts`. Add it to the `api/*`
  handler and it works in both places.
- Shared business logic lives in `src/` modules that both the handler and any
  background worker import — don't fork it (e.g. a pipeline in
  `src/pipeline/*` called by both the prod handler and the local sweeper).

## Single dev process
`npm run dev` runs `server.ts` (via `tsx`), which mounts the Vite dev
middleware itself — Express + Vite + any local cron/sweeper in one process on
one port. There is no separate API server in dev. The `/api` proxy in
`vite.config.ts` only matters if you run bare `vite`.

## Frontend DataService + localStorage fallback
The app's `DataService` (in `App.tsx`) talks to `/api/*` and falls back to
localStorage when the API is unavailable, so the PWA degrades gracefully.
Route new data access through that layer rather than scattering raw
`fetch('/api/...')` calls.

## Typical commands
- `npm run dev` — one process: UI + API + local jobs
- `npm run build` — `vite build` → `dist/`
- `npm run lint` — `tsc --noEmit` (type-check only; usually no ESLint)
- `npm test` — vitest offline (see the **turso-data-layer** skill for the test model)

## Secrets
Live in `.env` (gitignored) and the Vercel project env. Never hard-code or echo
their values; refer to them by env-var name only.

See also: **turso-data-layer**, **logging-discipline**, **background-pipeline**,
**ai-model-cascade**, **vercel-deploy-flow** skills.
