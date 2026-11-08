#!/usr/bin/env node
/**
 * cloud-push-guard.mjs - PreToolUse hook (Bash): in a Claude Code cloud session (CLAUDE_CODE_REMOTE set) a `git push`
 * may only go to the branch that is checked out, and never to main/master/production. Repo-level port of the local
 * push-guard intent: the owner's "never push unless asked" lives in their global CLAUDE.md, which a cloud session does
 * not load. Locally (CLAUDE_CODE_REMOTE unset) it does nothing; the local push-guard owns that. Node, cross-platform.
 *
 * Hook contract: JSON on stdin ({ tool_input: { command }, cwd }); exit 2 + stderr blocks, exit 0 allows.
 * Test seam: CLOUD_PUSH_GUARD_BRANCH overrides the current-branch lookup.
 */
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PROTECTED = new Set(['main', 'master', 'production', 'prod']);
const VALUE_FLAGS = new Set(['--repo', '-o', '--push-option', '--receive-pack', '--exec', '--signed']);

const branchName = (ref) => String(ref).replace(/^\+/, '').replace(/^refs\/heads\//, '');

function currentBranch(cwd) {
  if (process.env.CLOUD_PUSH_GUARD_BRANCH) return process.env.CLOUD_PUSH_GUARD_BRANCH;
  try {
    return execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch { return ''; }
}

/** Every `git push` in a shell command line, as its argument list (after `push`). */
export function pushCalls(command) {
  const calls = [];
  for (const seg of String(command).split(/&&|\|\||;|\||\n/)) {
    const m = seg.match(/(?:^|\s)git\s+((?:-[^\s]+(?:\s+(?!push\b)[^\s-][^\s]*)?\s+)*)push\b(.*)$/);
    if (m) calls.push(m[2].trim().split(/\s+/).filter(Boolean).map((t) => t.replace(/^["']|["']$/g, '')));
  }
  return calls;
}

/** Decide one command: { block, message }. */
export function decidePush(command, current) {
  for (const args of pushCalls(command)) {
    if (args.includes('--dry-run') || args.includes('-n')) continue;
    if (args.some((a) => a === '--all' || a === '--mirror' || a === '--prune')) {
      return { block: true, message: `git push ${args.join(' ')}: --all/--mirror/--prune would touch branches other than the session branch (${current}).` };
    }
    const pos = [];
    for (let i = 0; i < args.length; i++) {
      if (VALUE_FLAGS.has(args[i])) { i++; continue; }
      if (args[i].startsWith('-') && args[i] !== '-') { if (args[i] === '-d') pos.deleting = true; continue; }
      pos.push(args[i]);
    }
    const refspecs = pos.slice(1); // pos[0] is the remote
    if (refspecs.some((r) => r.startsWith(':'))) {
      return { block: true, message: 'git push with a delete refspec (:branch) is not allowed in a cloud session.' };
    }
    const dsts = refspecs.length
      ? refspecs.map((r) => (r.includes(':') ? r.split(':')[1] : r)).map((d) => (d === 'HEAD' ? current : d))
      : [current];
    if (args.includes('--delete') || pos.deleting) {
      return { block: true, message: `git push --delete is not allowed in a cloud session (session branch: ${current}).` };
    }
    for (const raw of dsts) {
      const dst = branchName(raw);
      if (!dst) return { block: true, message: 'git push with an empty target (a delete refspec) is not allowed in a cloud session.' };
      if (PROTECTED.has(dst)) return { block: true, message: `git push to ${dst} is not allowed in a cloud session: push the session branch only, the owner promotes.` };
      if (current && dst !== current) return { block: true, message: `git push to ${dst} is not allowed: a cloud session pushes only its own branch (${current}) unless the owner asked.` };
    }
    if (!refspecs.length && PROTECTED.has(current)) {
      return { block: true, message: `git push from ${current} is not allowed in a cloud session: work on the session branch.` };
    }
  }
  return { block: false, message: '' };
}

function main() {
  if (!process.env.CLAUDE_CODE_REMOTE) process.exit(0);
  let raw = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (c) => (raw += c));
  process.stdin.on('end', () => {
    let payload = {};
    try { payload = JSON.parse(raw); } catch { process.exit(0); }
    const command = payload?.tool_input?.command ?? '';
    if (!pushCalls(command).length) process.exit(0);
    const d = decidePush(command, currentBranch(payload?.cwd || process.cwd()));
    if (d.block) { process.stderr.write(`CLOUD PUSH GUARD: ${d.message}\n`); process.exit(2); }
    process.exit(0);
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
