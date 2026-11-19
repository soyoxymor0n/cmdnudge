// GENERATED from packages/ui/src/hooks/pointerEnv.ts — do not edit here.
// Improve it in the blueprint's packages/ and run `npm run sync` (blueprint skill).
import { useEffect, useState } from 'react';

/**
 * "Is this a touch-primary device?" — kept deliberately separate from "is the
 * viewport narrow?". They are different questions and conflating them is a bug:
 *
 * - A narrow window on a desktop still has a mouse: hover works, tooltips fire,
 *   `mouseleave` is reliable. Sizing it like a phone is fine; disabling
 *   hover-intent on it is wrong.
 * - A tablet in landscape has none of that at 1024px wide. It should behave
 *   like touch even though the viewport is "desktop-wide".
 *
 * So: anything that exists *because of the input modality* — no hover
 * (hover-intent latching, faster idle-collapse, hiding a hover-only tooltip) or
 * no physical keyboard (a "keyboard shortcuts" hint/menu is meaningless on a
 * landscape touch tablet — wide, but no keys) — must key off {@link TOUCH_QUERY};
 * anything purely about available width (control pitch, column count) keys off
 * {@link NARROW_QUERY}. (keyboard-affordance case: sonda 193d507)
 *
 * Ported from sonda's `pointerEnv` (2026-07). No user-agent sniffing — UA
 * strings lie and go stale; media queries answer the actual capability.
 */

/**
 * Touch-primary means BOTH: the primary pointer can't hover, AND it's coarse.
 * The `and` is load-bearing — a touchscreen laptop reports a coarse *secondary*
 * pointer while its mouse stays primary, so `hover: none` fails and it correctly
 * reads as desktop. Keep this in step with the touch-target rules in the app CSS.
 */
export const TOUCH_QUERY = '(hover: none) and (pointer: coarse)';

/** The width at which layout (control pitch, nav sizing) changes — Tailwind `md:`. */
export const NARROW_QUERY = '(max-width: 768px)';

/**
 * A phone held in portrait: below Tailwind's `sm` (640px). One constant so a
 * JS branch (`useMediaQuery(PHONE_QUERY)`, e.g. StepStory vs ProcessStepper)
 * and the `sm:` classes beside it can never drift apart (regops-suite's
 * `MOBILE_QUERY`, the mobile-landing instruction section 2). Width only:
 * input modality is {@link TOUCH_QUERY}, and the two are different questions.
 */
export const PHONE_QUERY = '(max-width: 639.98px)';

/**
 * One-shot, non-reactive read — for imperative code (event handlers, init) that
 * just needs the answer now. Defaults to `false` where matchMedia is absent
 * (SSR / jsdom): a missing API is not a touch device.
 */
export function isTouchPrimary(
  win: (Window & typeof globalThis) | undefined = typeof window !== 'undefined' ? window : undefined,
): boolean {
  if (!win || typeof win.matchMedia !== 'function') return false;
  return win.matchMedia(TOUCH_QUERY).matches;
}

/**
 * Reactive media-query hook. Re-renders when the match changes — rotation,
 * resize, docking a mouse, moving between displays. Defaults to `false` where
 * matchMedia is unavailable (SSR / jsdom), matching {@link isTouchPrimary}.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(
    () =>
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia(query).matches,
  );

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia(query);
    const sync = () => setMatches(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, [query]);

  return matches;
}
