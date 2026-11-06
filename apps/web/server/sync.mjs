// Hosted sync (#18), server side, without the cloud parts: the request contract, validation,
// per-user device ownership and the merge, behind two seams that the deployment fills in:
//   verify(token)  -> userId | null    (Clerk session token, D4; not wired yet)
//   client         -> { execute({sql,args}), batch([{sql,args}]) }   (libsql/Turso shape)
//
// Model (decision D3, same as file sync): each device uploads only its own counter rows and
// gets back the rows of the user's OTHER devices. Totals are the sum across devices, so a
// repeated or out-of-order sync can never double-count.
//
// authorization-discipline: the user id comes from the token, never from the body. A device id
// belongs to the first user who uploads it; another user sending the same id gets 403 and
// changes nothing. Every query is scoped by the token's user.
//
// Privacy (invariant 5): rows are checked against the shortcut library; free text, unknown
// actions, unknown kinds, finer-than-day dates and absurd counts never reach the database.

export const FORMAT = 'cmdnudge-counters/1';
export const KINDS = ['habit_miss', 'mac_correct', 'menu_by_mouse', 'win_use'];
export const LIMITS = { bodyBytes: 2 * 1024 * 1024, rows: 20_000, devicesPerUser: 16, maxCount: 100_000_000 };

const DEVICE_ID = /^(mac|win)-[0-9a-f]{1,32}$/;

export function validDay(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** Sets of the library's action ids and app family ids. */
export function knownFrom(library) {
  return { actions: new Set(library.actions.map((a) => a.id)), families: new Set(library.appFamilies.map((f) => f.id)) };
}

/**
 * Checks one device's upload. Returns { file, dropped } with only valid, deduplicated rows,
 * or { error } when the file as a whole cannot be used.
 */
export function validateUpload(body, known) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'body must be a JSON object' };
  if (body.format !== FORMAT) return { error: `format must be ${FORMAT}` };
  const { deviceId, platform, writtenOn, counters } = body;
  if (typeof deviceId !== 'string' || !DEVICE_ID.test(deviceId)) return { error: 'bad deviceId' };
  if (!['mac', 'win'].includes(platform) || !deviceId.startsWith(`${platform}-`)) return { error: 'platform does not match deviceId' };
  if (!validDay(writtenOn)) return { error: 'bad writtenOn' };
  if (!Array.isArray(counters)) return { error: 'counters must be an array' };
  if (counters.length > LIMITS.rows) return { error: 'too many rows' };
  const seen = new Set();
  const rows = [];
  for (const r of counters) {
    const ok =
      r && typeof r === 'object' &&
      known.families.has(r.app_family) &&
      known.actions.has(r.action_id) &&
      KINDS.includes(r.kind) &&
      Number.isInteger(r.count) && r.count >= 0 && r.count <= LIMITS.maxCount &&
      validDay(r.first_seen_day) && validDay(r.last_seen_day) && r.first_seen_day <= r.last_seen_day;
    if (!ok) continue;
    const key = `${r.app_family}\u0000${r.action_id}\u0000${r.kind}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({
      app_family: r.app_family, action_id: r.action_id, kind: r.kind, count: r.count,
      first_seen_day: r.first_seen_day, last_seen_day: r.last_seen_day,
    });
  }
  return { file: { format: FORMAT, deviceId, platform, writtenOn, counters: rows }, dropped: counters.length - rows.length };
}

export const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS sync_device (
     device_id TEXT PRIMARY KEY,
     user_id   TEXT NOT NULL,
     platform  TEXT NOT NULL,
     last_day  TEXT NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS sync_device_user ON sync_device(user_id)`,
  `CREATE TABLE IF NOT EXISTS sync_counter (
     user_id TEXT NOT NULL, device_id TEXT NOT NULL, platform TEXT NOT NULL,
     app_family TEXT NOT NULL, action_id TEXT NOT NULL, kind TEXT NOT NULL,
     count INTEGER NOT NULL, first_seen_day TEXT NOT NULL, last_seen_day TEXT NOT NULL,
     PRIMARY KEY (device_id, app_family, action_id, kind)
   )`,
  `CREATE INDEX IF NOT EXISTS sync_counter_user ON sync_counter(user_id)`,
  // Device links (#18): the long-lived token a signed-in app holds. Only its SHA-256 is stored.
  `CREATE TABLE IF NOT EXISTS sync_link (
     token_hash  TEXT PRIMARY KEY,
     user_id     TEXT NOT NULL,
     created_day TEXT NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS sync_link_user ON sync_link(user_id)`,
];

/** Storage on a libsql-shaped client (Turso in production, node:sqlite in tests). */
export function sqlStore(client) {
  return {
    async init() {
      await client.batch(SCHEMA.map((sql) => ({ sql, args: [] })));
    },
    /** Claims the device for the user if nobody has it yet. Returns the owner after the call. */
    async claim(userId, deviceId, platform, day) {
      await client.execute({
        sql: `INSERT INTO sync_device (device_id, user_id, platform, last_day) VALUES (?, ?, ?, ?)
              ON CONFLICT (device_id) DO NOTHING`,
        args: [deviceId, userId, platform, day],
      });
      const r = await client.execute({ sql: 'SELECT user_id FROM sync_device WHERE device_id = ?', args: [deviceId] });
      return r.rows[0]?.user_id ?? null;
    },
    async ownerOf(deviceId) {
      const r = await client.execute({ sql: 'SELECT user_id FROM sync_device WHERE device_id = ?', args: [deviceId] });
      return r.rows[0]?.user_id ?? null;
    },
    async deviceCount(userId) {
      const r = await client.execute({ sql: 'SELECT COUNT(*) AS n FROM sync_device WHERE user_id = ?', args: [userId] });
      return Number(r.rows[0]?.n ?? 0);
    },
    /** Replaces all rows of one device of this user, in one transaction. */
    async replaceDevice(userId, deviceId, platform, rows, day) {
      await client.batch([
        { sql: 'DELETE FROM sync_counter WHERE user_id = ? AND device_id = ?', args: [userId, deviceId] },
        ...rows.map((r) => ({
          sql: `INSERT INTO sync_counter VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [userId, deviceId, platform, r.app_family, r.action_id, r.kind, r.count, r.first_seen_day, r.last_seen_day],
        })),
        { sql: 'UPDATE sync_device SET last_day = ? WHERE user_id = ? AND device_id = ?', args: [day, userId, deviceId] },
      ]);
    },
    /** All rows of the user's devices except `exceptDevice`. */
    async otherRows(userId, exceptDevice) {
      const r = await client.execute({
        sql: `SELECT device_id, platform, app_family, action_id, kind, count, first_seen_day, last_seen_day
              FROM sync_counter WHERE user_id = ? AND device_id <> ? ORDER BY device_id`,
        args: [userId, exceptDevice],
      });
      return r.rows;
    },
    /** Delete account = every row of the user, links included, one call. */
    async deleteUser(userId) {
      await client.batch([
        { sql: 'DELETE FROM sync_counter WHERE user_id = ?', args: [userId] },
        { sql: 'DELETE FROM sync_device WHERE user_id = ?', args: [userId] },
        { sql: 'DELETE FROM sync_link WHERE user_id = ?', args: [userId] },
      ]);
    },
    async addLink(hash, userId, day) {
      await client.execute({ sql: 'INSERT INTO sync_link (token_hash, user_id, created_day) VALUES (?, ?, ?)', args: [hash, userId, day] });
    },
    async userOfLink(hash) {
      const r = await client.execute({ sql: 'SELECT user_id FROM sync_link WHERE token_hash = ?', args: [hash] });
      return r.rows[0]?.user_id ?? null;
    },
    async linkCount(userId) {
      const r = await client.execute({ sql: 'SELECT COUNT(*) AS n FROM sync_link WHERE user_id = ?', args: [userId] });
      return Number(r.rows[0]?.n ?? 0);
    },
    async removeLink(hash) {
      await client.execute({ sql: 'DELETE FROM sync_link WHERE token_hash = ?', args: [hash] });
    },
  };
}

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

/**
 * The /api/sync handler (web-standard Request -> Response, as Vercel functions take it).
 *   POST   body = this device's file      -> { format, devices: [{ deviceId, platform, counters }] }
 *   DELETE                                -> deletes every row of the signed-in user
 */
export function createSyncHandler({ verify, store, known, today = () => new Date().toISOString().slice(0, 10) }) {
  return async function handle(req) {
    const auth = req.headers.get('authorization') ?? '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
    const userId = token ? await verify(token) : null;
    if (!userId) return json(401, { error: 'sign in first' });

    if (req.method === 'DELETE') {
      await store.deleteUser(userId);
      return json(200, { deleted: true });
    }
    if (req.method !== 'POST') return json(405, { error: 'POST or DELETE' });

    const length = Number(req.headers.get('content-length') ?? 0);
    if (length > LIMITS.bodyBytes) return json(413, { error: 'file too large' });
    const text = await req.text();
    if (text.length > LIMITS.bodyBytes) return json(413, { error: 'file too large' });
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      return json(400, { error: 'not JSON' });
    }
    const v = validateUpload(body, known);
    if (v.error) return json(400, { error: v.error });
    const { deviceId, platform, counters } = v.file;
    const day = today();

    let owner = await store.ownerOf(deviceId);
    if (owner === null) {
      if ((await store.deviceCount(userId)) >= LIMITS.devicesPerUser) return json(429, { error: 'too many devices' });
      // Atomic: if two accounts race for a new id, exactly one insert wins.
      owner = await store.claim(userId, deviceId, platform, day);
    }
    if (owner !== userId) return json(403, { error: 'this device belongs to another account' });

    await store.replaceDevice(userId, deviceId, platform, counters, day);
    const rows = await store.otherRows(userId, deviceId);
    const byDevice = new Map();
    for (const r of rows) {
      if (!byDevice.has(r.device_id)) byDevice.set(r.device_id, { deviceId: r.device_id, platform: r.platform, counters: [] });
      byDevice.get(r.device_id).counters.push({
        app_family: r.app_family, action_id: r.action_id, kind: r.kind, count: Number(r.count),
        first_seen_day: r.first_seen_day, last_seen_day: r.last_seen_day,
      });
    }
    return json(200, { format: FORMAT, dropped: v.dropped, devices: [...byDevice.values()] });
  };
}
