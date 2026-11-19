// GENERATED from packages/ui/src/data/query.ts — do not edit here.
// Improve it in the blueprint's packages/ and run `npm run sync` (blueprint skill).
import { readLastKnown, whenIdle, writeLastKnown } from '../loading/lastKnown.js';

/**
 * THE SHARED CLIENT DATA CACHE: one answer per (owner, key), shared by every
 * screen that asks, shown at once on the next visit and refreshed behind it
 * (stale-while-revalidate). Load-time wave 4, docs/adopt-load-time-2026-11b.md.
 *
 * Why it exists: every screen used to load its data in a `useAsync` effect, so
 * going back to a screen started from nothing - skeleton, round trip, paint -
 * and two screens wanting the same list each paid a round trip. With this the
 * second visit paints the last answer in the first frame and the round trip
 * only reconciles it; a key asked for by three components is one request.
 *
 * Rules (the safety bar for a client cache):
 * - OWNER. Every entry belongs to the current scope (`setQueryScope`: the
 *   signed-in user, plus the organisation when the app has one). A scope change
 *   drops every entry and detaches every request in flight, so a response for
 *   person A can never land in person B's cache. With NO scope set (an app that
 *   has not wired it, or identity not known yet) nothing is reused across
 *   mounts: a mounted hook sees only answers fetched after it mounted. That is
 *   the old `useAsync` behaviour, so forgetting the wiring costs speed, never
 *   correctness.
 * - TTL. `staleMs` (default 30 s): inside it a mount shows the entry and sends
 *   nothing; past it the entry is shown AND refetched.
 * - WRITES. The code that writes calls `setQueryData` (optimistic, wins over an
 *   older read in flight) or `invalidateQueries` (mounted readers refetch, the
 *   rest refetch on their next mount).
 * - REFUSALS. A refetch the server refuses (4xx) drops the answer, in memory and
 *   on the device; one that fails without an answer (offline, 5xx) keeps it.
 * - DISPLAY ONLY. Never put an authorization, entitlement or admin decision
 *   behind this cache; the server decides on every request.
 * - PERSIST is opt-in per query and goes through `lastKnown` (localStorage,
 *   per signed-in person, wiped on sign-out, 7 days max), under the scope.
 *
 * Not a GET dedupe inside the api client (blueprint rule): a query is named by
 * the screen that owns it, with a key it chooses, so nothing is shared by
 * accident.
 */
export interface QueryDef<T> {
  /** Stable name of this answer within the scope, e.g. `notes` or `admin/stats?tf=7d`. */
  key: string;
  /** Loads it (usually `() => api.get<T>(...)`). */
  fn: () => Promise<T>;
  /** How long an answer counts as fresh. Default {@link DEFAULT_STALE_MS}. */
  staleMs?: number;
  /** Also keep it on the device (lastKnown) so a reload paints it at once. Display data only. */
  persist?: boolean;
}

export interface QuerySnapshot<T = unknown> {
  /** The answer, or undefined when there is none yet. */
  data: T | undefined;
  /** When `data` was fetched (ms epoch). 0 = never fetched live in this page (persisted, or invalidated). */
  at: number;
  error: Error | null;
  /** A request for this key is in flight. */
  fetching: boolean;
  /** Bumped by invalidation and scope changes: a mounted reader refetches when it moves. */
  rev: number;
}

export const DEFAULT_STALE_MS = 30_000;
/** Entries kept when nothing is reading them; the oldest beyond this are dropped. */
const MAX_IDLE_ENTRIES = 200;
const PERSIST_PREFIX = 'q:';

interface Entry {
  snap: QuerySnapshot;
  /** Some reader asked for this key to be kept on the device. */
  persist: boolean;
  inFlight: Promise<unknown> | null;
  listeners: Set<() => void>;
  touched: number;
}

let scope: string | null = null;
let generation = 0;
const entries = new Map<string, Entry>();
const scopeListeners = new Set<() => void>();

const EMPTY: QuerySnapshot = Object.freeze({ data: undefined, at: 0, error: null, fetching: false, rev: 0 }) as QuerySnapshot;

function persistSlot(key: string): string | null {
  return scope === null ? null : `${PERSIST_PREFIX}${scope}:${key}`;
}

/** What the device kept for `key` under the current owner, or undefined. */
function stored(key: string): unknown {
  const slot = persistSlot(key);
  if (!slot) return undefined;
  return readLastKnown<unknown>(slot) ?? undefined;
}

function entryFor(key: string, def?: Pick<QueryDef<unknown>, 'persist'>): Entry {
  let e = entries.get(key);
  if (!e) {
    e = { snap: EMPTY, persist: false, inFlight: null, listeners: new Set(), touched: Date.now() };
    entries.set(key, e);
    sweep();
  }
  if (def?.persist && !e.persist) {
    e.persist = true;
    if (e.snap.data === undefined) {
      const kept = stored(key);
      if (kept !== undefined) e.snap = { ...e.snap, data: kept };
    }
  }
  e.touched = Date.now();
  return e;
}

/** Empty an entry a reader is still subscribed to (new owner, or a clear): it shows what the device kept for the new owner, if anything, and refetches. */
function resetEntry(e: Entry, key: string): void {
  e.inFlight = null;
  publish(e, { data: e.persist ? stored(key) : undefined, at: 0, error: null, fetching: false, rev: e.snap.rev + 1 });
}

function sweep(): void {
  if (entries.size <= MAX_IDLE_ENTRIES) return;
  const idle = [...entries].filter(([, e]) => e.listeners.size === 0 && !e.inFlight).sort((a, b) => a[1].touched - b[1].touched);
  for (const [k] of idle.slice(0, entries.size - MAX_IDLE_ENTRIES)) entries.delete(k);
}

function publish(e: Entry, next: Partial<QuerySnapshot>): void {
  e.snap = { ...e.snap, ...next };
  e.listeners.forEach((fn) => fn());
}

/** The current owner of the cache, or null when none is set. */
export function getQueryScope(): string | null {
  return scope;
}

/**
 * The owner string for {@link setQueryScope}: the signed-in person AND the
 * organisation they act as, because an app with organisations answers per
 * organisation (docs/adopt-load-time-2026-11b.md, section 2). With no
 * organisation active it is the person alone, so an app without organisations
 * keeps exactly the scope it always had. Null when nobody is signed in.
 */
export function ownerScope(userId: string | null | undefined, orgId?: string | null): string | null {
  if (!userId) return null;
  return orgId ? `${userId}:${orgId}` : userId;
}

/**
 * Set the owner: call it wherever the app learns who is signed in (the session
 * bridge, next to `setLastKnownUser`), with `ownerScope(userId, orgId)`, and
 * with null on sign-out. A different value than before drops every entry.
 */
export function setQueryScope(next: string | null): void {
  if (next === scope) return;
  scope = next;
  generation++;
  for (const [k, e] of entries) {
    if (e.listeners.size === 0) entries.delete(k);
    else resetEntry(e, k);
  }
  scopeListeners.forEach((fn) => fn());
}

export function subscribeQueryScope(fn: () => void): () => void {
  scopeListeners.add(fn);
  return () => scopeListeners.delete(fn);
}

/** Read without fetching. A persisted answer is loaded from the device on first read. */
export function peekQuery<T>(key: string, def?: Pick<QueryDef<T>, 'persist'>): QuerySnapshot<T> {
  return entryFor(key, def).snap as QuerySnapshot<T>;
}

export function subscribeQuery(key: string, fn: () => void): () => void {
  const e = entryFor(key);
  e.listeners.add(fn);
  return () => {
    e.listeners.delete(fn);
  };
}

/** Fetched in this page, within its TTL, and under an owner. */
export function isQueryFresh(key: string, staleMs = DEFAULT_STALE_MS): boolean {
  const e = entries.get(key);
  return !!e && scope !== null && e.snap.at > 0 && e.snap.data !== undefined && Date.now() - e.snap.at < staleMs;
}

/**
 * The answer for `def.key`: the cached one while fresh, the request already in
 * flight if there is one, otherwise a new request whose answer is stored.
 * `force` skips the freshness check (a retry button, pull-to-refresh).
 */
export function fetchQuery<T>(def: QueryDef<T>, options: { force?: boolean } = {}): Promise<T> {
  const e = entryFor(def.key, def);
  if (!options.force && isQueryFresh(def.key, def.staleMs)) return Promise.resolve(e.snap.data as T);
  if (e.inFlight && !options.force) return e.inFlight as Promise<T>;
  const gen = generation;
  const p: Promise<T> = def.fn().then(
    (value) => {
      if (gen === generation && e.inFlight === p) {
        e.inFlight = null;
        publish(e, { data: value, at: Date.now(), error: null, fetching: false });
        keep(e, def.key, value);
      }
      return value;
    },
    (err: unknown) => {
      if (gen === generation && e.inFlight === p) {
        e.inFlight = null;
        const error = err instanceof Error ? err : new Error(String(err));
        if (isRefusal(error)) {
          // The server answered and said no (4xx: deleted, or out of reach): the old answer must not
          // stand in for it, on screen or on the device. A failure that says nothing about the data
          // (offline, timeout, 5xx) keeps the answer and reports the error beside it.
          publish(e, { data: undefined, at: 0, error, fetching: false });
          const slot = e.persist ? persistSlot(def.key) : null;
          if (slot) writeLastKnown(slot, undefined);
        } else {
          publish(e, { error, fetching: false });
        }
      }
      throw err;
    },
  );
  e.inFlight = p;
  publish(e, { fetching: true });
  return p;
}

/** The server answered and refused (any 4xx), as opposed to not answering. */
function isRefusal(error: Error): boolean {
  const status = (error as Error & { status?: number }).status;
  return typeof status === 'number' && status >= 400 && status < 500;
}

/** True unless the visitor asked to save data or is on a 2G-class link: then prefetching only costs them. */
export function canPrefetch(): boolean {
  const nav = typeof navigator === 'undefined' ? null : (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } });
  const c = nav?.connection;
  if (!c) return true;
  return !c.saveData && !/(^|-)2g$/.test(c.effectiveType ?? '');
}

/**
 * Warm an answer the person is LIKELY to need next (nav intent, the next step
 * of a flow, idle time after first paint). Fire and forget: a failure is
 * forgotten, the screen asks again when it mounts. Skipped without an owner
 * (nothing could be reused) and on a save-data connection.
 */
export function prefetchQuery<T>(def: QueryDef<T>): void {
  if (scope === null || !canPrefetch()) return;
  fetchQuery(def).catch(() => {});
}

/** Run each warm-up when the browser is idle after first paint (nothing on a save-data link). */
export function prefetchWhenIdle(tasks: ReadonlyArray<() => void>): void {
  if (!canPrefetch()) return;
  whenIdle(() => tasks.forEach((t) => t()));
}

/**
 * Replace an answer locally (an optimistic edit, or the server's reply to a
 * write). Mounted readers re-render with it; a read in flight for the same key
 * is dropped, because it may predate the write.
 */
export function setQueryData<T>(key: string, next: T | ((prev: T | undefined) => T), def?: Pick<QueryDef<T>, 'persist'>): void {
  const e = entryFor(key, def);
  const value = typeof next === 'function' ? (next as (p: T | undefined) => T)(e.snap.data as T | undefined) : next;
  e.inFlight = null;
  publish(e, { data: value, at: Date.now(), error: null, fetching: false });
  keep(e, key, value);
}

function keep(e: Entry, key: string, value: unknown): void {
  const slot = e.persist ? persistSlot(key) : null;
  if (slot && value !== null && value !== undefined) writeLastKnown(slot, value);
}

/**
 * Mark answers stale after a write: `match` is a key (also matching `key/...`
 * and `key?...`) or a predicate. Mounted readers refetch now, the others on
 * their next mount; what they show meanwhile stays (stale-while-revalidate).
 */
export function invalidateQueries(match: string | ((key: string) => boolean)): void {
  const hit = typeof match === 'function' ? match : (k: string) => k === match || k.startsWith(`${match}/`) || k.startsWith(`${match}?`);
  for (const [k, e] of entries) {
    if (!hit(k)) continue;
    e.inFlight = null;
    publish(e, { at: 0, fetching: false, rev: e.snap.rev + 1 });
  }
}

/** Forget every answer in memory (the device copies stay; `clearLastKnown` removes those on sign-out). */
export function clearQueryCache(): void {
  generation++;
  for (const [k, e] of entries) {
    if (e.listeners.size === 0) entries.delete(k);
    else resetEntry(e, k);
  }
}

/** Test seam: forget the owner and every entry. */
export function resetQueryCacheForTests(): void {
  scope = null;
  generation++;
  entries.clear();
  scopeListeners.clear();
}
