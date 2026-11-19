// GENERATED from packages/core/src/util/singleFlight.ts — do not edit here.
// Improve it in the blueprint's packages/ and run `npm run sync` (blueprint skill).
/**
 * Single-flight: concurrent callers share ONE in-flight promise.
 *
 * The first call starts the work; every call made before it settles gets the
 * SAME promise; the moment it settles (fulfilled or rejected) it is forgotten,
 * so the next call starts fresh work.
 *
 * IN-FLIGHT ONLY, deliberately NOT a cache. A cached answer needs every write
 * that could change it to invalidate it, and the one write that forgets shows a
 * value the server no longer holds. Sharing only while a request is already on
 * the wire has no staleness to manage: whoever joins it would otherwise have
 * received an answer computed at the same moment anyway.
 *
 * A rejection is shared too (every waiting caller sees it) and is NOT
 * remembered - the next call tries again.
 *
 * Where it earns its keep (provenance: regvoice 442f032, 2026-09-23):
 * - Client: an app load asked `/api/me` up to four times at once - shell,
 *   account menu, feedback gate, the page - all released together by the api
 *   client's identity gate, so all concurrent, each a full serverless round
 *   trip doing the same DB work. `singleFlight(() => api.get('/api/me'))`.
 * - Server: several concurrent requests for one org each dialled the same
 *   upstream (the entitlements hub, a Clerk user lookup) before any cache was
 *   warm. `keyedSingleFlight` shares per key (per org, per user).
 *
 * Dependency-free and environment-neutral (browser and Node).
 */
export interface SingleFlightOptions {
  /**
   * Keep a SUCCESSFUL result this many ms after it settles, so a second screen that asks just after the first one finished
   * (not while it was on the wire) still shares it. Default 0: in-flight only. A short window (~1 s) is for reads every
   * page wants once per load, such as `/api/me`: Admin's mount lands after the shell's request has already settled.
   * A rejection is never kept. Anything that writes the value calls `forget()` so the next read is fresh.
   */
  settleMs?: number;
}

/**
 * The plain call: `() => Promise<T>`. THIS is what a consumer contract should name when it only calls the read -
 * a backend interface, a demo or test double, an `api` object's field type:
 *
 *   interface Backend { me: SingleFlightFn<Me> }          // a plain `async () => me` satisfies it
 *   const real: Backend = { me: singleFlight(fetchMe) }   // so does the built one (a SingleFlight<Me> is a SingleFlightFn<Me>)
 *
 * Do NOT write `typeof api` where `api.me` came from {@link singleFlight}: that type carries `forget()`, which a
 * plain function (the demo backend) does not have, so the demo stops type-checking (blueprint#212).
 */
export type SingleFlightFn<T> = () => Promise<T>;

/** What {@link singleFlight} returns: the plain call ({@link SingleFlightFn}) plus `forget()` for the code that writes. */
export type SingleFlight<T> = SingleFlightFn<T> & {
  /** Drop the kept result (and the in-flight entry), so the next call starts fresh work. Call after a write. */
  forget(): void;
};

export function singleFlight<T>(fn: () => Promise<T>, options: SingleFlightOptions = {}): SingleFlight<T> {
  const settleMs = Math.max(0, options.settleMs ?? 0);
  let pending: Promise<T> | null = null;
  // Set once the work succeeded: the wall-clock time after which the result is no longer shared.
  let keepUntil = 0;
  const call = (): Promise<T> => {
    if (pending && keepUntil && Date.now() > keepUntil) {
      pending = null;
      keepUntil = 0;
    }
    if (!pending) {
      // `Promise.resolve().then(fn)` would defer the start by a tick; call it
      // now, but make a synchronous throw a rejection like any other failure.
      let started: Promise<T>;
      try {
        started = Promise.resolve(fn());
      } catch (err) {
        started = Promise.reject(err);
      }
      const settled: Promise<T> = started.then(
        (value) => {
          if (settleMs > 0 && pending === settled) keepUntil = Date.now() + settleMs;
          else if (pending === settled) pending = null;
          return value;
        },
        (err) => {
          if (pending === settled) pending = null;
          throw err;
        },
      );
      pending = settled;
    }
    return pending;
  };
  call.forget = () => {
    pending = null;
    keepUntil = 0;
  };
  return call;
}

/**
 * {@link singleFlight} per key: callers asking about the SAME key share one
 * in-flight promise; different keys run independently. The entry is removed the
 * moment its promise settles, so the map only ever holds work that is on the
 * wire - it cannot grow with the number of keys ever seen.
 */
export function keyedSingleFlight<K, T>(fn: (key: K) => Promise<T>): {
  (key: K): Promise<T>;
  /** How many keys have work in flight right now (tests, diagnostics). */
  readonly size: number;
  /** Forget every in-flight entry (test hook; the work itself is not cancelled). */
  clear(): void;
} {
  const inFlight = new Map<K, Promise<T>>();
  const call = (key: K): Promise<T> => {
    const existing = inFlight.get(key);
    if (existing) return existing;
    let started: Promise<T>;
    try {
      started = Promise.resolve(fn(key));
    } catch (err) {
      started = Promise.reject(err);
    }
    const settled = started.finally(() => {
      if (inFlight.get(key) === settled) inFlight.delete(key);
    });
    inFlight.set(key, settled);
    return settled;
  };
  Object.defineProperty(call, 'size', { get: () => inFlight.size });
  (call as unknown as { clear: () => void }).clear = () => inFlight.clear();
  return call as typeof call & { readonly size: number; clear(): void };
}
