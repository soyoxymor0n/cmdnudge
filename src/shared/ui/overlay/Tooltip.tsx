// GENERATED from packages/ui/src/overlay/Tooltip.tsx — do not edit here.
// Improve it in the blueprint's packages/ and run `npm run sync` (blueprint skill).
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { TOUCH_QUERY, useMediaQuery } from '../hooks/pointerEnv.js';

/**
 * The house tooltip: ONE surface, ONE layer, and a plain attribute at the call
 * site.
 *
 * ## Why not `title`
 *
 * A native `title` is chrome from a different application. It is unthemed (a
 * black-on-yellow OS box beside a designed dark surface), its delay and
 * duration cannot be set, it cannot be styled or measured, it does nothing at
 * all on most touch browsers, and it is invisible to the design system - so a
 * project can carry eighty-five of them without a single one appearing in a
 * review of "our tooltips". This module replaces every one of them.
 *
 * ## The call site is an attribute, not a component
 *
 * ```tsx
 * <button {...tooltip(t.registryEditDueHint)} aria-label={t.registryEditDueHint}>
 * ```
 *
 * A wrapper component (`<Tip><button/></Tip>`) would add a box to the DOM at
 * every one of those sites - inside flex rows, table cells and SVG, where an
 * extra element changes the layout - and a hook (`useTip()`) cannot be called
 * from inside the `.map()` that renders a table's rows, which is exactly where
 * most tooltips live. An attribute has neither problem, works on ANY element
 * including SVG shapes, survives conditional rendering, and needs no import at
 * the leaf. `tooltip(x)` is a two-line helper only so that a null/empty
 * hint spreads to NOTHING rather than to `data-tooltip="undefined"`, and so the
 * convention is greppable. The attribute is `data-tooltip`, never `data-tip`:
 * the feature-tips standard already owns `data-tip-id`, and two vocabularies
 * one character apart is how the wrong one gets read.
 *
 * ## Basic formatting
 *
 * The text may use a small, closed markup vocabulary - bold, italic,
 * underline and line breaks - rendered by `tooltipRichText.tsx`:
 *
 * ```tsx
 * {...tooltip('[[b]]' + fullTitle + '[[/b]]\n\n' + summary)}
 * ```
 *
 * `\n` is a line break (two in a row is a blank line), and `[[b]]...[[/b]]`,
 * `[[i]]...[[/i]]`, `[[u]]...[[/u]]` wrap bold/italic/underline - the same
 * bracket-tag convention the i18n rich-copy editor already uses, so there is
 * one vocabulary rather than two. It is a fixed set of tokens parsed into
 * React elements, never `dangerouslySetInnerHTML` - see that module's own
 * header for why that matters when the text is caller-supplied or scraped
 * from a third party. Plain text with none of the tokens (the overwhelming
 * majority of call sites) renders exactly as before.
 *
 * ## One layer, not one tooltip per trigger
 *
 * A registry row carries four hints and a screen can hold forty rows; mounting
 * a portal, a state hook and a positioning effect per hint would cost 160 of
 * each to show at most ONE box. So the triggers are inert markup and a single
 * delegated listener on `document` finds the nearest `[data-tooltip]` ancestor of
 * whatever the pointer entered. There is exactly one tooltip element in the
 * DOM, it exists only while something is hovered, and adding a hint anywhere in
 * the app costs one attribute and zero runtime.
 *
 * ## Clipping
 *
 * Portalled to `<body>` and placed from the trigger's rect, for the reason
 * `useMenuAnchor` documents at length: any `overflow` between the trigger and
 * the page clips an absolutely positioned box, and a table with `overflow-x:
 * auto` clips on BOTH axes. Placement is its own ~20 lines rather than a reuse
 * of `useMenuAnchor` because a menu takes its MIN width from its trigger, which
 * for a tooltip would make a hint on a wide table cell as wide as the cell and
 * a hint on a 14px icon absurdly narrow. A tooltip centres on its anchor and is
 * sized by its own text.
 *
 * ## Touch
 *
 * LONG-PRESS, deliberately not tap. A tap belongs to the element - the button
 * fires, the picker opens - and a tooltip that competed for it would break the
 * control it is meant to explain. Long-press is also what `title` itself did on
 * the touch browsers that supported it at all, so this is the one behaviour
 * that is strictly better than what it replaces rather than merely different.
 * The press that opened a tip swallows its own click and its context menu, so
 * reading a hint never also activates the thing it describes.
 *
 * ONE EXCEPTION, opted into per trigger: `data-tooltip-tap` (spread by
 * `tooltip(text, { tap: true })`). A trigger whose ONLY job is to reveal the
 * hint - an `InfoTip`'s (i), a legend glyph - has nothing else for a tap to
 * belong to, so the general rule inverts: there, long-press-only means the
 * control visibly does nothing when tapped, which is the interface-polish
 * standard's "never render a control that does nothing" (owner-reported on
 * RegVoice's Discover heading, 2026-09-10). The opt-in is per trigger and
 * never a mode, because the reason it is safe is a fact about that ONE
 * element: it has no other action to lose. A tap-opened tip still swallows
 * its own click and still auto-closes on `touchHoldMs`, exactly like a
 * long-pressed one.
 *
 * ## Acting on a control ends its explanation
 *
 * Three separate paths used to re-open a tip over a control the user had just
 * clicked, where it then sat until focus or the pointer moved:
 *
 *  - a mouse click FOCUSES the button, and focus opened a tip with no dwell;
 *  - acting on a control usually re-renders it, so the node under a stationary
 *    cursor is a NEW element and `mouseover` fires again, unprompted;
 *  - a click that scrolls (a layout toggle that scrolls its list into place)
 *    dragged the trigger up the page while the tip tracked it - and since the
 *    tip sits above every layer, it painted over the sticky header on the way.
 *
 * So: focus only opens a tip when it is KEYBOARD focus (`:focus-visible`); a
 * mousedown suppresses re-opening until the pointer physically MOVES again
 * (element identity cannot see the re-render case, movement can); and a scroll
 * that actually moves the anchor closes the tip rather than following it. A
 * sticky or fixed trigger does not move on scroll, so its tip survives.
 *
 * ## Keyboard and screen readers
 *
 * Keyboard focus opens the tip and blur closes it; Escape closes it without
 * moving focus. While open, the trigger is given `aria-describedby` pointing at the
 * live tooltip (restored, not blanked, on close - a trigger may have had one of
 * its own). A tooltip is a DESCRIPTION, never a name: an element whose only
 * text was its `title` must carry an `aria-label` (or `sr-only` text) of its
 * own, because `title` used to contribute the accessible name and this does
 * not. That check belongs at each call site.
 */

/** The attribute that turns any element into a tooltip trigger. */
export const TOOLTIP_ATTR = 'data-tooltip';

/** Optional keyboard-shortcut chip, rendered after the hint text. */
export const TOOLTIP_KBD_ATTR = 'data-tooltip-kbd';

/**
 * Marks a trigger whose whole purpose IS the hint, so a touch TAP opens it
 * rather than only a long press. See the "Touch" section of this module's
 * header for why this is opt-in per element and not a global mode.
 */
export const TOOLTIP_TAP_ATTR = 'data-tooltip-tap';

/** The single tooltip node's id - what `aria-describedby` points at. */
export const TOOLTIP_ID = 'bp-tooltip';

const TOOLTIP_SELECTOR = `[${TOOLTIP_ATTR}]`;

/** The house marker for an open modal (the same one the tour and the palette's own guards read). */
const MODAL_SELECTOR = '[aria-modal="true"]';

/** True when an open modal sits over `el`: `el` is not inside it. */
function coveredByModal(el: Element): boolean {
  return Array.from(document.querySelectorAll(MODAL_SELECTOR)).some((modal) => !modal.contains(el));
}

/**
 * True when `el` is actually drawn: no ancestor is `display: none` and it is not
 * `visibility: hidden`. A disclaimer in a collapsed section has not been
 * encountered, so it must not spend its one first encounter there.
 */
function onScreen(el: Element): boolean {
  if (window.getComputedStyle(el).visibility === 'hidden') return false;
  for (let node: Element | null = el; node; node = node.parentElement) {
    if (window.getComputedStyle(node).display === 'none') return false;
  }
  return true;
}

/**
 * Marks a DISCLAIMER tooltip and carries its id. The layer shows a disclaimer
 * ONCE, on first encounter, then never again for that id (seen-state in
 * localStorage under `TOOLTIP_SEEN_PREFIX + id`). Every other tooltip stays
 * hover / long-press / keyboard-focus only.
 */
export const TOOLTIP_DISCLAIMER_ATTR = 'data-tooltip-disclaimer';

/** localStorage key prefix for the per-disclaimer seen flag. */
export const TOOLTIP_SEEN_PREFIX = 'tooltip-seen:';

/** Has this disclaimer been shown before? false when storage is unavailable. */
export function tooltipSeen(id: string): boolean {
  try {
    return window.localStorage.getItem(TOOLTIP_SEEN_PREFIX + id) === '1';
  } catch {
    return false;
  }
}

function markTooltipSeen(id: string): void {
  try {
    window.localStorage.setItem(TOOLTIP_SEEN_PREFIX + id, '1');
  } catch {
    /* private window / blocked storage: the disclaimer simply shows again next visit */
  }
}

/**
 * The explicit "this tooltip needs no separate short wording" marker. Pass it
 * as `short` so the decision is visible in the source: a call site with NO
 * `short` is "not decided yet" (a guardrail test flags it), a call site with
 * `short: SHORT_SAME` is a deliberate "the full text is already short enough".
 * The seasoned view then shows the full text, exactly as before.
 */
export const SHORT_SAME = 'same' as const;

export type TooltipOptions = {
  /** `kbd` renders a shortcut chip after the text - the one piece of rich
   *  content common enough to be worth an API, and the reason the last
   *  hand-placed hover boxes could finally be deleted. */
  kbd?: string | null | false;
  /** `tap` opts a touch TAP into opening the tip - only for a trigger that
   *  has no other action for the tap to belong to. */
  tap?: boolean;
  /** The condensed wording. Used instead of the full text when `seasoned` is true.
   *  `SHORT_SAME` says, on purpose, that the full text is its own short version. */
  short?: string | null | false | typeof SHORT_SAME;
  /** The person knows the product: show `short` when one is given. Without a
   *  `short` the full text is used, so passing the flag alone changes nothing. */
  seasoned?: boolean;
  /** Mark this tooltip a disclaimer: it auto-shows once on first encounter,
   *  persisted per id. The id must be stable and unique per disclaimer. */
  disclaimer?: string | null | false;
};

/** The text a trigger carries: short when seasoned and a short exists, else full. */
export function tooltipText(
  full?: string | null | false,
  opts?: Pick<TooltipOptions, 'short' | 'seasoned'>,
): string {
  if (opts?.short === SHORT_SAME) return full || '';
  if (opts?.seasoned && opts.short) return opts.short;
  return full || '';
}

/**
 * Spread onto any element to give it the house tooltip.
 * An empty/absent hint spreads to nothing, so `tooltip(maybeText)` is safe.
 *
 * `tooltip(full, { short, seasoned })` picks the short wording for a seasoned
 * person and falls back to `full` when no short text is given.
 */
export function tooltip(
  text?: string | null | false,
  opts?: TooltipOptions,
): {
  'data-tooltip'?: string;
  'data-tooltip-kbd'?: string;
  'data-tooltip-tap'?: string;
  'data-tooltip-disclaimer'?: string;
} {
  const chosen = tooltipText(text, opts);
  if (!chosen) return {};
  return {
    [TOOLTIP_ATTR]: chosen,
    ...(opts?.kbd ? { [TOOLTIP_KBD_ATTR]: opts.kbd } : {}),
    ...(opts?.tap ? { [TOOLTIP_TAP_ATTR]: '' } : {}),
    ...(opts?.disclaimer ? { [TOOLTIP_DISCLAIMER_ATTR]: opts.disclaimer } : {}),
  };
}

type Active = { el: Element; text: string; kbd: string | null };

/**
 * The box itself (placement, rich-text rendering, the portal) is its own chunk:
 * it draws nothing until a tip is open, and most pages never open one in their
 * first seconds. The triggers and the delegated listeners stay here because
 * they are what makes an attribute work at all. `warmTooltipPanel` is called the
 * moment a pointer, a finger or the keyboard reaches a trigger, so the chunk is
 * on its way during the hover dwell (250ms) and the long-press (450ms) and the
 * first tip does not arrive late.
 */
const loadTooltipPanel = () => import('./TooltipPanel.js');
const TooltipPanel = lazy(loadTooltipPanel);
function warmTooltipPanel(): void {
  void loadTooltipPanel().catch(() => {
    /* offline: the lazy component retries when a tip actually opens */
  });
}

/**
 * Mount ONCE, at the app root, inside whatever providers exist (it needs none).
 * Without it every `data-tooltip` is inert - which is why the app's own
 * guardrail test asserts it is mounted.
 */
export function TooltipLayer({
  /** Hover dwell before a tip opens. Long enough that crossing a toolbar stays quiet. */
  openDelayMs = 250,
  /** Press-and-hold on touch before a tip opens. */
  longPressMs = 450,
  /** How long a touch-opened tip stays up with nothing else happening. */
  touchHoldMs = 4000,
}: {
  openDelayMs?: number;
  longPressMs?: number;
  touchHoldMs?: number;
} = {}) {
  const [active, setActive] = useState<Active | null>(null);
  const activeRef = useRef<Active | null>(null);
  /** What the trigger's own `aria-describedby` said before we borrowed it. */
  const describedRef = useRef<string | null>(null);
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /**
   * Set by a mousedown, cleared by the first real pointer MOVE. Acting on a
   * control must not be answered with an explanation of it.
   */
  const actedRef = useRef<{ x: number; y: number } | null>(null);
  /** Last input modality. Only a keyboard-driven focus opens a tip. */
  const keyboardRef = useRef(false);
  const touch = useMediaQuery(TOUCH_QUERY);

  const hide = useCallback(() => {
    if (openTimer.current) {
      clearTimeout(openTimer.current);
      openTimer.current = null;
    }
    const current = activeRef.current;
    if (!current) return;
    if (describedRef.current === null) current.el.removeAttribute('aria-describedby');
    else current.el.setAttribute('aria-describedby', describedRef.current);
    describedRef.current = null;
    activeRef.current = null;
    setActive(null);
  }, []);

  const show = useCallback(
    (el: Element) => {
      const text = el.getAttribute(TOOLTIP_ATTR);
      if (!text) return;
      if (activeRef.current?.el === el && activeRef.current.text === text) return;
      hide();
      warmTooltipPanel();
      describedRef.current = el.getAttribute('aria-describedby');
      el.setAttribute('aria-describedby', TOOLTIP_ID);
      const next = { el, text, kbd: el.getAttribute(TOOLTIP_KBD_ATTR) };
      activeRef.current = next;
      setActive(next);
    },
    [hide],
  );

  /**
   * A modal that opens over a showing tip covers the trigger, and the pointer that raised the tip has not moved, so
   * nothing else would take it down. Focus usually moves into a modal and clears the tip that way, but not always.
   * A modal that holds the trigger itself leaves it up.
   */
  const clearTipUnderModal = useCallback(
    (records: MutationRecord[]) => {
      const current = activeRef.current;
      if (!current) return;
      for (const record of Array.from(records)) {
        for (const node of Array.from(record.addedNodes)) {
          if (!(node instanceof Element)) continue;
          const modals = node.matches(MODAL_SELECTOR) ? [node] : Array.from(node.querySelectorAll(MODAL_SELECTOR));
          if (modals.some((modal) => !modal.contains(current.el))) {
            hide();
            return;
          }
        }
      }
    },
    [hide],
  );

  /* ------------------------------------------------ disclaimer: first encounter */
  useEffect(() => {
    if (typeof document === 'undefined') return;
    let holdTimer: ReturnType<typeof setTimeout> | null = null;
    const sel = `[${TOOLTIP_ATTR}][${TOOLTIP_DISCLAIMER_ATTR}]`;
    const scan = () => {
      if (activeRef.current) return;
      for (const el of Array.from(document.querySelectorAll(sel))) {
        const id = el.getAttribute(TOOLTIP_DISCLAIMER_ATTR);
        if (!id || tooltipSeen(id)) continue;
        // Behind an open modal it waits, unseen: the modal's removal is a DOM change, so the scan runs again then.
        if (coveredByModal(el)) continue;
        // In a collapsed section it waits the same way: opening the section changes a class or style, which the observer watches.
        if (!onScreen(el)) continue;
        markTooltipSeen(id);
        show(el);
        if (holdTimer) clearTimeout(holdTimer);
        // Not hover-driven, so it needs its own way out: it leaves after the hold
        // time, or sooner on any of the layer's usual closers (Escape, scroll, blur).
        holdTimer = setTimeout(() => {
          if (activeRef.current?.el === el) hide();
        }, touchHoldMs);
        break;
      }
    };
    scan();
    if (typeof MutationObserver === 'undefined') return;
    const mo = new MutationObserver((records) => {
      clearTipUnderModal(records);
      scan();
    });
    // Attributes too: a section opening is a class or style change, not a new node.
    mo.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'hidden'],
    });
    return () => {
      mo.disconnect();
      if (holdTimer) clearTimeout(holdTimer);
    };
  }, [show, hide, touchHoldMs, clearTipUnderModal]);

  /* ------------------------------------------------- pointer / keyboard events */
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const doc = document;

    const triggerFor = (target: EventTarget | null): Element | null =>
      target instanceof Element ? target.closest(TOOLTIP_SELECTOR) : null;

    const onKeyDown = (e: KeyboardEvent) => {
      keyboardRef.current = true;
      if (e.key === 'Escape') hide();
    };
    /**
     * Only KEYBOARD focus opens a tip. A mouse click focuses the button too,
     * and opening on that put a hint over the control the user had just used,
     * where it sat until focus moved.
     *
     * The modality is tracked here rather than delegated to `:focus-visible`
     * because the pseudo-class is not observable under jsdom - `matches()`
     * answers false for a genuinely focused element - so the gate would have
     * shipped with its keyboard path untested, which is the half that matters
     * for accessibility. This is the same heuristic the `:focus-visible`
     * polyfills use: a key press means keyboard, a press means pointer.
     */
    const onFocusIn = (e: FocusEvent) => {
      const el = triggerFor(e.target);
      if (el) warmTooltipPanel();
      // Keyboard focus is deliberate, so it opens with no dwell.
      if (el && keyboardRef.current) show(el);
      // A tap on a tap-enabled trigger (an InfoTip is focusable) opens its tip on touchstart and THEN the
      // browser focuses it: that focus is the same tap, not a reason to close what it just opened.
      else if (el?.hasAttribute(TOOLTIP_TAP_ATTR) && activeRef.current?.el === el) return;
      else hide();
    };
    const onFocusOut = () => hide();

    doc.addEventListener('keydown', onKeyDown);
    doc.addEventListener('focusin', onFocusIn);
    doc.addEventListener('focusout', onFocusOut);

    /**
     * Hover, on pointer devices only. `isTouchPrimary` decides which modality
     * gets listeners at all: a tap synthesises `mouseover`, so leaving the
     * hover path installed on a phone would make every tap raise a tip over
     * the thing it was meant to explain.
     */
    const onMouseOver = (e: MouseEvent) => {
      const el = triggerFor(e.target);
      if (!el) {
        hide();
        return;
      }
      warmTooltipPanel();
      if (activeRef.current?.el === el) return;
      // The pointer has not moved since it acted on something. Acting on a
      // control re-renders it more often than not, so this `mouseover` is the
      // browser noticing a NEW node under a stationary cursor - not a request.
      if (actedRef.current) return;
      if (openTimer.current) clearTimeout(openTimer.current);
      openTimer.current = setTimeout(() => show(el), openDelayMs);
    };
    const onMouseOut = (e: MouseEvent) => {
      const el = triggerFor(e.target);
      if (!el) return;
      const to = e.relatedTarget;
      // Moving to a child of the same trigger is not leaving it.
      if (to instanceof Node && el.contains(to)) return;
      hide();
    };
    // Acting on a control dismisses its explanation, and keeps it dismissed
    // until the pointer says otherwise by moving.
    const onMouseDown = (e: MouseEvent) => {
      keyboardRef.current = false;
      actedRef.current = { x: e.clientX, y: e.clientY };
      hide();
    };
    const onMouseMove = (e: MouseEvent) => {
      const acted = actedRef.current;
      if (!acted) return;
      // A few pixels of jitter is a resting hand, not a new question.
      if (Math.abs(e.clientX - acted.x) > 8 || Math.abs(e.clientY - acted.y) > 8) {
        actedRef.current = null;
      }
    };

    /**
     * Touch: press and hold. `fired` is what makes the press that opened a tip
     * swallow its own click - otherwise reading the hint on a Dismiss button
     * would also dismiss the row.
     */
    let pressTimer: ReturnType<typeof setTimeout> | null = null;
    let holdTimer: ReturnType<typeof setTimeout> | null = null;
    let fired = false;
    let startX = 0;
    let startY = 0;
    const clearPress = () => {
      if (pressTimer) clearTimeout(pressTimer);
      pressTimer = null;
    };
    const onTouchStart = (e: TouchEvent) => {
      keyboardRef.current = false;
      const wasOpenOn = activeRef.current?.el ?? null;
      hide();
      fired = false;
      const el = triggerFor(e.target);
      const point = e.touches[0];
      if (!el || !point) return;
      warmTooltipPanel();
      startX = point.clientX;
      startY = point.clientY;
      clearPress();
      const open = () => {
        fired = true;
        show(el);
        if (holdTimer) clearTimeout(holdTimer);
        holdTimer = setTimeout(hide, touchHoldMs);
      };
      // A trigger that exists only to carry the hint opens on the tap itself.
      // `fired` is set here as well, so the tap that opened it is still
      // swallowed rather than falling through to whatever sits underneath.
      if (el.hasAttribute(TOOLTIP_TAP_ATTR)) {
        // A second tap on the trigger that is already showing its tip CLOSES it
        // (tap toggles); the tap is still swallowed.
        if (wasOpenOn === el) {
          fired = true;
          return;
        }
        open();
        return;
      }
      pressTimer = setTimeout(open, longPressMs);
    };
    const onTouchMove = (e: TouchEvent) => {
      const point = e.touches[0];
      if (!point) return;
      if (Math.abs(point.clientX - startX) > 10 || Math.abs(point.clientY - startY) > 10) {
        clearPress();
        // A scroll that started on a trigger is a scroll, not a read.
        if (!fired) hide();
      }
    };
    const onTouchEnd = () => clearPress();
    const onClickCapture = (e: MouseEvent) => {
      if (!fired) return;
      fired = false;
      e.preventDefault();
      e.stopPropagation();
    };
    const onContextMenu = (e: Event) => {
      // The OS callout would land on top of the tip the same press opened.
      if (fired) e.preventDefault();
    };

    if (touch) {
      doc.addEventListener('touchstart', onTouchStart, { passive: true });
      doc.addEventListener('touchmove', onTouchMove, { passive: true });
      doc.addEventListener('touchend', onTouchEnd);
      doc.addEventListener('touchcancel', onTouchEnd);
      doc.addEventListener('click', onClickCapture, true);
      doc.addEventListener('contextmenu', onContextMenu);
    } else {
      doc.addEventListener('mouseover', onMouseOver);
      doc.addEventListener('mouseout', onMouseOut);
      doc.addEventListener('mousedown', onMouseDown);
      doc.addEventListener('mousemove', onMouseMove);
    }

    return () => {
      doc.removeEventListener('keydown', onKeyDown);
      doc.removeEventListener('focusin', onFocusIn);
      doc.removeEventListener('focusout', onFocusOut);
      doc.removeEventListener('touchstart', onTouchStart);
      doc.removeEventListener('touchmove', onTouchMove);
      doc.removeEventListener('touchend', onTouchEnd);
      doc.removeEventListener('touchcancel', onTouchEnd);
      doc.removeEventListener('click', onClickCapture, true);
      doc.removeEventListener('contextmenu', onContextMenu);
      doc.removeEventListener('mouseover', onMouseOver);
      doc.removeEventListener('mouseout', onMouseOut);
      doc.removeEventListener('mousedown', onMouseDown);
      doc.removeEventListener('mousemove', onMouseMove);
      actedRef.current = null;
      clearPress();
      if (holdTimer) clearTimeout(holdTimer);
      hide();
    };
  }, [touch, openDelayMs, longPressMs, touchHoldMs, show, hide]);

  if (!active || typeof document === 'undefined') return null;

  return (
    <Suspense fallback={null}>
      <TooltipPanel active={active} hide={hide} />
    </Suspense>
  );
}
