// GENERATED from packages/ui/src/loading/useAsync.ts — do not edit here.
// Improve it in the blueprint's packages/ and run `npm run sync` (blueprint skill).
import { useCallback, useEffect, useRef, useState, type DependencyList } from 'react';

/**
 * useAsync — the one hook every data-loading screen uses, so the
 * loading/error/empty/data ladder is written once instead of re-hand-rolled in
 * every page (the Home/Admin duplication this replaces). Runs `fn` on mount and
 * whenever `deps` change, tracks status, and exposes `reload` for retry
 * buttons. Stale responses are dropped (last-call-wins) so a fast reload can't
 * be overwritten by a slow in-flight one.
 *
 * Pair with <Async> for rendering, or read the fields directly.
 */
export interface AsyncResult<T> {
  data: T | null;
  error: Error | null;
  /** true while a fetch is in flight (initial load OR a reload). */
  loading: boolean;
  /** true only for the very first load (no data yet) — drives skeletons. */
  initial: boolean;
  /**
   * Re-run the load. Returns a promise that resolves when THAT load settles: `true` if it produced data,
   * `false` if it failed (the failure is in `error` - this never rejects, so fire-and-forget callers such as
   * `onClick={reload}` stay safe). It exists for pull-to-refresh, which has to know when to stop spinning.
   */
  reload: () => Promise<boolean>;
  /** Optimistically replace the data without a refetch. */
  setData: (next: T | ((prev: T | null) => T)) => void;
}

export function useAsync<T>(fn: () => Promise<T>, deps: DependencyList = []): AsyncResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);
  const callId = useRef(0);
  const hasData = useRef(false);
  // Callers waiting on a reload; flushed when the load that THEY triggered (or a newer one) settles.
  const waiters = useRef<Array<(ok: boolean) => void>>([]);
  const flush = (ok: boolean) => waiters.current.splice(0).forEach((resolve) => resolve(ok));

  // Keep the latest fn without making it a dependency (callers pass inline
  // closures); deps below are the intended re-run trigger.
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    const id = ++callId.current;
    setLoading(true);
    setError(null);
    fnRef.current()
      .then((result) => {
        if (id !== callId.current) return; // a newer call superseded this one
        hasData.current = true;
        setData(result);
        setLoading(false);
        flush(true);
      })
      .catch((err: unknown) => {
        if (id !== callId.current) return;
        setError(err instanceof Error ? err : new Error(String(err)));
        setLoading(false);
        flush(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  // Unmounting mid-load must not strand a waiter (a pull-to-refresh spinner would never end).
  useEffect(() => () => flush(false), []);

  const reload = useCallback(
    () =>
      new Promise<boolean>((resolve) => {
        waiters.current.push(resolve);
        setNonce((n) => n + 1);
      }),
    [],
  );
  const patch = useCallback((next: T | ((prev: T | null) => T)) => {
    hasData.current = true;
    setData((prev) => (typeof next === 'function' ? (next as (p: T | null) => T)(prev) : next));
  }, []);

  return { data, error, loading, initial: loading && !hasData.current, reload, setData: patch };
}
