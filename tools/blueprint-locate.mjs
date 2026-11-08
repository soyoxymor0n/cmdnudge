#!/usr/bin/env node
/**
 * blueprint-locate.mjs - find a blueprint checkout without assuming a sibling folder (blueprint#170, gap 6).
 *
 * A cloud session has ONE clone, so `../blueprint` is absent. Order of answers:
 *   1. $BLUEPRINT_DIR   2. ../blueprint (beside the repo)   3. $WORKSPACES_ROOT/blueprint
 *   4. a cached shallow clone of the beta branch (GitHub proxy allows cloning an attached repo), made on demand
 *      and only if the clone finishes within the timeout. $BLUEPRINT_NO_CLONE=1 turns step 4 off.
 * Otherwise it answers null with a reason, and callers print `needsLocalMessage` (what to do + a ready-to-paste
 * handoff-issue command) instead of silently skipping.
 *
 *   node tools/blueprint-locate.mjs [--no-clone] [--json]    prints the directory; exit 3 + reason on stderr when none
 *
 * The cache holds a tiny workspace: `<cache>/blueprint-ws/blueprint` (the clone) and, via `workspaceFor`, a symlink
 * `<cache>/blueprint-ws/<repo>` to the consumer, so blueprint tools that read "the repo beside blueprint"
 * (fleet-drift, fleet-sync, vendored-gate) work unchanged. fs / exec are injectable for tests.
 */
import { spawnSync } from 'node:child_process';
import * as nodeFs from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const BLUEPRINT_URL = 'https://github.com/soyoxymor0n/blueprint';
export const MARKER = path.join('tools', 'vendored-gate.mjs');
export const CACHE_MAX_AGE_MS = 12 * 60 * 60 * 1000;
export const CLONE_TIMEOUT_MS = 45_000;

export const defaultFs = {
  exists: (p) => nodeFs.existsSync(p),
  mkdir: (p) => nodeFs.mkdirSync(p, { recursive: true }),
  rename: (a, b) => nodeFs.renameSync(a, b),
  rm: (p) => nodeFs.rmSync(p, { recursive: true, force: true }),
  mtime: (p) => nodeFs.statSync(p).mtimeMs,
  touch: (p) => nodeFs.utimesSync(p, new Date(), new Date()),
  symlink: (target, p) => nodeFs.symlinkSync(target, p, 'dir'),
  realpath: (p) => nodeFs.realpathSync(p),
};

/** exec(cmd, args, { cwd, timeout }) -> { status, stdout, stderr, timedOut } */
export function defaultExec(cmd, args, { cwd, timeout } = {}) {
  const r = spawnSync(cmd, args, { cwd, timeout, encoding: 'utf8', windowsHide: true, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } });
  return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '', timedOut: r.error?.code === 'ETIMEDOUT' };
}

const valid = (fs, dir) => fs.exists(path.join(dir, MARKER));

/** Where the shallow clone lives for a repo: inside node_modules/.cache when the repo has node_modules, else the OS tmp. */
export function cacheRoot({ env, repoRoot, fs, tmp }) {
  if (env.BLUEPRINT_CACHE_DIR) return path.join(path.resolve(env.BLUEPRINT_CACHE_DIR), 'blueprint-ws');
  const nm = path.join(repoRoot, 'node_modules');
  return fs.exists(nm) ? path.join(nm, '.cache', 'blueprint-ws') : path.join(tmp, 'blueprint-ws');
}

/**
 * @returns {{ dir: string, source: string, cloned?: boolean } | { dir: null, reason: string }}
 */
export function locateBlueprint({
  env = process.env, repoRoot = process.cwd(), allowClone = true, fs = defaultFs, exec = defaultExec,
  tmp = tmpdir(), timeoutMs = CLONE_TIMEOUT_MS, maxAgeMs = CACHE_MAX_AGE_MS, now = Date.now(), url = env.BLUEPRINT_REPO_URL || BLUEPRINT_URL,
} = {}) {
  const tried = [];
  const candidates = [];
  if (env.BLUEPRINT_DIR) candidates.push(['$BLUEPRINT_DIR', path.resolve(env.BLUEPRINT_DIR)]);
  candidates.push(['../blueprint', path.resolve(repoRoot, '..', 'blueprint')]);
  if (env.WORKSPACES_ROOT) candidates.push(['$WORKSPACES_ROOT/blueprint', path.resolve(env.WORKSPACES_ROOT, 'blueprint')]);
  for (const [label, dir] of candidates) {
    if (valid(fs, dir)) return { dir, source: label };
    tried.push(`${label} (${dir}) has no ${MARKER.replace(/\\/g, '/')}`);
  }
  if (!allowClone || env.BLUEPRINT_NO_CLONE === '1') {
    return { dir: null, reason: `${tried.join('; ')}; cloning is off` };
  }
  const ws = cacheRoot({ env, repoRoot, fs, tmp });
  const dir = path.join(ws, 'blueprint');
  if (valid(fs, dir)) {
    let age = Infinity;
    try { age = now - fs.mtime(dir); } catch { /* unknown age: treat as stale */ }
    if (age > maxAgeMs) {
      const f = exec('git', ['fetch', '--depth', '1', '--quiet', 'origin', 'beta'], { cwd: dir, timeout: timeoutMs });
      if (f.status === 0) exec('git', ['reset', '--hard', '--quiet', 'FETCH_HEAD'], { cwd: dir, timeout: timeoutMs });
      try { fs.touch(dir); } catch { /* best effort */ }
    }
    return { dir, source: 'cached clone' };
  }
  const part = `${dir}.part-${process.pid}`;
  try {
    fs.mkdir(ws);
    fs.rm(part);
    const r = exec('git', ['clone', '--depth', '1', '--branch', 'beta', '--single-branch', '--quiet', url, part], { timeout: timeoutMs });
    if (r.status === 0 && valid(fs, part)) {
      fs.rm(dir);
      fs.rename(part, dir);
      return { dir, source: 'fresh shallow clone', cloned: true };
    }
    fs.rm(part);
    const why = r.timedOut ? `timed out after ${Math.round(timeoutMs / 1000)}s` : (String(r.stderr).trim().split('\n').pop() || `git exited ${r.status}`);
    return { dir: null, reason: `${tried.join('; ')}; shallow clone of ${url} failed: ${why}` };
  } catch (err) {
    try { fs.rm(part); } catch { /* ignore */ }
    return { dir: null, reason: `${tried.join('; ')}; shallow clone of ${url} failed: ${err.message}` };
  }
}

/**
 * Make "the repo beside blueprint" true for a cached clone: a symlink `<ws>/<repo>` -> the consumer. Only ever
 * writes inside our own cache workspace; a blueprint found elsewhere must already have the repo beside it.
 * @returns {{ ok: true } | { ok: false, reason: string }}
 */
export function workspaceFor({ blueprintDir, repoRoot, fs = defaultFs }) {
  const parent = path.dirname(blueprintDir);
  const name = path.basename(repoRoot);
  const link = path.join(parent, name);
  if (fs.exists(link)) {
    try {
      if (fs.realpath(link) === fs.realpath(repoRoot)) return { ok: true };
    } catch { /* fall through */ }
    return { ok: false, reason: `${link} exists but is not this checkout (${repoRoot})` };
  }
  if (path.basename(parent) !== 'blueprint-ws') {
    return { ok: false, reason: `${repoRoot} is not beside the blueprint at ${blueprintDir}; set BLUEPRINT_DIR to a checkout whose parent folder holds this repo` };
  }
  try {
    fs.symlink(repoRoot, link);
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: `could not link ${link}: ${err.message}` };
  }
}

/** The ready-to-paste command that files the handoff issue. Uses gh-rest.mjs when the tool is at hand, else the same REST call via gh. */
export function handoffCommand({ tool, reason, repo, ghRestPath = null }) {
  const title = `needs local: ${tool} (no blueprint reachable from this session)`;
  const body = `${tool} needs a blueprint checkout and none was reachable.\n\nReason: ${reason}\n\nRun it in a local session (or attach the blueprint repo to the cloud session), then close this issue.`;
  const json = JSON.stringify({ title, body, labels: ['todo'] });
  const target = repo || 'OWNER/REPO';
  const call = ghRestPath
    ? `node ${ghRestPath} issue-create --repo ${target} --input -`
    : `gh api -X POST repos/${target}/issues --input -`;
  return `${call} <<'EOF'\n${json}\nEOF`;
}

/** The message every blueprint-needing tool prints when `locateBlueprint` answers null. */
export function needsLocalMessage({ tool, reason, repo, ghRestPath }) {
  return [
    `${tool}: needs a local session or an attached blueprint repo.`,
    `  No blueprint checkout could be found: ${reason}`,
    '  Fix: run this in a local session (blueprint beside the repo), attach the blueprint repo to the cloud session,',
    '  or set BLUEPRINT_DIR to a checkout. To hand it to a local session, file the issue (paste as is):',
    '',
    handoffCommand({ tool, reason, repo, ghRestPath }),
  ].join('\n');
}

/** owner/repo from `git remote get-url origin` (https, ssh or a cloud proxy URL), else null. */
export function repoSlug(cwd = process.cwd(), exec = defaultExec) {
  const r = exec('git', ['remote', 'get-url', 'origin'], { cwd, timeout: 5000 });
  if (r.status !== 0) return null;
  const m = String(r.stdout).trim().replace(/\.git$/, '').match(/([^/:]+)\/([^/:]+)$/);
  return m ? `${m[1]}/${m[2]}` : null;
}

function main() {
  const argv = process.argv.slice(2);
  const here = path.dirname(fileURLToPath(import.meta.url));
  const top = (() => { const r = defaultExec('git', ['rev-parse', '--show-toplevel']); return r.status === 0 ? r.stdout.trim() : process.cwd(); })();
  const res = locateBlueprint({ repoRoot: top, allowClone: !argv.includes('--no-clone') });
  if (argv.includes('--json')) console.log(JSON.stringify(res));
  else if (res.dir) console.log(res.dir);
  if (!res.dir) {
    const ghRestPath = nodeFs.existsSync(path.join(here, 'gh-rest.mjs')) ? 'tools/gh-rest.mjs' : null;
    console.error(needsLocalMessage({ tool: 'blueprint-locate', reason: res.reason, repo: repoSlug(top), ghRestPath }));
    process.exit(3);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
