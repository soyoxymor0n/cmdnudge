---
name: capabilities
description: >-
  What Claude can do itself in this stack, locally and in cloud sessions, and where the credentials come from.
  Load BEFORE telling the owner to do anything manually (Vercel, Clerk, Stripe, Cloudflare, Turso, GitHub, DNS,
  browser checks, dev servers), before provisioning/rotating services, or when a cloud session lacks a tool or secret.
---

# Capabilities: do it yourself first

The owner is the bottleneck. Owner-only: money, entering credentials, product decisions, approvals. Everything else:
try it, then report. Decisions go through `AskUserQuestion`. If a path is truly missing, explore with the owner what
would enable it (token, MCP login, CLI), add it, and record it in the gap table below. Never print secret values.

## First step in any cloud routine
Run `node tools/cloud-selftest.mjs` (`--json` for machine output, `--report` to file/update the one `cloud-gap: selftest failures`
issue via REST). It prints a pass/fail table of what this session can do: gh REST, git push dry-run, node_modules, hooksPath,
every allowlisted host, `ops` variables by name, Chromium. A SessionStart hook runs it automatically when `CLAUDE_CODE_REMOTE`
is set. Its table is the source of truth for cloud gaps and replaces the hand-edited cloud rows in the gap table below.

## Source of truth (read these, do not probe blind)
- blueprint: `tools/*.mjs` (fleet-*, create-app, github-app-token), `tools/template.manifest.json` (env var -> feature),
  `docs/standards/`, `.claude/skills/`, `docs/NEW-PROJECT-PLAYBOOK.md`.
- website-assets `scaffold/`: `SKILL.md`, `SCAFFOLD.md`, `scaffold.js` (Vercel, Turso, R2, Upstash, Clerk, Resend, DNS),
  `secrets-sync.mjs`, `push-github-secrets.mjs`, `hub-connect.mjs`.

## Secrets
- Canonical file `website-assets/.scaffold-secrets` (key=value, gitignored). Lookup: env var first, then
  `../website-assets/`, `$WORKSPACES_ROOT/website-assets/`, cwd (`readSecret` in `tools/github-app-token.mjs`).
- Backup: Bitwarden secure note `scaffold-secrets` via `scaffold/secrets-sync.mjs status|push|pull` (needs `BW_SESSION`,
  owner unlocks; Claude never holds a standing session).
- Key names: VERCEL_TOKEN/VERCEL_TEAM_ID, TURSO_API_TOKEN, CLOUDFLARE_API_TOKEN/ACCOUNT_ID, R2_*, CLERK_SECRET_KEY(+_REGOPS),
  UPSTASH_MANAGEMENT_API_KEY, QSTASH_*, RESEND_API_KEY, SPACESHIP_*, GITHUB_TOKEN, GITHUB_APP_ID/INSTALLATION_ID (+ .pem),
  OPENROUTER_*, HUB_SERVICE_TOKEN.

## What the scaffold skill (new project from blueprint) needs
Flow: `node tools/create-app.mjs ... --github` (blueprint), then `website-assets/scaffold/scaffold.js` (dry run first, `--run`).
| Phase | Does | Tool | Secret names |
|---|---|---|---|
| 1 domain | Spaceship nameservers | REST spaceship.dev | SPACESHIP_PUBLISHABLE_KEY, SPACESHIP_SECRET_KEY |
| 2 repo + project | GitHub repo, Vercel project, domains, www redirect, beta domain, git link | `gh`, REST api.vercel.com, Vercel CLI only for git-link of an existing project | VERCEL_TOKEN (VERCEL_TEAM_ID optional, default baked in), GitHub via `gh` login |
| 3 backends | Turso x2 (prod+beta), R2 x2 + S3 creds, Upstash Redis, QStash, Resend domain+key, OpenRouter/Pollinations per-project keys, VAPID (`npx web-push`) | REST only | TURSO_API_TOKEN, TURSO_ORG, CLOUDFLARE_API_TOKEN/ACCOUNT_ID, UPSTASH_MANAGEMENT_API_KEY, UPSTASH_ACCOUNT_EMAIL, QSTASH_*, RESEND_API_KEY, OPENROUTER_PROVISIONING_KEY, POLLINATIONS_ACCOUNT_KEY |
| 4/7 DNS | Vercel DNS records | REST | VERCEL_TOKEN |
| 5 Google | cloud project + APIs | `gcloud` (NOT installed; consent screen/OAuth client always manual) | gcloud login |
| 6 Clerk | create app, config, DNS targets, keys | Clerk MCP (`mcp__claude_ai_Clerk__*`) + `clerk` CLI (`clerk env pull`, NOT installed) | CLERK_SECRET_KEY_<APP> |
| 8 | Google<->Clerk loop, Microsoft Entra | Clerk MCP; Entra always manual | |
| 9/9b env + hub | push env to Vercel + .env.local, hub connect for reg* modules, CI secrets | REST, `push-github-secrets.mjs` | HUB_SERVICE_TOKEN, GEMINI_API_KEY |
| 10 deploy | redeploy | REST | VERCEL_TOKEN |
Needed CLIs: `gh`, `node/npx`; for phases 5-6 `gcloud` and `clerk`. `vercel`, `wrangler` and `turso` are NOT needed (REST
replaced them; installed on the Mac anyway). Always manual: Google OAuth consent/client/redirect/branding, Entra app + secret,
CloudMailin account, Clerk avatar, Clerk Google redirect URI. Cloud variables and hosts: `node tools/cloud-env.mjs`
(tiers ops/scaffold/ai; `--copy ops` puts KEY=value lines on the clipboard, nothing on disk).

## Local session (owner's Mac / Windows)
- `gh` logged in; Vercel and Clerk MCP connectors (env vars, deployments, logs, config, users); other connectors need a
  one-time login (Stripe, Cloudflare).
- Playwright + Chromium: `node ../blueprint/tools/fleet-visual-check.mjs <repo>...` (borrows a sibling's playwright).
- Sibling repos in `../`, fleet tools (`fleet-drift/sync/push`), scaffold skill (link `website-assets/scaffold` into
  `~/.claude/skills/scaffold`).

## Cloud session (verified in the Claude Code docs 2026-10-24; code.claude.com/docs/en/cloud-environments)
- Environment = `.env`-style variables + setup script (root, Ubuntu, must exit 0, ~5 min) + network level (None, Trusted
  default, Full, Custom allowlist). Variables are readable by the agent and everyone using the environment. For a key the agent
  must not read, use a network secret (host list, proxy attaches the key, never enters the VM, cannot be viewed again).
- So: put the SAME key names as `.scaffold-secrets` in the environment variables (`readSecret` reads env first), and set the
  network level to Custom/Full: api.vercel.com, api.clerk.com, api.turso.tech, api.cloudflare.com, api.resend.com,
  openrouter.ai are NOT on the Trusted list (github.com and registry.npmjs.org are). Check with `node tools/secrets-check.mjs`.
- `gh` is preinstalled, but the GitHub proxy rejects GraphQL: `gh issue`/`gh pr` subcommands 403 there. In cloud use
  `node tools/gh-rest.mjs` (issue-create, issue-comment, issue-edit, issue-list, issue-view, label-list, label-create,
  pr-create; REST over `gh api`, bodies on stdin as JSON); the GitHub MCP tools are the fallback. Same wording in `next`/`so`.
  Repo scope = repos attached to the session; Projects v2 (`gh project`) is GraphQL-only, so local-only.
- Chromium at `/opt/pw-browsers` (never `playwright install`). Account MCP connectors (Vercel, Clerk) reach cloud sessions
  without allowlist entries; check `/mcp`.
- Siblings: a session sees only its attached repos (several can be attached in the browser selector; each needs the Claude
  GitHub App). Do NOT pull many repos in to work across them: when a task needs more than ONE extra repo, file a handoff issue
  per repo via `node tools/gh-rest.mjs issue-create` (title `[todo] ...`, label `todo`, body = exact change + acceptance) for a local session to pick up
  with the fleet tools, and say so in the final report. Tools must not assume `../` siblings without a clone fallback.

## Gap table (update when a gap is found or closed)
| Gap | Where | Fix | Status |
|---|---|---|---|
| `.scaffold-secrets` on the Mac | local | copied by owner | closed 2026-10-24; `tools/secrets-check.mjs`: vercel, turso, cloudflare, clerk(regops), resend, github ok |
| scaffold skill link | local | `~/.claude/skills/scaffold` symlink | closed |
| `bw`, `wrangler`, `vercel` CLIs | local | brew | closed |
| `turso` CLI | local | not needed (REST); `brew trust libsql/sqld` if wanted | optional |
| `gcloud`, `clerk` CLIs | local | scaffold phases 5-6 need them | open |
| cloud secrets | cloud | env vars with same key names + Custom network allowlist | open: owner pastes once, then run secrets-check there |
| cloud: more than one extra repo | cloud | handoff issues via `gh-rest.mjs`, not cloning | rule set |
| Cloudflare D1 for the community Worker | local | `CLOUDFLARE_API_TOKEN` in `.scaffold-secrets` works for R2 and Workers (list), but D1 returns 401 / error 10000 (no D1 permission). Fix: owner runs `wrangler login` (browser authorization), or adds D1 Edit (and Workers Scripts Edit) to the token | open 2026-10-29 |
