/* cmdnudge.com: the glyph field (blueprint packages/ui/src/marketing/fields/glyphField.ts,
   ported to plain JS for this zero-dependency page). Noise drawn as characters fills a
   card; under the pointer it decodes into Mac shortcuts (the card's data-glyph words).
   A click scrambles a ring outward. Without a pointer (touch) the decoded patch drifts
   by itself; under reduced motion the field stands still and only the pointer decodes.

   Ink is the card's own text colour at low alpha, the decoded words take --primary-ink.
   Runs only while the card is on screen; one canvas per [data-glyph]. */
(() => {
  'use strict';
  const hosts = document.querySelectorAll('[data-glyph]');
  if (!hosts.length) return;
  const RM = matchMedia('(prefers-reduced-motion: reduce)');
  const FINE = matchMedia('(hover: hover) and (pointer: fine)');
  const RAMP = ' .·:-=+*%#';
  const ASPECT = 0.72;
  const noise = (x, y, t) => Math.sin(x * 0.011 + t * 0.0003) + Math.sin(y * 0.013 - t * 0.00025) + Math.sin((x + y) * 0.007 + t * 0.0002);

  hosts.forEach((host) => {
    const words = host.dataset.glyph.trim().split(/\s+/);
    const MSG = [...(words.join('·') + '·')];
    const cv = document.createElement('canvas');
    cv.className = 'glyph';
    cv.setAttribute('aria-hidden', 'true');
    host.prepend(cv);
    const c = cv.getContext('2d');
    if (!c) return;

    let w = 0, h = 0, dpr = 1, at = null, scramble = null, raf = 0, inView = false, t0 = performance.now();
    let ink = '#888', accent = '#b6f23a';
    const colours = () => {
      const cs = getComputedStyle(host);
      ink = cs.color;
      accent = getComputedStyle(document.documentElement).getPropertyValue('--primary-ink').trim() || accent;
    };
    const size = () => {
      const r = host.getBoundingClientRect();
      dpr = Math.min(2, devicePixelRatio || 1);
      w = r.width; h = r.height;
      cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
      colours();
      draw(performance.now());
    };

    function draw(now) {
      const t = RM.matches ? 0 : now - t0;
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.clearRect(0, 0, w, h);
      const ch = 15, cw = ch * ASPECT, cols = Math.ceil(w / cw), rows = Math.ceil(h / ch);
      c.font = `500 ${ch - 2}px ui-monospace, SFMono-Regular, Menlo, monospace`;
      c.textBaseline = 'top';
      // Touch has no hover: the decoded patch wanders slowly across the card instead.
      let p = at;
      if (!p && !FINE.matches && !RM.matches) p = { x: w * (0.5 + 0.38 * Math.sin(t * 0.00035)), y: h * (0.35 + 0.2 * Math.cos(t * 0.00027)) };
      const R = 110;
      if (scramble && now - scramble.t > 700) scramble = null;
      const dim = [], mid = [], lit = [];
      for (let j = 0; j < rows; j++) {
        for (let i = 0; i < cols; i++) {
          const x = i * cw, y = j * ch;
          const v = Math.pow((noise(x * 1.4, y * 1.4, t * 1.4) + 3) / 6, 1.35);
          if (scramble) {
            const d = Math.hypot(x - scramble.x, y - scramble.y), rr = (now - scramble.t) * 0.5;
            if (Math.abs(d - rr) < 30) { mid.push(x, y, RAMP[1 + ((Math.random() * (RAMP.length - 1)) | 0)]); continue; }
          }
          const f = p ? 1 - Math.hypot(x - p.x, y - p.y) / R : 0;
          if (f > 0.3) lit.push(x, y, MSG[(i + j * 5) % MSG.length]);
          else {
            const g = RAMP[Math.min(RAMP.length - 1, (v * RAMP.length) | 0)];
            if (g !== ' ') (v > 0.55 || f > 0 ? mid : dim).push(x, y, g);
          }
        }
      }
      const put = (arr, col, al) => { c.fillStyle = col; c.globalAlpha = al; for (let k = 0; k < arr.length; k += 3) c.fillText(arr[k + 2], arr[k], arr[k + 1]); };
      put(dim, ink, 0.22); put(mid, ink, 0.48); put(lit, accent, 1);
      c.globalAlpha = 1;
    }

    const loop = (now) => { raf = 0; draw(now); if (inView && !RM.matches) raf = requestAnimationFrame(loop); };
    const kick = () => { if (!raf) raf = requestAnimationFrame(loop); };

    host.addEventListener('pointermove', (e) => { const r = host.getBoundingClientRect(); at = { x: e.clientX - r.left, y: e.clientY - r.top }; kick(); });
    host.addEventListener('pointerleave', () => { at = null; kick(); });
    host.addEventListener('pointerup', (e) => { const r = host.getBoundingClientRect(); scramble = { x: e.clientX - r.left, y: e.clientY - r.top, t: performance.now() }; kick(); });
    new IntersectionObserver((es) => { inView = es.some((e) => e.isIntersecting); if (inView) kick(); }).observe(host);
    if ('ResizeObserver' in window) new ResizeObserver(size).observe(host);
    addEventListener('theme-changed', () => { colours(); kick(); });
    new MutationObserver(() => { colours(); kick(); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    size();
  });
})();
