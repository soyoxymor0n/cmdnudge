// GENERATED from packages/ui/src/overlay/TooltipPanel.tsx — do not edit here.
// Improve it in the blueprint's packages/ and run `npm run sync` (blueprint skill).
import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { renderTooltipContent } from './tooltipRichText.js';
import { TOOLTIP_ID } from './Tooltip.js';

/**
 * The tooltip BOX: where it sits and what it shows. The listeners that decide
 * WHEN to show one stay in `TooltipLayer` (Tooltip.tsx); this half is loaded
 * on the first hover, focus or long-press of a trigger (see the note above
 * `loadTooltipPanel` there), so the first paint does not carry it.
 *
 * Its placement and close rules are unchanged: centred on the anchor and
 * clamped into the window, a scroll that moves the trigger closes the tip, a
 * trigger unmounted while its tip is up takes the tip with it.
 */

export interface TooltipPanelProps {
  active: { el: Element; text: string; kbd: string | null };
  hide: () => void;
}

export default function TooltipPanel({ active, hide }: TooltipPanelProps) {
  const [style, setStyle] = useState<CSSProperties>({});
  const panelRef = useRef<HTMLDivElement | null>(null);
  /** Where the anchor sat when the tip was last placed - see the scroll handler. */
  const anchorRect = useRef<DOMRect | null>(null);

  useLayoutEffect(() => {
    if (!active || typeof window === 'undefined') return;
    const margin = 8;
    const gap = 6;

    const place = () => {
      const panel = panelRef.current;
      if (!panel) return;
      // A trigger can be unmounted while its tip is up (a row re-renders, a
      // menu closes). Nothing else would ever take the tip down.
      if (!active.el.isConnected) {
        hide();
        return;
      }
      const a = active.el.getBoundingClientRect();
      anchorRect.current = a;
      const p = panel.getBoundingClientRect();

      // Centred on the anchor, then clamped into the window. Clamp the right
      // edge first: if the box is too wide to fit at all, the LEFT edge is the
      // one worth keeping, because that is where the sentence starts.
      /**
       * `clientWidth`, not `innerWidth`: the latter includes the scrollbar
       * gutter, so a tip clamped to it slides under the scrollbar.
       */
      const viewportW = document.documentElement.clientWidth;
      const viewportH = document.documentElement.clientHeight;

      let left = a.left + a.width / 2 - p.width / 2;
      left = Math.min(left, viewportW - margin - p.width);
      left = Math.max(margin, left);

      let top = a.bottom + gap;
      const overflowsBelow = top + p.height > viewportH - margin;
      const fitsAbove = a.top - gap - p.height > margin;
      if (overflowsBelow && fitsAbove) top = a.top - gap - p.height;
      top = Math.max(margin, Math.min(top, viewportH - margin - p.height));

      setStyle({ position: 'fixed', top, left });
    };

    place();

    /**
     * A scroll that MOVES the trigger closes the tip; one that does not, does
     * not. Following the anchor sounds tidier and is worse: a click that also
     * scrolls (a layout toggle scrolling its list into place) drags the trigger
     * up the page, and because a tip deliberately sits above every layer, it
     * rides along and paints over the sticky header. Comparing rects rather
     * than simply closing on any scroll keeps a tip on a STICKY or FIXED
     * trigger - a header control does not move, so its hint should not vanish
     * the moment the page behind it does.
     */
    const onScroll = () => {
      if (!active.el.isConnected) {
        hide();
        return;
      }
      const now = active.el.getBoundingClientRect();
      const moved =
        !anchorRect.current ||
        Math.abs(now.top - anchorRect.current.top) > 1 ||
        Math.abs(now.left - anchorRect.current.left) > 1;
      if (moved) hide();
    };

    // Capture phase: the scroll that moves the trigger is usually an
    // ancestor's, and a scroll event does not bubble.
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', place);
    };
  }, [active, hide]);

  return createPortal(
    <div
      ref={panelRef}
      id={TOOLTIP_ID}
      role="tooltip"
      /* `.tooltip` is the app's control layer (src/index.css) - surface only, so
         a hint looks the same here as in the two hand-placed rich tooltips. */
      className="tooltip tooltip-in"
      /**
       * WIDTH IS THE STYLESHEET'S JOB, never this component's.
       *
       * This used to force `maxWidth: min(20rem, ...)` inline while the
       * `.tooltip` class caps at 16rem - and an inline style always beats a
       * class. So the box was MEASURED at the class's 256px, `left` was
       * computed to fit that, and only then did the inline 320px apply: it grew
       * up to 64px wider than the position it had just been centred at, and ran
       * off the right edge of the window (reported 2026-08-28 with a screenshot).
       *
       * Placement measures whatever width the page's own design decided, so the
       * two can no longer disagree. Small screens are the class's job too - the
       * house `.tooltip` is `min(16rem, calc(100vw - 2rem))` - and the control
       * layer contract test is what guarantees the class exists at all.
       */
      style={{
        ...style,
        // Never under the cursor: a tooltip that took the pointer would
        // un-hover the thing it explains and flicker.
        pointerEvents: 'none',
      }}
    >
      {renderTooltipContent(active.text)}
      {active.kbd ? <kbd className="tooltip-kbd">{active.kbd}</kbd> : null}
    </div>,
    document.body,
  );
}
