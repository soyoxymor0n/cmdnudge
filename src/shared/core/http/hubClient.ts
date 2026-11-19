// GENERATED from packages/core/src/http/hubClient.ts — do not edit here.
// Improve it in the blueprint's packages/ and run `npm run sync` (blueprint skill).
import { keyedSingleFlight } from '../util/singleFlight.js';

/**
 * One client for the server-side calls a module makes to the RegOps hub on
 * the CALLER's behalf: the signed-in user's session token goes out as the
 * bearer, never the module's service token.
 *
 * Rules (each has a negative or failure test in packages/core/tests/hubClient.test.ts):
 *  - The bearer is per call and is the caller's own. A bearer equal to one of
 *    `forbiddenTokens` (pass the module's service token) is refused before any
 *    network call.
 *  - The hub URL is read on EVERY call, so a changed env value is seen at once.
 *  - `cache: 'no-store'`, `redirect: 'error'` (a bearer is never followed
 *    somewhere else) and a per-request AbortController timeout.
 *  - The client never throws. Every outcome is a {@link HubResult}: ok, or one
 *    typed reason the caller branches on. A non-2xx answer, or a 2xx without
 *    JSON, is a failure, never a quiet success.
 *  - Single-flight, IN FLIGHT ONLY: concurrent GETs with the same bearer and the
 *    same URL share one fetch, and the entry is dropped the moment it settles.
 *    There is no cache, so there is no staleness. Writes (any non-GET) are never
 *    shared: two POSTs are two writes.
 *  - A path must start with `/` and resolve on the hub origin, with no `.` or `..`
 *    segment (raw or percent-encoded) and no raw tab, LF or CR: the same rule as
 *    hubServiceClient.ts. A caller that builds a path from an id encodes it with
 *    `encodeURIComponent`.
 *
 * Migration list (the call sites this replaces; they move in regmap and
 * regvoice, not here): regmap hub-products, export-window, regpath and
 * market-counts-route, plus the regmap hub.ts call that adds a preview bypass
 * header. That last one needs an extra-headers hook, which this client does not
 * have yet: add it when that call migrates. Same pattern in regvoice#219.
 */

/** One request's patience. A serverless invocation must not hang on the hub. */
export const DEFAULT_HUB_TIMEOUT_MS = 10_000;

export type HubMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface HubClientOptions {
  /** The hub origin, e.g. `https://regops.systems`. Read on every call. Empty or unset is a typed `not_configured`, not an error. */
  hubUrl: () => string | null | undefined;
  /** Per-request patience. Default {@link DEFAULT_HUB_TIMEOUT_MS}. */
  timeoutMs?: number;
  /** Transport seam for tests. Default: the global `fetch`. */
  fetchImpl?: typeof fetch;
  /** Tokens that must never be sent as a caller bearer (pass the module's service token). */
  forbiddenTokens?: (string | null | undefined)[];
}

export interface HubRequest {
  /** Default `GET`. */
  method?: HubMethod;
  /** Path on the hub, starting with `/`, with no scheme or host. Encode caller-supplied ids. */
  path: string;
  /** Query parameters. `undefined` values are left out. */
  query?: Record<string, string | undefined>;
  /** Sent as JSON when present. */
  body?: unknown;
  /** The CALLER's session token, without a `Bearer ` prefix. Null or empty means signed out: no call is made. */
  bearer: string | null | undefined;
}

export type HubFailureReason =
  | 'not_configured'
  | 'no_session'
  | 'forbidden_token'
  | 'bad_path'
  | 'timeout'
  | 'network'
  | 'http'
  | 'bad_body';

export type HubResult<T> =
  | { ok: true; status: number; body: T }
  | { ok: false; reason: HubFailureReason; status?: number; error?: string };

export interface HubClient {
  /** Never rejects. `body` is the parsed JSON, typed by the caller and not validated. */
  request<T = unknown>(req: HubRequest): Promise<HubResult<T>>;
}

function errorText(text: string): string | undefined {
  try {
    const parsed = JSON.parse(text) as unknown;
    if (parsed && typeof parsed === 'object' && 'error' in parsed) {
      const error = (parsed as { error: unknown }).error;
      if (typeof error === 'string') return error;
    }
  } catch {
    // Not JSON: there is no hub error text to pass on.
  }
  return undefined;
}

/** Same rule as hubServiceClient.ts (kept in step by hand: that file is vendored into the products). A raw tab, LF or CR is stripped by the URL parser before it resolves dot segments. */
const URL_STRIPPED_CONTROL = /[\t\n\r]/;

/** True when a path has a `.` or `..` segment, raw or percent-encoded, or a segment that does not decode. */
function hasDotSegment(path: string): boolean {
  const pathOnly = path.split(/[?#]/, 1)[0] ?? '';
  return pathOnly.split('/').some((segment) => {
    let decoded: string;
    try {
      decoded = decodeURIComponent(segment);
    } catch {
      return true;
    }
    return decoded === '.' || decoded === '..';
  });
}

export function createHubClient(opts: HubClientOptions): HubClient {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_HUB_TIMEOUT_MS;
  const forbidden = new Set((opts.forbiddenTokens ?? []).filter((t): t is string => typeof t === 'string' && t !== ''));

  async function send(url: string, method: string, bearer: string, body: string | undefined): Promise<HubResult<unknown>> {
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    try {
      const doFetch = opts.fetchImpl ?? fetch;
      const headers: Record<string, string> = { accept: 'application/json', authorization: `Bearer ${bearer}` };
      if (body !== undefined) headers['content-type'] = 'application/json';
      // `cache` is a DOM RequestInit member; the Node types this package builds with leave it out, so it is typed here.
      const init: RequestInit & { cache: 'no-store' } = {
        method,
        headers,
        body,
        cache: 'no-store',
        redirect: 'error',
        signal: controller.signal,
      };
      const res = await doFetch(url, init);
      const text = await res.text();
      if (!res.ok) {
        const error = errorText(text);
        return { ok: false, reason: 'http', status: res.status, ...(error !== undefined ? { error } : {}) };
      }
      try {
        return { ok: true, status: res.status, body: JSON.parse(text) as unknown };
      } catch {
        return { ok: false, reason: 'bad_body', status: res.status };
      }
    } catch {
      return timedOut ? { ok: false, reason: 'timeout' } : { ok: false, reason: 'network' };
    } finally {
      clearTimeout(timer);
    }
  }

  // Keyed on the JSON of { bearer, url }: a GET is shared only with an identical
  // request from the SAME caller. The key is compared, never shown or stored.
  const shareGet = keyedSingleFlight((key: string) => {
    const { bearer, url } = JSON.parse(key) as { bearer: string; url: string };
    return send(url, 'GET', bearer, undefined);
  });

  return {
    async request<T = unknown>(req: HubRequest): Promise<HubResult<T>> {
      const base = opts.hubUrl()?.trim() ?? '';
      if (!base) return { ok: false, reason: 'not_configured' };
      if (!req.bearer) return { ok: false, reason: 'no_session' };
      if (forbidden.has(req.bearer)) return { ok: false, reason: 'forbidden_token' };
      if (!req.path.startsWith('/') || URL_STRIPPED_CONTROL.test(req.path) || hasDotSegment(req.path)) return { ok: false, reason: 'bad_path' };

      let origin: string;
      try {
        origin = new URL(base).origin;
      } catch {
        return { ok: false, reason: 'not_configured' };
      }
      let target: URL;
      try {
        target = new URL(base.replace(/\/+$/, '') + req.path);
      } catch {
        return { ok: false, reason: 'bad_path' };
      }
      // The bearer must never leave for another origin, whatever the path says.
      if (target.origin !== origin) return { ok: false, reason: 'bad_path' };
      for (const [name, value] of Object.entries(req.query ?? {})) {
        if (value !== undefined) target.searchParams.set(name, value);
      }

      const method = (req.method ?? 'GET').toUpperCase();
      const url = target.toString();
      if (method === 'GET') {
        return (await shareGet(JSON.stringify({ bearer: req.bearer, url }))) as HubResult<T>;
      }
      const body = req.body === undefined ? undefined : JSON.stringify(req.body);
      return (await send(url, method, req.bearer, body)) as HubResult<T>;
    },
  };
}
