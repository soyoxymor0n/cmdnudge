// Hosted sync (#18) server: contract, validation, ownership and merge, on a real SQLite
// database (node:sqlite) behind the same libsql-shaped client Turso provides.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSyncHandler, sqlStore, knownFrom, validateUpload, FORMAT, LIMITS } from '../server/sync.mjs';

let DatabaseSync;
try {
  ({ DatabaseSync } = await import('node:sqlite'));
} catch {
  DatabaseSync = null;
}

const library = JSON.parse(readFileSync(new URL('../../../packages/library/dist/library.json', import.meta.url), 'utf8'));
const known = knownFrom(library);

/** node:sqlite wrapped in the libsql client shape: execute({sql,args}) and batch([...]). */
function sqliteClient() {
  const db = new DatabaseSync(':memory:');
  const run = ({ sql, args = [] }) => {
    const st = db.prepare(sql);
    return /^\s*select/i.test(sql) ? { rows: st.all(...args) } : (st.run(...args), { rows: [] });
  };
  return {
    db,
    async execute(q) {
      return run(q);
    },
    async batch(qs) {
      db.exec('BEGIN');
      try {
        qs.forEach(run);
        db.exec('COMMIT');
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    },
  };
}

const TOKENS = { 'tok-anna': 'user_anna', 'tok-ben': 'user_ben' };

async function setup() {
  const client = sqliteClient();
  const store = sqlStore(client);
  await store.init();
  const handle = createSyncHandler({ verify: async (t) => TOKENS[t] ?? null, store, known, today: () => '2026-11-07' });
  const call = (token, body, method = 'POST') =>
    handle(new Request('https://cmdnudge.test/api/sync', {
      method,
      headers: token ? { authorization: `Bearer ${token}`, 'content-type': 'application/json' } : {},
      body: method === 'POST' ? JSON.stringify(body) : undefined,
    }));
  return { client, call };
}

const row = (action_id, kind, count, app_family = 'system') => ({
  app_family, action_id, kind, count, first_seen_day: '2026-11-05', last_seen_day: '2026-11-06',
});
const file = (deviceId, counters) => ({ format: FORMAT, deviceId, platform: deviceId.slice(0, 3), writtenOn: '2026-11-07', counters });

test('validation keeps only library rows and drops the rest', () => {
  const v = validateUpload(
    file('mac-01', [
      row('edit.copy', 'habit_miss', 2),
      row('my secret password', 'habit_miss', 1),
      row('edit.copy', 'typed_text', 1),
      row('edit.undo', 'habit_miss', -1),
      row('edit.undo', 'habit_miss', 1.5),
      { ...row('edit.undo', 'mac_correct', 1), first_seen_day: '2026-11-05T10:22' },
      row('edit.copy', 'habit_miss', 2, 'not-a-family'),
      row('edit.copy', 'habit_miss', 9),
    ]),
    known,
  );
  assert.deepEqual(v.file.counters, [row('edit.copy', 'habit_miss', 2)]);
  assert.equal(v.dropped, 7);
  assert.match(validateUpload(file('mac-../x', []), known).error, /deviceId/);
  assert.match(validateUpload({ ...file('mac-01', []), platform: 'win' }, known).error, /platform/);
  assert.match(validateUpload({ ...file('mac-01', []), format: 'x/1' }, known).error, /format/);
});

test('a Mac and a Windows computer of one user see each other, never themselves', { skip: !DatabaseSync }, async () => {
  const { call } = await setup();
  let r = await call('tok-anna', file('mac-0a', [row('edit.copy', 'habit_miss', 3)]));
  assert.equal(r.status, 200);
  assert.deepEqual((await r.json()).devices, []);
  r = await call('tok-anna', file('win-0b', [row('edit.copy', 'win_use', 40)]));
  assert.deepEqual((await r.json()).devices, [{ deviceId: 'mac-0a', platform: 'mac', counters: [row('edit.copy', 'habit_miss', 3)] }]);
  // A re-upload replaces the device's rows; nothing is added twice.
  for (let i = 0; i < 3; i++) await call('tok-anna', file('win-0b', [row('edit.copy', 'win_use', 41)]));
  const body = await (await call('tok-anna', file('mac-0a', [row('edit.copy', 'habit_miss', 3)]))).json();
  assert.deepEqual(body.devices, [{ deviceId: 'win-0b', platform: 'win', counters: [row('edit.copy', 'win_use', 41)] }]);
});

test('NEGATIVE: another account cannot write to or read through a device id it does not own', { skip: !DatabaseSync }, async () => {
  const { call, client } = await setup();
  await call('tok-anna', file('mac-0a', [row('edit.copy', 'habit_miss', 3)]));
  await call('tok-anna', file('win-0b', [row('edit.copy', 'win_use', 40)]));
  // Ben sends Anna's device id: refused, and Anna's rows are untouched.
  const r = await call('tok-ben', file('mac-0a', [row('edit.copy', 'habit_miss', 999)]));
  assert.equal(r.status, 403);
  const rows = client.db.prepare("SELECT user_id, count FROM sync_counter WHERE device_id = 'mac-0a'").all();
  assert.deepEqual(rows.map((x) => [x.user_id, x.count]), [['user_anna', 3]]);
  // Ben's own device sees only Ben's devices (none), never Anna's.
  const own = await (await call('tok-ben', file('mac-0c', [row('edit.copy', 'habit_miss', 1)]))).json();
  assert.deepEqual(own.devices, []);
});

test('no token, a bad token, a wrong method or a bad body change nothing', { skip: !DatabaseSync }, async () => {
  const { call, client } = await setup();
  assert.equal((await call(null, file('mac-0a', [row('edit.copy', 'habit_miss', 3)]))).status, 401);
  assert.equal((await call('tok-eve', file('mac-0a', [row('edit.copy', 'habit_miss', 3)]))).status, 401);
  assert.equal((await call('tok-anna', null, 'GET')).status, 405);
  assert.equal((await call('tok-anna', { format: FORMAT })).status, 400);
  assert.equal(client.db.prepare('SELECT COUNT(*) AS n FROM sync_device').get().n, 0);
});

test('delete account removes every row of that user and only that user', { skip: !DatabaseSync }, async () => {
  const { call, client } = await setup();
  await call('tok-anna', file('mac-0a', [row('edit.copy', 'habit_miss', 3)]));
  await call('tok-ben', file('mac-0c', [row('edit.copy', 'habit_miss', 1)]));
  assert.equal((await call('tok-anna', null, 'DELETE')).status, 200);
  const users = client.db.prepare('SELECT DISTINCT user_id FROM sync_counter').all().map((x) => x.user_id);
  assert.deepEqual(users, ['user_ben']);
  assert.equal(client.db.prepare("SELECT COUNT(*) AS n FROM sync_device WHERE user_id = 'user_anna'").get().n, 0);
});

test('a user cannot register unlimited devices', { skip: !DatabaseSync }, async () => {
  const { call } = await setup();
  for (let i = 0; i < LIMITS.devicesPerUser; i++) {
    assert.equal((await call('tok-anna', file(`mac-${i.toString(16)}0`, []))).status, 200);
  }
  assert.equal((await call('tok-anna', file('mac-ff', []))).status, 429);
  // Known devices keep syncing.
  assert.equal((await call('tok-anna', file('mac-00', []))).status, 200);
});
