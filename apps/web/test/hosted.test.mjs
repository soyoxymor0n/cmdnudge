// Hosted sync (#18) wiring: Clerk token check, the Turso HTTP client, and the full path
// token -> handler -> Turso protocol -> SQLite, plus the endpoint refusing to run half-configured.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { generateKeyPairSync, createSign } from 'node:crypto';
import { clerkVerifier } from '../server/clerk-token.mjs';
import { tursoHttp } from '../server/turso-http.mjs';
import { createSyncHandler, sqlStore, knownFrom, FORMAT } from '../server/sync.mjs';

let DatabaseSync = null;
try {
  ({ DatabaseSync } = await import('node:sqlite'));
} catch {}

const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const pem = publicKey.export({ type: 'spki', format: 'pem' });
const other = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
const NOW = 1_800_000_000;
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
function jwt(claims, key = privateKey, alg = 'RS256') {
  const head = b64({ alg, typ: 'JWT' });
  const body = b64(claims);
  const s = createSign('RSA-SHA256');
  s.update(`${head}.${body}`);
  return `${head}.${body}.${s.sign(key).toString('base64url')}`;
}
const good = (sub = 'user_anna', extra = {}) => jwt({ sub, exp: NOW + 60, nbf: NOW - 10, azp: 'https://cmdnudge.com', ...extra });

test('Clerk tokens: valid ones give the user id, everything else gives null', async () => {
  const verify = clerkVerifier(pem, { now: () => NOW, authorizedParties: ['https://cmdnudge.com'] });
  assert.equal(await verify(good()), 'user_anna');
  // NEGATIVE: signed with another key, expired, not yet valid, wrong party, alg none, garbage.
  assert.equal(await verify(jwt({ sub: 'user_anna', exp: NOW + 60 }, other)), null);
  assert.equal(await verify(good('user_anna', { exp: NOW - 60 })), null);
  assert.equal(await verify(good('user_anna', { nbf: NOW + 600 })), null);
  assert.equal(await verify(good('user_anna', { azp: 'https://evil.example' })), null);
  const [, body] = good().split('.');
  assert.equal(await verify(`${b64({ alg: 'none' })}.${body}.`), null);
  // A valid signature on a token whose claims were swapped afterwards.
  const [h, , sig] = good().split('.');
  assert.equal(await verify(`${h}.${b64({ sub: 'user_ben', exp: NOW + 60 })}.${sig}`), null);
  assert.equal(await verify('not.a.token'), null);
  assert.equal(await verify(''), null);
});

/** A minimal Hrana-over-HTTP server (what Turso's /v2/pipeline speaks) on node:sqlite. */
function fakeTurso() {
  const db = new DatabaseSync(':memory:');
  const seen = [];
  const val = (v) => (v.type === 'integer' ? Number(v.value) : v.type === 'null' ? null : v.value);
  const enc = (x) => (x === null ? { type: 'null' } : typeof x === 'number' ? { type: 'integer', value: String(x) } : { type: 'text', value: String(x) });
  const run = (stmt) => {
    const st = db.prepare(stmt.sql);
    const args = (stmt.args ?? []).map(val);
    if (/^\s*select/i.test(stmt.sql)) {
      const rows = st.all(...args);
      const cols = st.columns().map((c) => ({ name: c.name }));
      return { cols, rows: rows.map((r) => cols.map((c) => enc(r[c.name]))), affected_row_count: 0 };
    }
    const r = st.run(...args);
    return { cols: [], rows: [], affected_row_count: Number(r.changes) };
  };
  async function fetchImpl(url, init) {
    seen.push({ url, auth: init.headers.authorization });
    const { requests } = JSON.parse(init.body);
    const results = requests.map((rq) => {
      if (rq.type === 'close') return { type: 'ok', response: { type: 'close' } };
      if (rq.type === 'execute') {
        try {
          return { type: 'ok', response: { type: 'execute', result: run(rq.stmt) } };
        } catch (e) {
          return { type: 'error', error: { message: e.message } };
        }
      }
      const ok = [];
      const step_results = [];
      const step_errors = [];
      const holds = (c) => !c || (c.type === 'ok' ? ok[c.step] === true : c.type === 'not' ? !holds(c.cond) : false);
      for (const s of rq.batch.steps) {
        if (!holds(s.condition)) {
          step_results.push(null), step_errors.push(null), ok.push(false);
          continue;
        }
        try {
          step_results.push(run(s.stmt)), step_errors.push(null), ok.push(true);
        } catch (e) {
          step_results.push(null), step_errors.push({ message: e.message }), ok.push(false);
        }
      }
      return { type: 'ok', response: { type: 'batch', result: { step_results, step_errors } } };
    });
    return new Response(JSON.stringify({ baton: null, base_url: null, results }), { status: 200 });
  }
  return { db, seen, fetchImpl };
}

test('Turso client: a failing statement rolls the whole batch back', { skip: !DatabaseSync }, async () => {
  const t = fakeTurso();
  const c = tursoHttp('libsql://cmdnudge-x.turso.io', 'secret', t.fetchImpl);
  await c.execute({ sql: 'CREATE TABLE t (k TEXT PRIMARY KEY, n INTEGER)' });
  await c.batch([{ sql: 'INSERT INTO t VALUES (?, ?)', args: ['a', 1] }]);
  await assert.rejects(c.batch([
    { sql: 'INSERT INTO t VALUES (?, ?)', args: ['b', 2] },
    { sql: 'INSERT INTO t VALUES (?, ?)', args: ['a', 3] }, // duplicate key
  ]));
  assert.deepEqual((await c.execute({ sql: 'SELECT k, n FROM t ORDER BY k' })).rows, [{ k: 'a', n: 1 }]);
  assert.equal(t.seen[0].url, 'https://cmdnudge-x.turso.io/v2/pipeline');
  assert.equal(t.seen[0].auth, 'Bearer secret');
});

test('end to end: token -> handler -> Turso protocol, accounts kept apart', { skip: !DatabaseSync }, async () => {
  const t = fakeTurso();
  const store = sqlStore(tursoHttp('https://db.example', 'tok', t.fetchImpl));
  await store.init();
  const library = JSON.parse(readFileSync(new URL('../../../packages/library/dist/library.json', import.meta.url), 'utf8'));
  const handle = createSyncHandler({ verify: clerkVerifier(pem, { now: () => NOW }), store, known: knownFrom(library), today: () => '2026-11-07' });
  const row = (kind, count) => ({ app_family: 'system', action_id: 'edit.copy', kind, count, first_seen_day: '2026-11-05', last_seen_day: '2026-11-07' });
  const send = (token, deviceId, counters) => handle(new Request('https://x/api/sync', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify({ format: FORMAT, deviceId, platform: deviceId.slice(0, 3), writtenOn: '2026-11-07', counters }),
  }));
  assert.equal((await send(good(), 'win-0b', [row('win_use', 40)])).status, 200);
  const answer = await (await send(good(), 'mac-0a', [row('habit_miss', 3)])).json();
  assert.deepEqual(answer.devices, [{ deviceId: 'win-0b', platform: 'win', counters: [row('win_use', 40)] }]);
  // NEGATIVE: Ben with a valid token of his own cannot take over Anna's Windows computer.
  assert.equal((await send(good('user_ben'), 'win-0b', [row('win_use', 1)])).status, 403);
  // A forged token never reaches the database.
  assert.equal((await send(jwt({ sub: 'user_anna', exp: NOW + 60 }, other), 'win-0b', [])).status, 401);
  assert.deepEqual(t.db.prepare("SELECT user_id, count FROM sync_counter WHERE device_id='win-0b'").all().map((r) => [r.user_id, r.count]), [['user_anna', 40]]);
});

test('the endpoint answers 503 until the database and Clerk key are configured', async () => {
  for (const k of ['TURSO_DATABASE_URL', 'TURSO_AUTH_TOKEN', 'CLERK_JWT_KEY']) delete process.env[k];
  const api = await import('../api/sync.mjs');
  const r = await api.POST(new Request('https://x/api/sync', { method: 'POST', body: '{}' }));
  assert.equal(r.status, 503);
  assert.equal(typeof api.DELETE, 'function');
});
