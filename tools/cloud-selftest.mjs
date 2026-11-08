#!/usr/bin/env node
/**
 * cloud-selftest.mjs - measures what THIS session can do, as a pass/fail table. First step of any cloud routine.
 *
 *   node tools/cloud-selftest.mjs             # table; exit 1 if any row fails
 *   node tools/cloud-selftest.mjs --json      # rows as JSON
 *   node tools/cloud-selftest.mjs --report    # on failures, create/update ONE open issue "cloud-gap: selftest failures"
 *                                             # (REST only, label `todo`, never creates labels). Without it nothing is written.
 *
 * Rows: gh api user, git remote + push --dry-run, node_modules, core.hooksPath, every cloud-env HOSTS entry over HTTPS,
 * each `ops` variable BY NAME ONLY (values are never read into output), Chromium (cloud only), label read probe.
 * Cloud = CLAUDE_CODE_REMOTE is set. Source of truth for cloud gaps; replaces the hand-edited gap table.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

let TIERS = { ops: [] };
let HOSTS = [];
try { ({ TIERS, HOSTS } = await import('./cloud-env.mjs')); } catch { /* copied into an app without cloud-env: those rows skip */ }

const row = (check, status, detail = '') => ({ check, status, detail: String(detail).split('\n')[0].slice(0, 160) });

export function defaultRun(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', timeout: opts.timeout ?? 20000, windowsHide: true, input: opts.input });
  return { code: r.status ?? 1, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

export function checkGhUser(run) {
  const r = run('gh', ['api', 'user', '--jq', '.login']);
  return r.code === 0 ? row('gh api user', 'pass', `as ${r.stdout.trim()}`) : row('gh api user', 'fail', r.stderr || 'gh failed');
}

export function checkGitRemote(run) {
  const remote = run('git', ['ls-remote', '--heads', 'origin', 'HEAD']);
  if (remote.code !== 0) return [row('git remote reachable', 'fail', remote.stderr || 'ls-remote failed'), row('git push --dry-run', 'skip', 'remote unreachable')];
  const br = run('git', ['rev-parse', '--abbrev-ref', 'HEAD']).stdout.trim();
  if (!br || br === 'HEAD') return [row('git remote reachable', 'pass'), row('git push --dry-run', 'skip', 'detached HEAD')];
  const push = run('git', ['push', '--dry-run', 'origin', 'HEAD']);
  return [row('git remote reachable', 'pass'), push.code === 0 ? row('git push --dry-run', 'pass', br) : row('git push --dry-run', 'fail', `${br}: ${push.stderr}`)];
}

export function checkNodeModules(exists = existsSync) {
  return exists('node_modules') ? row('node_modules', 'pass') : row('node_modules', 'fail', 'missing: run npm install');
}

export function checkHooksPath(run, exists = existsSync) {
  if (!exists('.githooks')) return row('core.hooksPath', 'skip', 'no .githooks/');
  const v = run('git', ['config', 'core.hooksPath']).stdout.trim();
  return v === '.githooks' ? row('core.hooksPath', 'pass', v) : row('core.hooksPath', 'fail', `is "${v}", want ".githooks"`);
}

// A wildcard (*.turso.io) has no host of its own: many apexes do not resolve. Probe a concrete
// host taken from an env var whose value is a URL under that suffix; none set -> skip.
export function concreteHost(host, env = {}) {
  if (!host.startsWith('*.')) return { target: host };
  const suffix = host.slice(1); // ".turso.io"
  for (const [k, v] of Object.entries(env)) {
    const m = typeof v === 'string' && v.match(/^[a-z]+:\/\/([^/:?#]+)/i);
    if (m && m[1].toLowerCase().endsWith(suffix)) return { target: m[1], via: k };
  }
  return { target: null };
}

export async function checkHost(host, fetchImpl = fetch, env = {}) {
  const name = `host ${host}`;
  const { target, via } = concreteHost(host, env);
  if (!target) return row(name, 'skip', 'wildcard, no env URL under it to probe');
  const url = `https://${target}/`;
  try {
    const r = await fetchImpl(url, { method: 'HEAD', redirect: 'manual', signal: AbortSignal.timeout(5000) });
    const deny = r.headers?.get?.('x-deny-reason');
    if (deny) return row(name, 'fail', `proxy denied: ${deny}`);
    return row(name, 'pass', via ? `HTTP ${r.status} (via ${via})` : `HTTP ${r.status}`);
  } catch (e) {
    return row(name, 'fail', e?.cause?.code ?? e?.name ?? 'network error');
  }
}

export function checkOpsVars(names, has) {
  if (!names.length) return [row('ops variables', 'skip', 'no ops tier known here')];
  return names.map((n) => (has(n) ? row(`env ${n}`, 'pass', 'present') : row(`env ${n}`, 'fail', 'missing')));
}

export function checkChromium({ cloud, env = process.env, exists = existsSync }) {
  if (!cloud) return row('chromium', 'skip', 'local session');
  const p = env.PLAYWRIGHT_CHROMIUM;
  if (p && exists(p)) return row('chromium', 'pass', 'PLAYWRIGHT_CHROMIUM');
  return exists('/opt/pw-browsers') ? row('chromium', 'pass', '/opt/pw-browsers') : row('chromium', 'fail', 'no /opt/pw-browsers, PLAYWRIGHT_CHROMIUM unset');
}

export function repoSlug(run) {
  const m = run('git', ['remote', 'get-url', 'origin']).stdout.trim().match(/github\.com[:/]([^/]+\/[^/.]+?)(?:\.git)?$/);
  return m ? m[1] : null;
}

export function checkLabelsProbe(run) {
  const slug = repoSlug(run);
  if (!slug) return row('REST labels (read probe)', 'skip', 'no github origin');
  const r = run('gh', ['api', `repos/${slug}/labels?per_page=1`, '--jq', 'length']);
  return r.code === 0 ? row('REST labels (read probe)', 'pass') : row('REST labels (read probe)', 'fail', r.stderr || 'failed');
}

export async function runChecks({ run = defaultRun, env = process.env, exists = existsSync, fetchImpl = fetch, hasVar, hosts = HOSTS, ops = TIERS.ops } = {}) {
  const cloud = Boolean(env.CLAUDE_CODE_REMOTE);
  const has = hasVar ?? ((n) => Boolean(env[n]));
  const rows = [checkGhUser(run), ...checkGitRemote(run), checkNodeModules(exists), checkHooksPath(run, exists), checkLabelsProbe(run)];
  rows.push(...(await Promise.all(hosts.map((h) => checkHost(h, fetchImpl, env)))));
  rows.push(...checkOpsVars(ops, has), checkChromium({ cloud, env, exists }));
  return { cloud, rows };
}

export function renderTable(rows) {
  const w = Math.max(5, ...rows.map((r) => r.check.length));
  return rows.map((r) => `${r.status.toUpperCase().padEnd(4)}  ${r.check.padEnd(w)}  ${r.detail}`.trimEnd()).join('\n');
}
export const exitCode = (rows) => (rows.some((r) => r.status === 'fail') ? 1 : 0);

export const ISSUE_TITLE = 'cloud-gap: selftest failures';

/** Create or comment on ONE open issue, REST only. `run` is the injected runner (defaultRun in production). */
export function reportFailures(rows, run = defaultRun) {
  const failed = rows.filter((r) => r.status === 'fail');
  if (!failed.length) return { action: 'none' };
  const slug = repoSlug(run);
  if (!slug) return { action: 'skipped', reason: 'no github origin' };
  const body = `Cloud selftest, ${new Date().toISOString().slice(0, 10)}:\n\n${failed.map((r) => `- ${r.check}: ${r.detail}`).join('\n')}\n\nRe-run: \`node tools/cloud-selftest.mjs\`.`;
  const list = run('gh', ['api', `repos/${slug}/issues?state=open&labels=todo&per_page=100`, '--jq', `[.[] | select(.title == "${ISSUE_TITLE}" and (has("pull_request") | not))][0].number // empty`]);
  const existing = list.stdout.trim();
  if (existing) {
    run('gh', ['api', '-X', 'POST', `repos/${slug}/issues/${existing}/comments`, '-f', `body=${body}`]);
    return { action: 'commented', issue: Number(existing) };
  }
  run('gh', ['api', '-X', 'POST', `repos/${slug}/issues`, '-f', `title=${ISSUE_TITLE}`, '-f', `body=${body}`, '-f', 'labels[]=todo']);
  return { action: 'created' };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  let readSecret = null;
  try { ({ readSecret } = await import('./github-app-token.mjs')); } catch { /* env only */ }
  const cloud = Boolean(process.env.CLAUDE_CODE_REMOTE);
  const { rows } = await runChecks({ hasVar: (n) => Boolean(process.env[n]) || (!cloud && readSecret ? Boolean(readSecret(n)) : false) });
  let report = null;
  if (args.includes('--report')) report = reportFailures(rows);
  if (args.includes('--json')) console.log(JSON.stringify({ cloud, rows, report }, null, 2));
  else {
    console.log(`cloud-selftest (${cloud ? 'cloud' : 'local'})\n${renderTable(rows)}`);
    if (report && report.action !== 'none') console.log(`report: ${report.action}${report.issue ? ` #${report.issue}` : ''}`);
  }
  process.exit(exitCode(rows));
}
