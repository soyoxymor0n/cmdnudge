// GENERATED from packages/core/src/http/hubServiceClient.ts — do not edit here.
// Improve it in the blueprint's packages/ and run `npm run sync` (blueprint skill).
import { keyedSingleFlight } from '../util/singleFlight.js';

/**
 * The module's own client for the RegOps hub: SERVICE reads and writes made on
 * the module's behalf, with the module's shared service token as the bearer.
 * It is the counterpart of {@link createHubClient} (hubClient.ts), which carries
 * a signed-in person's session token and never caches. Use this one for reads
 * the module makes as itself (glossary terms, market counts, pulses, an org's
 * entitlements), and put any per-person or per-org id in the path, because the
 * cache is keyed on the full URL.
 *
 * Rules (each has a negative or failure test in packages/core/tests/hubClient.test.ts):
 *  - The service token is read on every call and sent only when set. A bypass
 *    secret (a preview reading the beta hub behind deployment protection) goes
 *    out as `x-vercel-protection-bypass`, only when set.
 *  - `requestHeaders` (read on every call) adds headers to the call. The client's
 *    own `accept`, `authorization`, `content-type` and `if-none-match` always win,
 *    under any casing: a caller can never put a credential or the answer format
 *    on the wire.
 *  - `cache: 'no-store'` and `redirect: 'error'`, and a per-request timeout. The
 *    transport never follows a redirect, so the token never reaches another host.
 *  - A path starts with one `/`, stays on the hub origin, and has no `.` or `..`
 *    segment, raw or percent-encoded. A caller that builds a path from an id
 *    encodes the id with `encodeURIComponent`; an encoded id is always one segment.
 *  - The client never throws. Every outcome is a {@link HubServiceResult}.
 *  - ttl and etag, both opt-in per call. `ttlMs` reuses a successful answer for
 *    that long without a call. After the TTL, `etag` revalidates with
 *    `If-None-Match`; a 304 reuses the stored body. The default is no cache.
 *  - In-flight sharing: concurrent GETs of one URL share one call. POSTs are
 *    never shared, and never refused by the window below.
 *  - Shared failure window: a window-opening failure (timeout, network, a 5xx or
 *    429, a 2xx that is not JSON) stops every GET of this client for
 *    `failureWindowMs`, with no call and no log line. It opens once per window,
 *    so an outage is one log line, not one per request. A 4xx is an answer about
 *    one request and does not close the hub to other paths. A successful call of
 *    any kind ends the window.
 */

/** One request's patience. A serverless invocation must not hang on the hub. */
export const DEFAULT_HUB_SERVICE_TIMEOUT_MS = 3000;

/** How long after a window-opening failure reads are refused without a call. */
export const DEFAULT_HUB_FAILURE_WINDOW_MS = 60_000;

/** Stored answers per client before the oldest is dropped. Bounds memory across many paths. */
export const HUB_SERVICE_CACHE_LIMIT = 500;

/** A value, or a function read at call time (a deploy can gain the variable without a re-import). */
type Setting<T> = T | (() => T);

/** Headers the client sets itself. A caller's `requestHeaders` may add others, never these. */
const CLIENT_OWNED_HEADERS = new Set(['accept', 'authorization', 'content-type', 'if-none-match']);

function read<T>(setting: Setting<T>): T {
  return typeof setting === 'function' ? (setting as () => T)() : setting;
}

export interface HubServiceLog {
  /** One call per window that opens. `path` has no query string. `detail` is the reason, with the status when there is one. */
  failed(path: string, detail: string): void;
}

export interface HubServiceClientOptions {
  /** The hub origin, e.g. `https://regops.systems`. Empty or unset is a typed `not_configured`, not an error. */
  baseUrl: Setting<string | null | undefined>;
  /** The module's shared service token. Sent as the bearer only when set. */
  serviceToken?: Setting<string | null | undefined>;
  /** Sent as `x-vercel-protection-bypass` only when set. */
  bypassSecret?: Setting<string | null | undefined>;
  /**
   * Extra request headers, read at call time. A caller that composes this client (the entitlements and markets clients) passes
   * its own `requestHeaders` option through here. `accept`, `authorization`, `content-type` and `if-none-match` are the client's
   * own and are dropped from this map under any casing.
   */
  requestHeaders?: () => Record<string, string> | undefined;
  /** Per-request patience. Default {@link DEFAULT_HUB_SERVICE_TIMEOUT_MS}. */
  timeoutMs?: number;
  /** How long a window-opening failure refuses reads. Default {@link DEFAULT_HUB_FAILURE_WINDOW_MS}. */
  failureWindowMs?: number;
  log?: HubServiceLog;
  /** Transport seam for tests. Default: the global `fetch`. */
  fetchImpl?: typeof fetch;
}

export interface HubGetOptions {
  /** Reuse a successful answer this many ms without asking the hub. Default 0: every call asks. */
  ttlMs?: number;
  /** After the TTL, revalidate with `If-None-Match`; a 304 reuses the stored body. Needs an ETag from the hub. Default false. */
  etag?: boolean;
}

/**
 * `bad_body` is a body that cannot be encoded as JSON, or a 2xx answer that is not
 * JSON. `failure_window` is a read refused without a call while the window is open.
 */
export type HubServiceFailureReason = 'not_configured' | 'bad_path' | 'failure_window' | 'timeout' | 'network' | 'http' | 'bad_body';

export type HubServiceResult<T> =
  | { ok: true; status: number; body: T; cached: boolean }
  | { ok: false; reason: HubServiceFailureReason; status?: number; error?: string };

export interface HubServiceClient {
  /** Never rejects. `body` is the parsed JSON, typed by the caller and not validated. */
  get<T = unknown>(path: string, opts?: HubGetOptions): Promise<HubServiceResult<T>>;
  /** Never rejects, never shared, never refused by the failure window. */
  post<T = unknown>(path: string, body?: unknown): Promise<HubServiceResult<T>>;
  /** Test hook: forget stored answers, the failure window and in-flight calls. */
  reset(): void;
}

interface CacheEntry {
  status: number;
  body: unknown;
  etag: string | undefined;
  /** When the hub last answered for this URL, or confirmed it unchanged (304). */
  at: number;
}

/** What one call to the hub produced, before the client decides what it means. */
type Wire =
  | { kind: 'answer'; status: number; body: unknown; etag: string | undefined }
  | { kind: 'not_modified' }
  | { kind: 'failed'; reason: HubServiceFailureReason; status?: number; error?: string };

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

/**
 * True when a path has a `.` or `..` segment, raw or percent-encoded. The URL parser would fold such a segment
 * into another route on the hub, and the service token would go with it. A segment that does not decode is refused too.
 */
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

/** Failures that say the hub itself is unreachable or unwell. A 4xx is the hub answering one request, not an outage. */
function opensWindow(reason: HubServiceFailureReason, status: number | undefined): boolean {
  if (reason === 'timeout' || reason === 'network' || reason === 'bad_body') return true;
  return reason === 'http' && status !== undefined && (status >= 500 || status === 429);
}

function toFailure(wire: Extract<Wire, { kind: 'failed' }>): HubServiceResult<never> {
  return {
    ok: false,
    reason: wire.reason,
    ...(wire.status !== undefined ? { status: wire.status } : {}),
    ...(wire.error !== undefined ? { error: wire.error } : {}),
  };
}

export function createHubServiceClient(opts: HubServiceClientOptions): HubServiceClient {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_HUB_SERVICE_TIMEOUT_MS;
  const failureWindowMs = opts.failureWindowMs ?? DEFAULT_HUB_FAILURE_WINDOW_MS;

  /** Keyed on the full URL, so one answer can only belong to the route it came from. */
  const cache = new Map<string, CacheEntry>();
  /** When the last window-opening failure happened; 0 when healthy. Shared by every path: one hub, one outage. */
  let failedAt = 0;

  function resolve(path: string): { ok: true; url: string; pathname: string } | { ok: false; reason: HubServiceFailureReason } {
    const base = (read(opts.baseUrl) ?? '').trim();
    if (!base) return { ok: false, reason: 'not_configured' };
    let origin: string;
    try {
      origin = new URL(base).origin;
    } catch {
      return { ok: false, reason: 'not_configured' };
    }
    if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//') || path.includes('\\') || hasDotSegment(path)) {
      return { ok: false, reason: 'bad_path' };
    }
    let url: URL;
    try {
      url = new URL(base.replace(/\/+$/, '') + path);
    } catch {
      return { ok: false, reason: 'bad_path' };
    }
    if (url.origin !== origin) return { ok: false, reason: 'bad_path' };
    return { ok: true, url: url.toString(), pathname: url.pathname };
  }

  /**
   * The response body as text. A real `Response` always has `text()`; the minimal `{ ok, status, json }` object that every
   * product's hub-client tests stub `fetch` with (ported from regvoice) has only `json()`, so that shape is read through it
   * rather than failing every such test as a network error (#433). A `json()` that rejects reads as an empty, so unparsable, body.
   */
  async function bodyText(res: Response): Promise<string> {
    if (typeof res.text === 'function') return res.text();
    const json = (res as { json?: () => Promise<unknown> }).json;
    if (typeof json !== 'function') return '';
    try {
      return JSON.stringify(await json.call(res));
    } catch {
      return '';
    }
  }

  async function fetchWire(url: string, method: 'GET' | 'POST', payload: string | undefined, ifNoneMatch: string | undefined): Promise<Wire> {
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    try {
      const token = read(opts.serviceToken);
      const bypass = read(opts.bypassSecret);
      // The caller's extra headers first, the client's own last, so a caller can add a header and never replace ours.
      const headers: Record<string, string> = {};
      for (const [name, value] of Object.entries(opts.requestHeaders?.() ?? {})) {
        if (!CLIENT_OWNED_HEADERS.has(name.toLowerCase())) headers[name] = value;
      }
      headers.accept = 'application/json';
      if (token) headers.authorization = `Bearer ${token}`;
      if (bypass) headers['x-vercel-protection-bypass'] = bypass;
      if (payload !== undefined) headers['content-type'] = 'application/json';
      if (ifNoneMatch !== undefined) headers['if-none-match'] = ifNoneMatch;
      // `cache` is a DOM RequestInit member the Node types this package builds with leave out, so it is typed here (as in hubClient.ts).
      const init: RequestInit & { cache: 'no-store' } = {
        method,
        headers,
        body: payload,
        cache: 'no-store',
        redirect: 'error',
        signal: controller.signal,
      };
      const res = await (opts.fetchImpl ?? fetch)(url, init);
      if (res.status === 304 && ifNoneMatch !== undefined) return { kind: 'not_modified' };
      const text = await bodyText(res);
      if (!res.ok) {
        const error = errorText(text);
        return { kind: 'failed', reason: 'http', status: res.status, ...(error !== undefined ? { error } : {}) };
      }
      try {
        return { kind: 'answer', status: res.status, body: JSON.parse(text) as unknown, etag: res.headers?.get('etag') ?? undefined };
      } catch {
        return { kind: 'failed', reason: 'bad_body', status: res.status };
      }
    } catch {
      return { kind: 'failed', reason: timedOut ? 'timeout' : 'network' };
    } finally {
      clearTimeout(timer);
    }
  }

  /** Opens (or extends) the window for an outage. Logs only when a window OPENS: never per refused or repeated failure. */
  function noteFailure(pathname: string, reason: HubServiceFailureReason, status: number | undefined): void {
    if (!opensWindow(reason, status)) return;
    const alreadyOpen = failedAt > 0 && Date.now() - failedAt < failureWindowMs;
    failedAt = Date.now();
    if (!alreadyOpen) opts.log?.failed(pathname, status === undefined ? reason : `${reason} ${status}`);
  }

  function remember(url: string, entry: CacheEntry): void {
    if (!cache.has(url) && cache.size >= HUB_SERVICE_CACHE_LIMIT) {
      const oldest = cache.keys().next().value;
      if (oldest !== undefined) cache.delete(oldest);
    }
    cache.set(url, entry);
  }

  function settleGet(url: string, keep: boolean, wire: Wire): HubServiceResult<unknown> {
    if (wire.kind === 'not_modified') {
      const prior = cache.get(url);
      if (prior) {
        prior.at = Date.now();
        failedAt = 0;
        return { ok: true, status: prior.status, body: prior.body, cached: true };
      }
      // Unreachable in practice: If-None-Match is sent only with a stored ETag. Reported, never guessed at.
      return { ok: false, reason: 'http', status: 304 };
    }
    if (wire.kind === 'failed') {
      noteFailure(new URL(url).pathname, wire.reason, wire.status);
      return toFailure(wire);
    }
    failedAt = 0;
    if (keep || cache.has(url)) remember(url, { status: wire.status, body: wire.body, etag: wire.etag, at: Date.now() });
    return { ok: true, status: wire.status, body: wire.body, cached: false };
  }

  // In flight only. The key carries everything the shared call depends on, so callers with different
  // cache or revalidation choices never share a call they should not.
  const shareGet = keyedSingleFlight(async (key: string): Promise<HubServiceResult<unknown>> => {
    const { url, keep, revalidate } = JSON.parse(key) as { url: string; keep: boolean; revalidate: boolean };
    const prior = cache.get(url);
    const wire = await fetchWire(url, 'GET', undefined, revalidate ? prior?.etag : undefined);
    return settleGet(url, keep, wire);
  });

  async function get<T>(path: string, getOpts: HubGetOptions = {}): Promise<HubServiceResult<T>> {
    const target = resolve(path);
    if (!target.ok) return { ok: false, reason: target.reason };
    const ttl = Math.max(0, getOpts.ttlMs ?? 0);
    const prior = cache.get(target.url);
    if (prior && ttl > 0 && Date.now() - prior.at < ttl) {
      return { ok: true, status: prior.status, body: prior.body as T, cached: true };
    }
    if (failedAt > 0 && Date.now() - failedAt < failureWindowMs) return { ok: false, reason: 'failure_window' };
    const key = JSON.stringify({ url: target.url, keep: ttl > 0 || getOpts.etag === true, revalidate: getOpts.etag === true });
    return (await shareGet(key)) as HubServiceResult<T>;
  }

  async function post<T>(path: string, body?: unknown): Promise<HubServiceResult<T>> {
    const target = resolve(path);
    if (!target.ok) return { ok: false, reason: target.reason };
    let payload: string | undefined;
    try {
      payload = body === undefined ? undefined : JSON.stringify(body);
    } catch {
      return { ok: false, reason: 'bad_body' };
    }
    const wire = await fetchWire(target.url, 'POST', payload, undefined);
    if (wire.kind === 'failed') {
      noteFailure(target.pathname, wire.reason, wire.status);
      return toFailure(wire);
    }
    // A write never touches the stored answers: a POST and a GET of one path are different things.
    if (wire.kind === 'not_modified') return { ok: false, reason: 'http', status: 304 };
    failedAt = 0;
    return { ok: true, status: wire.status, body: wire.body as T, cached: false };
  }

  return {
    get,
    post,
    reset() {
      cache.clear();
      shareGet.clear();
      failedAt = 0;
    },
  };
}
