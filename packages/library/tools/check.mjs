#!/usr/bin/env node
// Enforces the library rules from docs/setup/08. Exit 1 on any error.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { build, buildShare } from './generate.mjs';
import { loose, parse } from '../lib/chord.mjs';

/**
 * The shared package (#42) is a schema and a set of rules. Returns the errors for the manifest and
 * the actions file as read from disk: shape, integrity (sha256), chords that parse, unique ids,
 * the same actions as the library, and nothing stale against a fresh build.
 */
export function shareErrors(lib, manifestText, actionsText) {
  const errors = [];
  let m;
  try { m = JSON.parse(manifestText); } catch { return ['share/manifest.json is not JSON']; }
  const is = (v, t) => typeof v === t;
  if (m.schema !== 1) errors.push('manifest: schema must be 1');
  if (m.name !== 'cmdnudge-action-library') errors.push('manifest: name must be cmdnudge-action-library');
  if (!is(m.version, 'string') || !/^\d+\.\d+\.\d+$/.test(m.version)) errors.push(`manifest: version "${m.version}" is not MAJOR.MINOR.PATCH`);
  if (m.license !== 'MIT') errors.push('manifest: license must be MIT');
  if (m.actions !== 'actions.json') errors.push('manifest: actions must point at actions.json');
  let data;
  try { data = JSON.parse(actionsText); } catch { return [...errors, 'share/actions.json is not JSON']; }
  if (data.schema !== 1 || !Array.isArray(data.actions)) return [...errors, 'actions: schema 1 with an actions array'];
  if (m.actionCount !== data.actions.length) errors.push(`manifest: actionCount ${m.actionCount} but ${data.actions.length} actions`);
  if (m.sha256 !== createHash('sha256').update(actionsText).digest('hex')) errors.push('manifest: sha256 does not match actions.json');
  const ids = new Set();
  for (const a of data.actions) {
    if (!is(a.id, 'string') || !a.id) errors.push('action without an id');
    else if (ids.has(a.id)) errors.push(`action ${a.id} twice`);
    ids.add(a.id);
    if (!is(a.label, 'string') || !is(a.category, 'string') || !is(a.destructive, 'boolean') || !Array.isArray(a.mac)) errors.push(`${a.id}: label, category, destructive, mac are required`);
    for (const c of a.mac ?? []) { try { parse(c); } catch (e) { errors.push(`${a.id}: ${e.message}`); } }
  }
  const libIds = new Set(lib.actions.map((a) => a.id));
  for (const id of libIds) if (!ids.has(id)) errors.push(`action ${id} is in the library but not in the package`);
  for (const id of ids) if (!libIds.has(id)) errors.push(`action ${id} is in the package but not in the library`);
  const fresh = buildShare(lib);
  if (actionsText !== fresh.actionsText || manifestText !== JSON.stringify(fresh.manifest, null, 2) + '\n') errors.push('share is stale: run npm run library');
  return errors;
}

export function check(lib) {
  const errors = [];
  const families = new Set(lib.appFamilies.map((f) => f.id));
  const bundles = new Map();
  for (const f of lib.appFamilies) for (const b of f.mac) {
    if (bundles.has(b)) errors.push(`bundle ${b} in two families (${bundles.get(b)}, ${f.id})`);
    bundles.set(b, f.id);
  }
  const ids = new Set();
  for (const h of lib.habits) {
    if (ids.has(h.id)) errors.push(`duplicate habit id ${h.id}`);
    ids.add(h.id);
    if (!families.has(h.family)) errors.push(`${h.id}: unknown family ${h.family}`);
    if (!h.sourceURL || !h.verifiedOn) errors.push(`${h.id}: needs sourceURL + verifiedOn`);
    if (!h.mac.length) errors.push(`${h.id}: no Mac way`);
  }
  const arrivals = new Map();
  for (const r of lib.habitRules) {
    const k = `${r.family}|${r.layout}|${r.keyboard}|${r.arrives}`;
    if (arrivals.has(k)) errors.push(`rules ${arrivals.get(k)} and ${r.id} both fire on ${r.arrives} (${r.family}, ${r.layout}, ${r.keyboard})`);
    arrivals.set(k, r.id);
    if (r.guard && !lib.destructive.map(loose).includes(loose(r.arrives))) errors.push(`${r.id}: guard on a non-destructive chord`);
  }
  // Each layout-dependent habit must name known layouts.
  for (const h of lib.habits) for (const l of h.layouts) if (!lib.layouts.includes(l)) errors.push(`${h.id}: unknown layout ${l}`);
  const mustGuard = lib.habitRules.find((r) => r.habit === 'at-sign' && r.layout === 'de' && r.keyboard === 'apple');
  if (!mustGuard?.guard || mustGuard.arrives !== 'rcmd+q') errors.push('the right-⌘Q guard for German Apple keyboards is missing');
  // Every rule that lands on a destructive chord must be guarded: whatever the layout, keyboard or category (#39).
  for (const r of lib.habitRules) if (!r.guard && lib.destructive.map(loose).includes(loose(r.arrives))) errors.push(`${r.id}: lands on ${r.arrives} unguarded`);
  for (const l of lib.layouts) if (l !== 'other' && !lib.keycaps[l]) errors.push(`layout ${l}: no keycaps`);
  return errors;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const lib = build();
  const onDisk = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'library.json'), 'utf8'));
  const errors = check(lib);
  if (JSON.stringify(onDisk) !== JSON.stringify(lib)) errors.push('dist/library.json is stale: run npm run library');
  const share = join(dirname(fileURLToPath(import.meta.url)), '..', 'share');
  errors.push(...shareErrors(lib, readFileSync(join(share, 'manifest.json'), 'utf8'), readFileSync(join(share, 'actions.json'), 'utf8')));
  if (errors.length) { console.error(errors.map((e) => `✗ ${e}`).join('\n')); process.exit(1); }
  console.log(`library ok: ${lib.habits.length} habits, ${lib.habitRules.length} rules`);
}
