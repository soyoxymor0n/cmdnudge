#!/usr/bin/env node
/**
 * issue-status - move the GitHub issues a push mentions along their lifecycle.
 * Run by .github/workflows/issue-status.yml with the default GITHUB_TOKEN.
 *
 *   node tools/issue-status.mjs <beta|main> <base>..<head> [short-sha]
 *
 * beta: label on-beta, drop built, ONE comment "On beta in <sha>", close when the
 *       issue carries label `feature`.
 * main: label released + a comment, and close every still-open issue that is NOT a
 *       `feature` (a bug or chore has no beta stop, so production is where it is done;
 *       a feature was already closed at beta).
 * Missing lifecycle labels are created first (best effort), so a repo needs no setup.
 * Idempotent, and never fails the build: every gh call is best effort, exit 0.
 */
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

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
  ['built', '0e8a16', 'Implemented locally, not on beta yet'],
  ['on-beta', 'fbca04', 'Pushed to beta'],
  ['released', '1d76db', 'Promoted to main / production'],
  ['feature', '5319e7', 'A feature tracked as the source of truth'],
];

export function commentFor(branch, sha) {
  return branch === 'main' ? `Released to main in ${sha}` : `On beta in ${sha}`;
}

/** Decide the actions for one issue. Pure. */
export function planActions(branch, issue, sha) {
  const labels = (issue.labels ?? []).map((l) => (typeof l === 'string' ? l : l.name));
  const body = commentFor(branch, sha);
  const hasComment = (issue.comments ?? []).some((c) => (c.body ?? '').trim() === body && /github-actions/i.test(c.author?.login ?? ''));
  const add = branch === 'main' ? ['released'] : ['on-beta'];
  const remove = branch === 'main' ? [] : ['built'].filter((l) => labels.includes(l));
  return {
    addLabels: add.filter((l) => !labels.includes(l)),
    removeLabels: remove,
    comment: hasComment ? null : body,
    // beta closes features, main closes everything else; only ever an OPEN issue.
    close: String(issue.state).toUpperCase() === 'OPEN' && labels.includes('feature') === (branch === 'beta'),
  };
}

const gh = (args) => {
  try { return execFileSync('gh', args, { encoding: 'utf8' }); } catch (e) {
    console.error(`gh ${args.slice(0, 3).join(' ')} failed: ${String(e.message).split('\n')[0]}`);
    return null;
  }
};

/** Create whichever lifecycle labels the repo lacks. Never overwrites an existing one. */
function ensureLabels() {
  const raw = gh(['label', 'list', '--limit', '200', '--json', 'name']);
  if (!raw) return;
  let have; try { have = new Set(JSON.parse(raw).map((l) => l.name)); } catch { return; }
  for (const [name, color, description] of LABELS) {
    if (!have.has(name)) gh(['label', 'create', name, '--color', color, '--description', description]);
  }
}

function main() {
  const [branch, range, shaArg] = process.argv.slice(2);
  if (!['beta', 'main'].includes(branch) || !range) { console.error('Usage: issue-status.mjs <beta|main> <range> [sha]'); return; }
  let msgs;
  try { msgs = execFileSync('git', ['log', '--format=%B%x1e', range], { encoding: 'utf8' }).split('\x1e'); } catch { console.error('issue-status: cannot read range'); return; }
  const sha = shaArg || range.split('..').pop().slice(0, 7);
  const nums = [...new Set(msgs.flatMap(parseIssueRefs))];
  if (nums.length) ensureLabels();
  for (const n of nums) {
    const raw = gh(['issue', 'view', String(n), '--json', 'labels,state,comments']);
    if (!raw) continue;
    let issue; try { issue = JSON.parse(raw); } catch { continue; }
    const p = planActions(branch, issue, sha);
    for (const l of p.addLabels) gh(['issue', 'edit', String(n), '--add-label', l]);
    for (const l of p.removeLabels) gh(['issue', 'edit', String(n), '--remove-label', l]);
    if (p.comment) gh(['issue', 'comment', String(n), '--body', p.comment]);
    if (p.close) gh(['issue', 'close', String(n), '--reason', 'completed']);
    console.log(`issue-status: #${n} ${JSON.stringify(p)}`);
  }
}

if (fileURLToPath(import.meta.url) === resolve(process.argv[1] ?? '')) {
  try { main(); } catch (e) { console.error(e?.message ?? e); }
  process.exit(0);
}
