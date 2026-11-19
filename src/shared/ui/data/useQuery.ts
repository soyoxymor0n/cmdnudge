// GENERATED from packages/ui/src/data/useQuery.ts — do not edit here.
// Improve it in the blueprint's packages/ and run `npm run sync` (blueprint skill).
import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import type { AsyncResult } from '../loading/useAsync.js';
import {
  DEFAULT_STALE_MS,
  fetchQuery,
  getQueryScope,
  isQueryFresh,
  peekQuery,
  setQueryData,
  subscribeQuery,
  subscribeQueryScope,
  type QueryDef,
} from './query.js';

export interface QueryResult<T> extends AsyncResult<T> {
  /** When the shown data was fetched (ms epoch); 0 while it is the device's copy from an earlier visit. */
  updatedAt: number;
}

/**
 * `useAsync` over the shared cache (query.ts): the same {@link AsyncResult}
 * shape, so `<Async>` and every caller keep working, but
 *
 * - a screen opened again shows its last answer in the FIRST frame and
 *   refetches behind it only when the answer is older than `staleMs`;
 * - components asking for the same key share one request and one answer;
 * - `setData` (optimistic) and `reload` reach every reader of the key.
 *
 *   const NOTES: QueryDef<Note[]> = { key: 'notes', fn: () => api.get('/api/notes') };
 *   const notes = useQuery(NOTES);              // <Async result={notes} ...>
 *   prefetchQuery(NOTES);                        // on nav intent, from anywhere
 *
 * The key must name everything the request depends on (`admin/stats?tf=${tf}`);
 * a new key is a new entry, as a deps change is for `useAsync`. `enabled: false`
 * sends nothing and shows nothing.
 */
export function useQuery<T>(def: QueryDef<T>, options: { enabled?: boolean } = {}): QueryResult<T> {
  const enabled = options.enabled ?? true;
  const { key } = def;
  const defRef = useRef(def);
  defRef.current = def;

  const scope = useSyncExternalStore(subscribeQueryScope, getQueryScope, getQueryScope);
  const subscribe = useCallback((fn: () => void) => subscribeQuery(key, fn), [key]);
  // `persist` is read on the first peek of a key, so the device's copy is there for the first render.
  const read = () => peekQuery<T>(key, def);
  const snap = useSyncExternalStore(subscribe, read, read);

  // Without an owner nothing is reused across mounts: only answers that arrived after this reader mounted show.
  const mountedAt = useRef(Date.now());
  const visible = scope === null && snap.at < mountedAt.current ? undefined : snap.data;

  const stale = !isQueryFresh(key, def.staleMs ?? DEFAULT_STALE_MS) || visible === undefined;
  useEffect(() => {
    if (!enabled || !stale) return;
    fetchQuery(defRef.current).catch(() => {
      /* the error is in the snapshot */
    });
    // `snap.rev` moves on invalidation and owner changes: a mounted reader refetches then.
  }, [key, scope, enabled, snap.rev, stale]);

  const reload = useCallback(
    () =>
      fetchQuery(defRef.current, { force: true }).then(
        () => true,
        () => false,
      ),
    [],
  );
  const setData = useCallback(
    (next: T | ((prev: T | null) => T)) =>
      setQueryData<T>(
        defRef.current.key,
        (prev) => (typeof next === 'function' ? (next as (p: T | null) => T)(prev ?? null) : next),
        defRef.current,
      ),
    [],
  );

  if (!enabled) {
    return { data: null, error: null, loading: false, initial: false, reload, setData, updatedAt: 0 };
  }
  const pending = visible === undefined && !snap.error;
  return {
    data: visible === undefined ? null : visible,
    error: snap.error,
    loading: snap.fetching || pending,
    initial: pending,
    reload,
    setData,
    updatedAt: visible === undefined ? 0 : snap.at,
  };
}
