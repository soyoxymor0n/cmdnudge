// GENERATED from packages/ui/src/storage/safeStorage.ts — do not edit here.
// Improve it in the blueprint's packages/ and run `npm run sync` (blueprint skill).
/**
 * Browser-storage access that never throws.
 *
 * In private windows and when a user blocks site data, merely TOUCHING
 * `window.localStorage` throws a SecurityError ("Access to storage is not
 * allowed from this context"). A `typeof localStorage` check does not help,
 * because the getter itself throws. So the property access AND every call are
 * wrapped here, and callers get null / false instead of an exception.
 *
 * Use these everywhere a shared element reads or writes browser storage.
 * Stored values are plain strings; serialise JSON at the call site.
 */

export type StorageArea = 'local' | 'session';

/** The Storage object for the area, or null when it is unavailable or blocked. */
export function getStorage(area: StorageArea = 'local'): Storage | null {
  try {
    if (typeof window === 'undefined') return null;
    const s = area === 'session' ? window.sessionStorage : window.localStorage;
    return s ?? null;
  } catch {
    return null;
  }
}

export function getLocalStorage(): Storage | null {
  return getStorage('local');
}

export function getSessionStorage(): Storage | null {
  return getStorage('session');
}

/** Returns the stored string, or null when missing, blocked or unavailable. */
export function readStorage(key: string, area: StorageArea = 'local'): string | null {
  try {
    return getStorage(area)?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

/** Returns true when the value was written. */
export function writeStorage(key: string, value: string, area: StorageArea = 'local'): boolean {
  try {
    const s = getStorage(area);
    if (!s) return false;
    s.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

/** Returns true when the key was removed (or was never there). */
export function removeStorage(key: string, area: StorageArea = 'local'): boolean {
  try {
    const s = getStorage(area);
    if (!s) return false;
    s.removeItem(key);
    return true;
  } catch {
    return false;
  }
}
