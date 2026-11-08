---
name: authorization-discipline
description: >-
  How to authorize access in any multi-user / multi-tenant app so you don't
  ship IDOR holes. Use whenever an action, route, query, or webhook accepts a
  caller-supplied id (record id, household/org id, child/user id), returns
  someone's data or roster, grants a guest/no-account link, or gates a paid
  tier. Read this before writing or reviewing access checks. Every project's
  own auth-helper module (e.g. a src/lib/authz.ts) is the concrete
  specialization of this discipline.
---

# Authorization discipline

A single audit once found a dozen IDOR holes in a workspace app with one shared
root cause: actions trusted client-supplied ids. These rules prevent that class
of bug. They are framework-agnostic; a project's own auth-helper layer is where
they become concrete — use that layer, never re-implement checks inline.

## Rule 1 — every caller-supplied id goes through a shared authz layer

Never trust an id that arrived from the client. Route it through a small set of
reusable helpers that resolve the caller and assert the relationship, e.g.
`requireMember()`, `requireRecordAccess(id)`, `requireOrgAccess(orgId)`,
`requireChildAccess(childId)`. The helper returns the caller (and often the row)
so call sites don't re-fetch. Inline `if (row.ownerId === userId)` checks
scattered across actions are how holes reappear — centralize.

Anything that returns other people's identities (emails, rosters, member lists)
is a stricter grant (organiser/admin-only), not the default read.

## Rule 2 — scope "this user's stuff" queries by ownership, on every path

A record can be owned through more than one relationship (e.g. via the org that
created it OR via a direct user/child link). Scoping by a single join silently
leaks other tenants' rows OR loses legitimately-owned rows that arrived by the
other path. Build the ownership predicate as the OR of every path, and add the
visibility filter (`!= 'private'`) where the surface is shared.

## Rule 3 — guest / no-account access uses unguessable per-row tokens

Endpoints reachable without login (delegation links, emergency pings, magic
links) authenticate by a per-row random token (`crypto.randomBytes(24+)`)
carried in the URL and validated on both the page and the action — never by a
bare row id. Enforce expiry (event passed → reject), make side effects
idempotent (grant karma/points only on a real status *transition*, not on every
hit), and keep any legacy null-token rows id-addressable only if deliberately
grandfathered.

## Rule 4 — webhooks and headers fail closed

Never route or trust attacker-controllable input: don't dispatch on
`X-Forwarded-*` / `Delivered-To` style headers (match a strict recipient token
instead), always signature-verify provider webhooks (Stripe/Clerk/QStash/etc.),
and fail closed with 4xx/5xx — but return 200 to drop garbage you never want
retried.

## Rule 5 — tier / entitlement checks are server-side facts

Whether a caller is on a paid tier comes from the database (the org/household
subscription, or any-paid-member-in-org for shared records), never from client
input and never hardcoded. Gate at the ownership context of the action.

## Rule 6 — every id-accepting action gets a negative test

For each action that takes a caller-supplied id, write at least one test that
seeds a *second* user/tenant, calls with their id, and asserts BOTH that the
call is refused (`{error}` / throw) AND that the target row is unchanged. When
the auth helper walks join tables (memberships, child↔household links), the test
must seed those join rows too, or the helper rightly rejects and the test passes
for the wrong reason.

## When reviewing

Grep for actions/handlers that read an id straight off the request and hit the
DB without passing through the shared helper. Each one is a candidate hole until
proven otherwise.
