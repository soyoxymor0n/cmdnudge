#!/usr/bin/env node
/**
 * issue-status - move the GitHub issues a push mentions along their lifecycle.
 *
 * Runs LOCALLY (owner decision 2026-11-17: the workflow's push trigger billed ~1 Actions minute per
 * push, 28 % of the account). The marked block in .githooks/pre-push calls `--from-pre-push`; a manual
 * backfill is the workflow's workflow_dispatch (default GITHUB_TOKEN) or the CLI below.
 *
 *   node tools/issue-status.mjs --branch <alpha|beta|main> --range <base>..<head> [--repo owner/name] [--dry-run]
 *   node tools/issue-status.mjs <alpha|beta|main> <base>..<head> [short-sha]     (legacy positional form; the
 *                                                                                 third argument is ignored)
 *   node tools/issue-status.mjs --from-pre-push < <git's pre-push stdin lines>   (what the hook runs)
 *   node tools/issue-status.mjs --after-push --branch B --sha S --range R        (what --from-pre-push spawns)
 *
 * --from-pre-push never moves a label itself: git has no post-push hook and a label must not move for a
 * push that then fails. It spawns one DETACHED --after-push per pushed alpha/beta/main ref, which polls
 * `git ls-remote` until origin's branch contains the pushed sha (about 2 minutes at most), then moves the
 * labels. Every pusher (a session by hand, ship, the integrator, fleet-push) runs the hook, so one
 * chokepoint covers them all; a failure there only loses a label, never data, and the CLI re-runs it.
 * Only `#N` of THIS repo is ever touched (a `owner/other#5` ref does not match the parser).
 *
 * alpha (the trunk, blueprint#370): label on-alpha, drop built, close a `feature`.
 * beta:  label on-beta, drop built and on-alpha, close a `feature`. On a repo that has not moved to
 *        alpha yet, beta is still the trunk and this is exactly the old trunk behaviour.
 * main:  label released, and close every still-open issue that is NOT a
 *        `feature` (a bug or chore has no test stop, so production is where it is done;
 *        a feature was already closed when it landed).
 * NO comments: a comment emails the issue's author and watchers, and with an issue per
 * feature that was hundreds of emails. The labels and the open/closed state carry the
 * status, and GitHub's own timeline links the commits that cite the issue.
 * Missing lifecycle labels are created first (best effort), so a repo needs no setup.
 * Idempotent, and never fails the build: every gh call is best effort, exit 0.
 */
import { readFileSync, realpathSync } from 'node:fs';
import { execFileSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { issueView, issueEdit, labelList, labelCreate } from './gh-rest.mjs';

const KEYWORD = /\b(?:refs?|fix(?:es|ed)?|close[sd]?|resolve[sd]?)\b\s*:?\s*#(\d+)/gi;
const PAREN = /\(#(\d+)\)/g;

/** Issue numbers a commit message mentions via refs/fixes/closes/resolves or "(#N)". */
export function parseIssueRefs(message) {
  const found = new Set();
  for (const re of [KEYWORD, PAREN]) for (const m of String(message).matchAll(re)) found.add(Number(m[1]));
  return [...found].sort((a, b) => a - b);
}

/** The lifecycle labels; kept equal to tools/add-issue-discipline.mjs LABELS by a test. */
export const LABELS = [
  ['built', '0e8a16', 'Implemented locally, not on the trunk yet'],
  ['on-alpha', 'c5def5', 'On the trunk (alpha), not deployed yet'],
  ['on-beta', 'fbca04', 'In the closed test at beta'],
  ['released', '1d76db', 'Promoted to main / production'],
  ['feature', '5319e7', 'A feature tracked as the source of truth'],
];

/** Decide the actions for one issue. Pure. */
export function planActions(branch, issue) {
  const labels = (issue.labels ?? []).map((l) => (typeof l === 'string' ? l : l.name));
  const add = branch === 'main' ? ['released'] : branch === 'alpha' ? ['on-alpha'] : ['on-beta'];
  const drop = branch === 'main' ? [] : branch === 'alpha' ? ['built'] : ['built', 'on-alpha'];
  return {
    addLabels: add.filter((l) => !labels.includes(l)),
    removeLabels: drop.filter((l) => labels.includes(l)),
    // The trunk (or the test stage) closes features, main closes everything else; only ever an OPEN issue.
    close: String(issue.state).toUpperCase() === 'OPEN' && labels.includes('feature') === (branch !== 'main'),
  };
}

// Every call goes through gh-rest (REST), so it also works where the GitHub proxy rejects GraphQL.
// Best effort: a failed call is logged and yields null.
const gh = (label, fn) => {
  try { return fn(); } catch (e) {
    console.error(`gh-rest ${label} failed: ${String(e?.stderr || e?.message).split('\n')[0]}`);
    return null;
  }
};

/** Create whichever lifecycle labels the repo lacks. Never overwrites an existing one. */
function ensureLabels(repo) {
  const list = gh('label-list', () => labelList({ repo }));
  if (!list) return;
  const have = new Set(list.map((l) => l.name));
  for (const [name, color, description] of LABELS) {
    if (!have.has(name)) gh('label-create', () => labelCreate({ repo, name, color, description }));
  }
}

const ZERO = /^0+$/;
const BRANCHES = ['alpha', 'beta', 'main'];

/** The git range for one pushed ref. A new remote branch (or a remote sha we do not have) falls back to the tip commit. */
export function rangeFor(remoteSha, localSha, { hasCommit = () => true } = {}) {
  if (!remoteSha || ZERO.test(remoteSha) || !hasCommit(remoteSha)) return `${localSha}^..${localSha}`;
  return `${remoteSha}..${localSha}`;
}

/** Parse git's pre-push stdin (`<local ref> <local sha> <remote ref> <remote sha>` per line) into alpha/beta/main updates. Pure. */
export function refsFromPrePush(text, { hasCommit } = {}) {
  const out = [];
  for (const line of String(text).split('\n')) {
    const [, localSha, remoteRef, remoteSha] = line.trim().split(/\s+/);
    const m = /^refs\/heads\/(alpha|beta|main)$/.exec(remoteRef ?? '');
    if (!m || !localSha || ZERO.test(localSha)) continue; // tags, other branches, deletions
    out.push({ branch: m[1], sha: localSha, range: rangeFor(remoteSha, localSha, { hasCommit }) });
  }
  return out;
}

/** Flags and the legacy positional form. Pure. */
export function parseArgs(argv) {
  const o = { flags: new Set() };
  const pos = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (['--branch', '--range', '--repo', '--sha'].includes(a)) o[a.slice(2)] = argv[++i];
    else if (a.startsWith('--')) o.flags.add(a.slice(2));
    else pos.push(a);
  }
  if (!o.branch && pos[0]) { o.branch = pos[0]; o.range = o.range ?? pos[1]; }
  return o;
}

/** Real dependencies; tests inject fakes. */
const realDeps = (repo) => ({
  log: (range) => execFileSync('git', ['log', '--format=%B%x1e', range], { encoding: 'utf8', windowsHide: true }).split('\x1e'),
  ensureLabels: () => ensureLabels(repo),
  view: (number) => gh('issue-view', () => issueView({ number, repo })),
  edit: (o) => gh('issue-edit', () => issueEdit({ ...o, repo })),
});

/**
 * Move the labels for every issue the range cites. Returns [{ number, plan }]. Idempotent; best effort.
 * `dryRun` plans but writes nothing.
 */
export function applyStatus({ branch, range, repo, dryRun = false, deps = realDeps(repo) }) {
  if (!BRANCHES.includes(branch) || !range) throw new Error('usage: --branch <alpha|beta|main> --range <base>..<head>');
  const nums = [...new Set(deps.log(range).flatMap(parseIssueRefs))];
  if (nums.length && !dryRun) deps.ensureLabels();
  const done = [];
  for (const n of nums) {
    const issue = deps.view(n);
    if (!issue) continue;
    const p = planActions(branch, issue);
    if (!dryRun) {
      if (p.addLabels.length) deps.edit({ number: n, addLabels: p.addLabels });
      if (p.removeLabels.length) deps.edit({ number: n, removeLabels: p.removeLabels });
      if (p.close) deps.edit({ number: n, state: 'closed', stateReason: 'completed' });
    }
    done.push({ number: n, plan: p });
  }
  return done;
}

/** Poll until origin's <branch> is the pushed sha or descends from it. `lsRemote(branch)` -> sha | null. */
export async function waitForPush({ branch, sha, lsRemote, isAncestor = () => false, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), tries = 40, everyMs = 3000 }) {
  for (let i = 0; i < tries; i++) {
    const tip = lsRemote(branch);
    if (tip && (tip === sha || isAncestor(sha, tip))) return true;
    await sleep(everyMs);
  }
  return false;
}

const git = (...a) => execFileSync('git', a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true }).trim();
const hasCommit = (sha) => { try { git('cat-file', '-e', `${sha}^{commit}`); return true; } catch { return false; } };
const lsRemote = (branch) => { try { return git('ls-remote', 'origin', `refs/heads/${branch}`).split(/\s+/)[0] || null; } catch { return null; } };
const isAncestor = (a, b) => { try { git('merge-base', '--is-ancestor', a, b); return true; } catch { return false; } };

async function main() {
  const o = parseArgs(process.argv.slice(2));
  if (o.flags.has('from-pre-push')) {
    // The hook: spawn one detached waiter per pushed trunk ref and return at once (never delays or fails the push).
    let stdin = '';
    try { stdin = readFileSync(0, 'utf8'); } catch { return; }
    for (const r of refsFromPrePush(stdin, { hasCommit })) {
      const args = [fileURLToPath(import.meta.url), '--after-push', '--branch', r.branch, '--sha', r.sha, '--range', r.range, ...(o.repo ? ['--repo', o.repo] : [])];
      spawn(process.execPath, args, { detached: true, stdio: 'ignore', windowsHide: true }).unref();
    }
    return;
  }
  if (!BRANCHES.includes(o.branch) || !o.range) { console.error('Usage: issue-status.mjs --branch <alpha|beta|main> --range <base>..<head> [--repo o/r] [--dry-run]'); return; }
  if (o.flags.has('after-push') && !(await waitForPush({ branch: o.branch, sha: o.sha, lsRemote, isAncestor }))) { console.error('issue-status: push never reached origin; no labels moved'); return; }
  let done;
  try { done = applyStatus({ branch: o.branch, range: o.range, repo: o.repo, dryRun: o.flags.has('dry-run') }); } catch (e) { console.error(`issue-status: ${String(e?.message ?? e).split('\n')[0]}`); return; }
  for (const d of done) console.log(`issue-status: #${d.number} ${JSON.stringify(d.plan)}`);
}

// <is-main> (canonical: tools/is-main.mjs; every copy must match)
function isMain(metaUrl, argv1 = process.argv[1]) {
  if (!argv1) return false;
  try {
    return realpathSync(argv1) === realpathSync(fileURLToPath(metaUrl));
  } catch {
    return false;
  }
}
// </is-main>

if (isMain(import.meta.url)) {
  try { await main(); } catch (e) { console.error(e?.message ?? e); }
  process.exit(0);
}
