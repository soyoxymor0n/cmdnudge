#!/usr/bin/env node
/**
 * check-commit-issue-refs - a feat:/fix: commit needs a #<number> in its
 * subject or body. Merge and revert commits are exempt.
 *
 *   node tools/check-commit-issue-refs.mjs <base>..<head>   a commit range (CI, PR)
 *   node tools/check-commit-issue-refs.mjs --pre-push       read git's pre-push stdin lines
 *                                                           "<local_ref> <local_sha> <remote_ref> <remote_sha>"
 *
 * In --pre-push mode only refs/heads/beta and refs/heads/main are checked. A new
 * branch (all-zero remote sha) checks only the commits that are on no remote yet.
 * Checks FORMAT only, never that the issue exists (that needs the network).
 */
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// A scope - `feat(discover):` - and a breaking `!` are still a feat/fix. The
// first version of this rule only matched the bare `feat:` and so waved through
// every scoped commit.
const FEAT_FIX = /^(feat|fix)(\([^)]*\))?!?:/i;
const ISSUE_REF = /#[0-9]+/;
const MERGE_SUBJECT = /^Merge\s/;
const REVERT_SUBJECT = /^Revert\s"/;
const ZERO = /^0+$/;
export const CHECKED_REFS = ['refs/heads/beta', 'refs/heads/main'];

/** @returns commits that break the rule */
export function findViolations(commits) {
  return commits.filter(({ subject, body }) => {
    if (MERGE_SUBJECT.test(subject) || REVERT_SUBJECT.test(subject)) return false;
    if (!FEAT_FIX.test(subject)) return false;
    return !ISSUE_REF.test(subject) && !ISSUE_REF.test(body || '');
  });
}

/**
 * Parse pre-push stdin into git-log argument lists, one per checked ref.
 * Deletions and unchecked refs are skipped. New branch => `<sha> --not --remotes`.
 */
export function rangesFromPushLines(text, refs = CHECKED_REFS) {
  const out = [];
  for (const line of String(text).split(/\r?\n/)) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 4) continue;
    const [, localSha, remoteRef, remoteSha] = parts;
    if (!refs.includes(remoteRef) || ZERO.test(localSha)) continue;
    if (ZERO.test(remoteSha)) out.push({ ref: remoteRef, args: [localSha, '--not', '--remotes'] });
    else out.push({ ref: remoteRef, args: [`${remoteSha}..${localSha}`], fallback: [localSha, '--not', '--remotes'] });
  }
  return out;
}

function log(args) {
  const out = execFileSync('git', ['log', '--format=%H%x1f%s%x1f%b%x1e', ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  return out.split('\x1e').map((r) => r.trim()).filter(Boolean).map((r) => {
    const [sha, subject, body] = r.split('\x1f');
    return { sha, subject: subject || '', body: body || '' };
  });
}

function report(commits) {
  const bad = findViolations(commits);
  if (!bad.length) {
    console.log(`check-commit-issue-refs: ${commits.length} commit(s) checked, all clear.`);
    return 0;
  }
  console.error(`check-commit-issue-refs: ${bad.length} commit(s) missing an issue reference:\n`);
  for (const { sha, subject } of bad) console.error(`  ${sha.slice(0, 7)}  ${subject}`);
  console.error('\nA feat:/fix: commit needs a "#<number>" for the GitHub issue it closes or advances.' +
    '\nFile one (gh issue create), then reword: git rebase -i / git commit --amend.');
  return 1;
}

async function readStdin() {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  return Buffer.concat(chunks).toString('utf8');
}

async function main() {
  const [arg] = process.argv.slice(2);
  if (!arg) {
    console.error('Usage: node tools/check-commit-issue-refs.mjs <base>..<head> | --pre-push');
    process.exit(2);
  }
  if (arg === '--pre-push') {
    const commits = [];
    for (const r of rangesFromPushLines(await readStdin())) {
      try { commits.push(...log(r.args)); } catch { if (r.fallback) commits.push(...log(r.fallback)); }
    }
    process.exit(report(commits));
  }
  process.exit(report(log([arg])));
}

if (fileURLToPath(import.meta.url) === resolve(process.argv[1] ?? '')) await main();
