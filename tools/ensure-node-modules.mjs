#!/usr/bin/env node
// SessionStart guard (gap 8, blueprint#171): a cloud clone has no node_modules, so lint and test:affected fail
// until something installs. In a cloud session (CLAUDE_CODE_REMOTE set) with no node_modules and a package-lock.json,
// run `npm ci --prefer-offline --no-audit --no-fund`. Locally it does nothing. It never fails the session: every
// outcome exits 0, and the install is bounded by a timeout so a slow network cannot hang the start.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const NPM_ARGS = ['ci', '--prefer-offline', '--no-audit', '--no-fund'];
export const DEFAULT_TIMEOUT_MS = 240_000;

/**
 * Returns { action: 'skip'|'installed'|'failed', reason }. All effects are injectable for tests.
 * `spawn` has the spawnSync signature and result shape.
 */
export function ensureNodeModules({
  cwd = process.env.CLAUDE_PROJECT_DIR || process.cwd(),
  env = process.env,
  exists = existsSync,
  spawn = spawnSync,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  if (!env.CLAUDE_CODE_REMOTE) return { action: 'skip', reason: 'not a cloud session' };
  if (exists(path.join(cwd, 'node_modules'))) return { action: 'skip', reason: 'node_modules present' };
  if (!exists(path.join(cwd, 'package-lock.json'))) return { action: 'skip', reason: 'no package-lock.json' };
  try {
    const r = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', NPM_ARGS, {
      cwd, encoding: 'utf8', timeout: timeoutMs, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    });
    if (r.error) return { action: 'failed', reason: r.error.code === 'ETIMEDOUT' ? `timed out after ${timeoutMs} ms` : String(r.error.message ?? r.error) };
    if (r.status !== 0) return { action: 'failed', reason: `npm ci exited ${r.status}` };
    return { action: 'installed', reason: 'npm ci done' };
  } catch (e) {
    return { action: 'failed', reason: String(e?.message ?? e) };
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const r = ensureNodeModules();
  if (r.action !== 'skip') console.log(`ensure-node-modules: ${r.action} (${r.reason})`);
  process.exit(0);
}
