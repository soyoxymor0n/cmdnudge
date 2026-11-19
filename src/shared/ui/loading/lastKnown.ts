// GENERATED from packages/ui/src/loading/lastKnown.ts — do not edit here.
// Improve it in the blueprint's packages/ and run `npm run sync` (blueprint skill).
import { getLocalStorage } from '../storage/safeStorage.js';
/**
 * LAST-KNOWN VALUES: what the app showed this person last time, kept in
 * localStorage so a cold start paints it at once and the network only
 * RECONCILES it (stale-while-revalidate).
 *
 * Why it exists: every member screen's data waits behind Clerk's identity gate
 * (Clerk's own script comes from its Frontend API host, then the session is
 * checked). Measured on a warm cache that is the longest link in the chain, so
 * anything that renders only AFTER it - the nav's "new" count, the glossary's
 * buttons and rows - pops in late. A value we already knew costs nothing.
 *
 * Rules, because this is stored on the device:
 * - DISPLAY ONLY. A cached value never authorises anything; the server decides
 *   on every request and the revalidation overwrites the cache.
 * - Scoped per signed-in person (`lk:user`): a different person on the same
 *   browser reads nothing of the previous one. `clearLastKnown()` runs when a
 *   session resolves signed-out, so signing out leaves nothing behind.
 * - Every read/write is try/catch: private windows, blocked storage and quota
 *   errors all degrade to "nothing known", never to an exception.
 * - Entries expire (`MAX_AGE_MS`) and carry a version, so a shape change
 *   discards old entries instead of crashing on them.
 */
const PREFIX = 'lk:v1:';
const USER_KEY = 'lk:user';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function store(): Storage | null {
  try {
    return getLocalStorage();
  } catch {
    return null;
  }
}

/** The person this browser last saw signed in, or null. Readable before Clerk has loaded. */
export function lastKnownUser(): string | null {
  try {
    return store()?.getItem(USER_KEY) || null;
  } catch {
    return null;
  }
}

/**
 * Record who is signed in now. A different person (or none) than the one the
 * cache was written for wipes it first, so nothing crosses between people.
 */
export function setLastKnownUser(userId: string | null): void {
  const s = store();
  if (!s) return;
  try {
    if (lastKnownUser() === userId) return;
    clearLastKnown();
    if (userId) s.setItem(USER_KEY, userId);
  } catch {
    /* nothing known is a fine answer */
  }
}

/** Forget everything cached (sign-out). */
export function clearLastKnown(): void {
  const s = store();
  if (!s) return;
  try {
    const drop: string[] = [];
    for (let i = 0; i < s.length; i++) {
      const k = s.key(i);
      if (k && (k.startsWith(PREFIX) || k === USER_KEY)) drop.push(k);
    }
    drop.forEach((k) => s.removeItem(k));
  } catch {
    /* ignore */
  }
}

const slot = (name: string) => `${PREFIX}${name}`;

export function readLastKnown<T>(name: string): T | null {
  const s = store();
  if (!s || !lastKnownUser()) return null;
  try {
    const raw = s.getItem(slot(name));
    if (!raw) return null;
    const entry = JSON.parse(raw) as { at?: number; v?: T };
    if (typeof entry.at !== 'number' || Date.now() - entry.at > MAX_AGE_MS || entry.v === undefined) return null;
    return entry.v;
  } catch {
    return null;
  }
}

export function writeLastKnown<T>(name: string, value: T): void {
  const s = store();
  if (!s || !lastKnownUser()) return;
  try {
    s.setItem(slot(name), JSON.stringify({ at: Date.now(), v: value }));
  } catch {
    /* quota or blocked: the next load simply shows nothing early */
  }
}

/** Run `fn` when the browser is idle (after first paint), or soon after on engines without the API. */
export function whenIdle(fn: () => void, timeoutMs = 2000): void {
  const w = typeof window === 'undefined' ? null : (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number });
  if (w?.requestIdleCallback) w.requestIdleCallback(fn, { timeout: timeoutMs });
  else setTimeout(fn, 200);
}

const ORG_SLOT = 'activeOrg';

/** The organisation this person last acted as (null = personal), readable before Clerk has loaded. */
export function lastKnownOrg(): string | null {
  const v = readLastKnown<{ id: string | null }>(ORG_SLOT);
  return v?.id ?? null;
}

export function setLastKnownOrg(id: string | null): void {
  writeLastKnown(ORG_SLOT, { id });
}

/** How old an entry is, in ms, or Infinity when there is none. Lets a prefetch skip what is already fresh. */
export function lastKnownAgeMs(name: string): number {
  const s = store();
  if (!s || !lastKnownUser()) return Infinity;
  try {
    const entry = JSON.parse(s.getItem(slot(name)) ?? 'null') as { at?: number } | null;
    return typeof entry?.at === 'number' ? Date.now() - entry.at : Infinity;
  } catch {
    return Infinity;
  }
}
