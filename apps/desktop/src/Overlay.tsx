import { useEffect, useState } from "react";
import { onOverlay, OverlayView } from "./api";

/**
 * The overlay window (#44): the frontmost app's Mac shortcuts, shown while Command is held.
 * The window is transparent and never takes focus; the card is the only thing drawn.
 */
export default function Overlay() {
  const [view, setView] = useState<OverlayView | null>(null);

  useEffect(() => {
    document.documentElement.style.background = "transparent";
    document.body.style.background = "transparent";
    const off = onOverlay(setView);
    return () => {
      void off.then((unlisten) => unlisten());
    };
  }, []);

  if (!view) return null;
  return (
    <div className="overlay-card" role="dialog" aria-label="Mac shortcuts">
      <div className="overlay-head">{view.app} · Mac shortcuts</div>
      {view.rows.length === 0 ? (
        <p className="overlay-empty">No Mac shortcuts in the library for this app yet.</p>
      ) : (
        <ul className="overlay-rows">
          {view.rows.map((r) => (
            <li key={`${r.category}-${r.label}-${r.chord}`}>
              <span>{r.label}</span>
              <kbd>{r.chord}</kbd>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
