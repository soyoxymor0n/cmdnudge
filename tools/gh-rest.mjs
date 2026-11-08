#!/usr/bin/env node
/**
 * gh-rest - issue and PR calls over `gh api` REST, for places where GraphQL is blocked.
 *
 * Cloud sessions sit behind a GitHub proxy that rejects GraphQL, so `gh issue ...` and
 * `gh pr ...` answer 403 there. `gh api` REST works everywhere, so this module does the
 * handful of things the house tools need over REST only. Locally it behaves the same.
 * Not covered: `gh project` (Projects v2 is GraphQL-only; it stays local-only).
 *
 * Bodies and other JSON never travel in argv: every write sends one JSON document on
 * stdin (`gh api --input -`), so quoting and argument-length limits cannot bite.
 * Nothing here creates a label as a side effect; labelCreate is its own explicit call.
 * `repo` defaults to GITHUB_REPOSITORY, then the owner/repo of `git remote get-url origin`
 * (a cloud session's local-proxy remote keeps owner/repo as its last two path segments).
 *
 * Module:  import { issueCreate, issueList, ... } from './gh-rest.mjs'
 *          every call takes { repo?, runner?, ... }; runner(args, { input, env }) -> stdout
 *          string is injectable for tests.
 * CLI:     node tools/gh-rest.mjs <op> [--repo o/r] [--input file|-] [flags]
 *          issue-create  --title T [--label L]... [--input body.json|-]   (JSON keys: title, body, labels)
 *          issue-comment --number N [--input ...]                         (JSON key: body)
 *          issue-edit    --number N [--add-label L]... [--remove-label L]... [--state closed|open]
 *                        [--reason completed|not_planned] [--input ...]   (JSON keys: title, body)
 *          issue-list    [--label L]... [--state open|closed|all] [--limit N]
 *          issue-view    --number N
 *          label-list | label-create --name N --color C [--description D]
 *          pr-create     --head H [--base B] --title T [--input ...]      (JSON key: body)
 *          Output is JSON on stdout.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Default runner: `gh <args>` with optional stdin. Errors keep gh's stderr (rate-limit detection reads it). */
export function makeRunner({ env } = {}) {
  return (args, { input, env: callEnv } = {}) =>
    execFileSync('gh', args, {
      encoding: 'utf8',
      windowsHide: true,
      input,
      maxBuffer: 64 * 1024 * 1024,
      env: callEnv ?? env ?? process.env,
    });
}
const defaultRunner = makeRunner();

/** owner/repo from a git remote URL: https, ssh, scp-style, or a cloud local-proxy URL. Null if none. */
export function parseRepo(url) {
  const clean = String(url ?? '').trim().replace(/\.git$/, '').replace(/\/+$/, '');
  const m = clean.match(/([^/:\s]+)\/([^/:\s]+)$/);
  return m ? `${m[1]}/${m[2]}` : null;
}

export function resolveRepo(repo, { env = process.env, getRemote } = {}) {
  if (repo) return repo;
  if (env.GITHUB_REPOSITORY) return env.GITHUB_REPOSITORY;
  const remote = (getRemote ?? (() => execFileSync('git', ['remote', 'get-url', 'origin'], { encoding: 'utf8' })))();
  const parsed = parseRepo(remote);
  if (!parsed) throw new Error('gh-rest: cannot work out owner/repo; pass --repo');
  return parsed;
}

const json = (runner, endpoint, method, payload, env) => {
  const args = ['api', '--method', method, endpoint];
  const opts = { env };
  if (payload !== undefined) { args.push('--input', '-'); opts.input = JSON.stringify(payload); }
  const out = runner(args, opts);
  return out && out.trim() ? JSON.parse(out) : null;
};

const base = (o) => ({
  repo: resolveRepo(o.repo, { env: o.env, getRemote: o.getRemote }),
  runner: o.runner ?? defaultRunner,
});

/** The shape `gh issue ... --json` gave, so callers keep their code. */
function normIssue(i) {
  return {
    number: i.number,
    title: i.title,
    url: i.html_url,
    state: String(i.state).toUpperCase(),
    body: i.body ?? '',
    labels: (i.labels ?? []).map((l) => (typeof l === 'string' ? { name: l } : { name: l.name })),
  };
}

export function issueCreate(o) {
  const { repo, runner } = base(o);
  const payload = { title: o.title, body: o.body ?? '' };
  if (o.labels?.length) payload.labels = o.labels;
  const r = json(runner, `repos/${repo}/issues`, 'POST', payload, o.env);
  return { number: r.number, url: r.html_url };
}

export function issueComment(o) {
  const { repo, runner } = base(o);
  const r = json(runner, `repos/${repo}/issues/${o.number}/comments`, 'POST', { body: o.body }, o.env);
  return { id: r.id, url: r.html_url };
}

/** Labels add/remove, title/body, and state (closed/open + reason) in as few calls as it takes. */
export function issueEdit(o) {
  const { repo, runner } = base(o);
  const n = o.number;
  if (o.addLabels?.length) json(runner, `repos/${repo}/issues/${n}/labels`, 'POST', { labels: o.addLabels }, o.env);
  for (const l of o.removeLabels ?? []) {
    try { json(runner, `repos/${repo}/issues/${n}/labels/${encodeURIComponent(l)}`, 'DELETE', undefined, o.env); }
    catch (e) { if (!/404|Label does not exist/i.test(String(e?.stderr || e?.message))) throw e; }
  }
  const patch = {};
  if (o.title !== undefined) patch.title = o.title;
  if (o.body !== undefined) patch.body = o.body;
  if (o.state) patch.state = o.state;
  if (o.state === 'closed') patch.state_reason = o.stateReason ?? 'completed';
  if (Object.keys(patch).length) json(runner, `repos/${repo}/issues/${n}`, 'PATCH', patch, o.env);
}

/** state: open|closed|all; labels: all must match; limit caps the result. PRs are filtered out. */
export function issueList(o) {
  const { repo, runner } = base(o);
  const limit = o.limit ?? 100;
  const out = [];
  for (let page = 1; out.length < limit; page++) {
    const args = ['api', '--method', 'GET', `repos/${repo}/issues`, '-f', `state=${o.state ?? 'open'}`, '-f', 'per_page=100', '-f', `page=${page}`];
    if (o.labels?.length) args.push('-f', `labels=${o.labels.join(',')}`);
    const raw = runner(args, { env: o.env });
    const items = raw && raw.trim() ? JSON.parse(raw) : [];
    out.push(...items.filter((i) => !i.pull_request).map(normIssue));
    if (items.length < 100) break;
  }
  return out.slice(0, limit);
}

/** Issue plus its comments as { author: { login }, body }, like `gh issue view --json comments`. */
export function issueView(o) {
  const { repo, runner } = base(o);
  const issue = json(runner, `repos/${repo}/issues/${o.number}`, 'GET', undefined, o.env);
  const comments = [];
  for (let page = 1; ; page++) {
    const raw = runner(['api', '--method', 'GET', `repos/${repo}/issues/${o.number}/comments`, '-f', 'per_page=100', '-f', `page=${page}`], { env: o.env });
    const items = raw && raw.trim() ? JSON.parse(raw) : [];
    comments.push(...items.map((c) => ({ author: { login: c.user?.login ?? '' }, body: c.body ?? '' })));
    if (items.length < 100) break;
  }
  return { ...normIssue(issue), comments };
}

export function labelList(o) {
  const { repo, runner } = base(o);
  const out = [];
  for (let page = 1; ; page++) {
    const raw = runner(['api', '--method', 'GET', `repos/${repo}/labels`, '-f', 'per_page=100', '-f', `page=${page}`], { env: o.env });
    const items = raw && raw.trim() ? JSON.parse(raw) : [];
    out.push(...items.map((l) => ({ name: l.name })));
    if (items.length < 100) break;
  }
  return out;
}

/** Explicit only: nothing else in this module calls it. An existing label is left as it is. */
export function labelCreate(o) {
  const { repo, runner } = base(o);
  try {
    json(runner, `repos/${repo}/labels`, 'POST', { name: o.name, color: o.color, description: o.description ?? '' }, o.env);
    return { created: true };
  } catch (e) {
    if (/already_exists/i.test(String(e?.stderr || e?.message))) return { created: false };
    throw e;
  }
}

export function prCreate(o) {
  const { repo, runner } = base(o);
  const r = json(runner, `repos/${repo}/pulls`, 'POST', { head: o.head, base: o.base ?? 'beta', title: o.title, body: o.body ?? '' }, o.env);
  return { number: r.number, url: r.html_url };
}

/* ---------------------------------- CLI ---------------------------------- */

export function parseCli(argv) {
  const multi = { '--label': 'labels', '--add-label': 'addLabels', '--remove-label': 'removeLabels' };
  const single = { '--repo': 'repo', '--input': 'input', '--title': 'title', '--number': 'number', '--state': 'state', '--reason': 'stateReason', '--limit': 'limit', '--head': 'head', '--base': 'base', '--name': 'name', '--color': 'color', '--description': 'description' };
  const [op, ...rest] = argv;
  const o = { op };
  for (let i = 0; i < rest.length; i++) {
    const k = rest[i];
    if (multi[k]) (o[multi[k]] ??= []).push(rest[++i]);
    else if (single[k]) o[single[k]] = rest[++i];
    else throw new Error(`gh-rest: unknown flag ${k}`);
  }
  if (o.number !== undefined) o.number = Number(o.number);
  if (o.limit !== undefined) o.limit = Number(o.limit);
  return o;
}

export function runCli(argv, { stdin = () => readFileSync(0, 'utf8'), runner, write = (s) => process.stdout.write(s) } = {}) {
  const { op, input, ...o } = parseCli(argv);
  const doc = input ? JSON.parse(input === '-' ? stdin() : readFileSync(input, 'utf8')) : {};
  const a = { ...o, runner };
  const ops = {
    'issue-create': () => issueCreate({ ...a, title: o.title ?? doc.title, body: doc.body, labels: o.labels ?? doc.labels }),
    'issue-comment': () => issueComment({ ...a, body: doc.body }),
    'issue-edit': () => issueEdit({ ...a, title: doc.title, body: doc.body }),
    'issue-list': () => issueList(a),
    'issue-view': () => issueView(a),
    'label-list': () => labelList(a),
    'label-create': () => labelCreate(a),
    'pr-create': () => prCreate({ ...a, title: o.title ?? doc.title, body: doc.body }),
  };
  if (!ops[op]) throw new Error(`gh-rest: unknown op "${op}". Ops: ${Object.keys(ops).join(', ')}`);
  write(`${JSON.stringify(ops[op](), null, 2)}\n`);
}

if (fileURLToPath(import.meta.url) === resolve(process.argv[1] ?? '')) {
  try { runCli(process.argv.slice(2)); } catch (e) { console.error(String(e?.stderr || e?.message || e)); process.exit(1); }
}
