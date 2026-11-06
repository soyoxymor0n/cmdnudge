// A libsql-shaped client ({ execute, batch }) for Turso over its HTTP API (Hrana over HTTP,
// POST /v2/pipeline), with plain fetch: the site stays dependency-free (#18).
// batch() runs as one Hrana batch: every step only runs if the one before succeeded, and a
// failure rolls the whole batch back.

function toValue(v) {
  if (v === null || v === undefined) return { type: 'null' };
  if (typeof v === 'number' && Number.isInteger(v)) return { type: 'integer', value: String(v) };
  if (typeof v === 'number') return { type: 'float', value: v };
  if (typeof v === 'bigint') return { type: 'integer', value: v.toString() };
  return { type: 'text', value: String(v) };
}

function fromValue(v) {
  switch (v?.type) {
    case 'integer': return Number(v.value);
    case 'float': return Number(v.value);
    case 'text': return v.value;
    case 'blob': return v.base64;
    default: return null;
  }
}

function rowsOf(result) {
  const cols = (result?.cols ?? []).map((c) => c.name);
  return (result?.rows ?? []).map((r) => Object.fromEntries(r.map((v, i) => [cols[i], fromValue(v)])));
}

const stmt = ({ sql, args = [] }) => ({ sql, args: args.map(toValue) });

/**
 * @param {string} url    TURSO_DATABASE_URL (libsql://… or https://…)
 * @param {string} token  TURSO_AUTH_TOKEN
 */
export function tursoHttp(url, token, fetchImpl = fetch) {
  const endpoint = `${url.replace(/^libsql:\/\//, 'https://').replace(/\/$/, '')}/v2/pipeline`;
  async function pipeline(requests) {
    const res = await fetchImpl(endpoint, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ requests: [...requests, { type: 'close' }] }),
    });
    if (!res.ok) throw new Error(`turso: HTTP ${res.status}`);
    const body = await res.json();
    const first = body.results?.[0];
    if (first?.type !== 'ok') throw new Error(`turso: ${first?.error?.message ?? 'request failed'}`);
    return first.response;
  }
  return {
    async execute(q) {
      const r = await pipeline([{ type: 'execute', stmt: stmt(q) }]);
      return { rows: rowsOf(r.result) };
    },
    async batch(qs) {
      const n = qs.length;
      const steps = [{ stmt: { sql: 'BEGIN' } }];
      qs.forEach((q, i) => steps.push({ stmt: stmt(q), condition: { type: 'ok', step: i } }));
      steps.push({ stmt: { sql: 'COMMIT' }, condition: { type: 'ok', step: n } });
      steps.push({ stmt: { sql: 'ROLLBACK' }, condition: { type: 'not', cond: { type: 'ok', step: n + 1 } } });
      const r = await pipeline([{ type: 'batch', batch: { steps } }]);
      const errors = r.result?.step_errors ?? [];
      const failed = errors.findIndex((e, i) => e && i <= n + 1);
      if (failed >= 0) throw new Error(`turso: ${errors[failed].message}`);
      return r.result.step_results.slice(1, n + 1).map((x) => ({ rows: rowsOf(x) }));
    },
  };
}
