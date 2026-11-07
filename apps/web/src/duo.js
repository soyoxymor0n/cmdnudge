/* cmdnudge.com, "Two keyboards": a Windows laptop (work) and a MacBook (home) open their
   lids as the visitor scrolls, the PC a little ahead, then one 28-second scene plays on
   both: the same plan open on each screen, the same hands at each keyboard. Ctrl+C copies
   at work and does nothing at home until the corner card says ⌘C; Win+Shift+S snips at
   work and gets ⇧⌘4 at home; weeks later ⌘C comes without a card, and the cmdnudge menu
   shows Copy mastered.

   The laptops, the lid physics and the scene engine come from devdash.eu/welcome
   (dev-dashboard/landing/duo.js). The screens are drawings: at this size real apps would
   be unreadable, and the beats have to land to the tenth of a second. The card copies the
   app's own wording (engine.rs toast_for, library.json).

   The scene is declarative. Every moving thing carries its own timing in data-*:
     data-on="a" | "a-b"   class .on while a <= t < b
     data-kf "t:v t:v ..." eased into --v
     data-st="t:state ..." data-state = the last state reached
   render(t) applies all of it, so any second of the scene can be shown at once (the step
   chips jump, reduced motion shows a still). */
(() => {
  'use strict';
  const root = document.getElementById('duo');
  if (!root) return;

  const RM = matchMedia('(prefers-reduced-motion: reduce)');
  const NARROW = matchMedia('(max-width: 900px)');
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const smooth = (a, b, v) => { const x = clamp((v - a) / (b - a), 0, 1); return x * x * (3 - 2 * x); };

  const DUR = 28; // seconds, then it starts over
  const STILL = 10; // the frame reduced motion shows: the card answering Ctrl+C

  const STEPS = [
    { at: 0, t: 'Two desks', d: 'The PC at work and the MacBook at home. The same plan open on both, the same hands at both keyboards.' },
    { at: 2, t: 'Ctrl+C at work', d: 'On Windows, Ctrl+C copies the line and Ctrl+V pastes it. Twenty years of practice, no thought involved.' },
    { at: 7.4, t: 'Ctrl+C at home', d: 'On the Mac the same hands press Ctrl+C and nothing happens. cmdnudge shows ⌘C in the corner, right then, and ⌘C works.' },
    { at: 14.4, t: 'The screenshot', d: 'Win+Shift+S cuts out part of the screen at work. At home the corner says ⇧⌘4, and the crosshair is up before you would have looked it up.' },
    { at: 22.6, t: 'Weeks later', d: '⌘C, no card. cmdnudge counted it on this Mac: ten right presses and two weeks without a slip, and that hint goes quiet.' },
  ];

  // ------------------------------------------------------------ small builders
  const on = (a, b) => ' data-on="' + a + (b != null ? '-' + b : '') + '"';
  const keys = (list) => list.map((k) => '<kbd>' + k + '</kbd>').join('');
  const chord = (a, b, list, cls) => '<div class="chord' + (cls ? ' ' + cls : '') + '"' + on(a, b) + '>' + keys(list) + '</div>';

  const TEXT = [
    'The Mac rollout starts in week two. Everyone keeps their files; only the shortcuts move.',
    'Laptops arrive on Monday, set up and signed in.',
    'Training is one hour, and the cheat sheet goes on every desk.',
  ];
  // The document: line 2 gets selected and copied, then pasted at the end.
  function doc({ selOn, pastes, mac }) {
    return '<div class="page"><h4>Q4 plan: moving to Mac</h4>' +
      '<p class="dl">' + TEXT[0] + '</p>' +
      '<p class="dl"><mark' + selOn + '>' + TEXT[1] + '</mark></p>' +
      '<p class="dl">' + TEXT[2] + '</p>' +
      pastes.map((at) => '<p class="dl paste"' + on(at) + '>' + TEXT[1] + '</p>').join('') +
      '</div>';
  }

  const SCREENS = {
    win:
      '<div class="os os-win"><div class="wall"></div>' +
        '<div class="app"><div class="app-bar"><b>W</b><span>Q4 plan.docx · Word</span><span class="wc"><span>–</span><span>□</span><span>✕</span></span></div>' +
          '<div class="ribbon"><span>File</span><b>Home</b><span>Insert</span><span>Layout</span><span>Review</span><span>View</span></div>' +
          doc({ selOn: on(2.1, 4.5), pastes: [4.5] }) +
        '</div>' +
        // Win+Shift+S: the snip overlay, a rectangle dragged out, then the notification.
        '<div class="dim"' + on(14.8, 18.2) + '><div class="snipbar"><i></i><i></i><i></i><i></i></div>' +
          '<div class="sel" data-kf="15.6:0 16.9:100"></div><div class="xh" data-kf="15.6:0 16.9:100"></div></div>' +
        '<div class="note"' + on(18.2, 22.4) + '><b>Snip copied to clipboard</b><span>Select here to mark up and share.</span></div>' +
        '<div class="taskbar"><div class="tb-mid"><span class="start"></span><span class="tb-search">Search</span><span class="ic files"></span><span class="ic web"></span><span class="ic doc on"></span><span class="ic chat"></span></div>' +
          '<div class="tb-r"><span>ENG<br>US</span><span>14:20<br>06/11/2026</span></div></div>' +
      '</div>',
    mac:
      '<div class="os os-mac"><div class="wall"></div>' +
        '<div class="menubar"><b></b><b>Pages</b><span>File</span><span>Edit</span><span>Insert</span><span>Format</span><span>View</span>' +
          '<span class="mb-r"><span class="mb-cn" data-st="0: 25.4:open">⌘</span><span>Thu 19:40</span></span></div>' +
        '<div class="app"><div class="app-bar"><span class="tl"><i></i><i></i><i></i></span><span>Q4 plan</span></div>' +
          '<div class="ribbon"><b>Format</b><span>Document</span><span>Insert</span><span>Share</span></div>' +
          doc({ selOn: on(7.6, 12.2), pastes: [11.9, 24.6], mac: true }) +
        '</div>' +
        // The card: Ctrl+C, then Win+Shift+S.
        '<div class="ct"' + on(8.35, 11.6) + '><div class="r"><span class="f">Ctrl+C</span><span class="a">→</span><span class="t">⌘C</span></div><div class="d">Copy</div></div>' +
        '<div class="ct"' + on(16.75, 20.0) + '><div class="r"><span class="f">Win+Shift+S</span><span class="a">→</span><span class="t">⇧⌘4</span></div><div class="d">Screenshot of an area</div></div>' +
        // ⇧⌘4: the crosshair drags out an area, the thumbnail lands.
        '<div class="dim"' + on(18.5, 20.6) + ' style="background: transparent"><div class="sel" data-kf="18.9:0 20.2:100"></div><div class="xh" data-kf="18.9:0 20.2:100"></div></div>' +
        '<div class="thumb"' + on(20.6, 23.6) + '></div>' +
        // Weeks later: the cmdnudge menu.
        '<div class="pop"' + on(25.4) + '><h5>cmdnudge · this Mac</h5>' +
          '<div class="row"><b>Copy · ⌘C</b><s>mastered</s><u>3 slips, then 41 × ⌘C. Last slip 16 days ago.</u><span class="bar"><i data-kf="25.6:0 26.6:100"></i></span></div>' +
          '<div class="row"><b>Screenshot of an area · ⇧⌘4</b><s class="l">learning</s><u>4 slips, 6 × ⇧⌘4.</u><span class="bar"><i data-kf="25.8:0 26.8:60"></i></span></div>' +
        '</div>' +
        '<div class="dock"><span class="ic files"></span><span class="ic web"></span><span class="ic doc on"></span><span class="ic chat"></span></div>' +
      '</div>',
  };

  const HANDS = {
    win:
      '<div class="hands" aria-hidden="true"><span class="hands-label"><b>At work</b> · Windows</span><div class="chords">' +
        chord(2.6, 3.7, ['Ctrl', 'C']) + chord(4.2, 5.2, ['Ctrl', 'V']) + chord(14.5, 15.7, ['Win', 'Shift', 'S']) +
      '</div></div>',
    mac:
      '<div class="hands" aria-hidden="true"><span class="hands-label"><b>At home</b> · Mac</span><div class="chords">' +
        chord(8.1, 9.3, ['Ctrl', 'C'], 'miss') + chord(10.3, 11.2, ['⌘', 'C']) + chord(11.6, 12.5, ['⌘', 'V']) +
        chord(16.5, 17.7, ['Win', 'Shift', 'S'], 'miss') + chord(18.3, 19.3, ['⇧', '⌘', '4']) +
        chord(23.4, 24.1, ['⌘', 'C']) + chord(24.4, 25.1, ['⌘', 'V']) +
      '</div></div>',
  };

  // ------------------------------------------------------------ build
  const stage = root.querySelector('#duoStage');
  const laps = [...root.querySelectorAll('.lap')].map((el, i) => {
    const host = el.dataset.host;
    const scr = el.querySelector('.scr');
    scr.innerHTML = SCREENS[host];
    el.insertAdjacentHTML('beforeend', HANDS[host]);
    return { el, host, scr, screen: el.querySelector('.lid-screen'), lead: i === 0 ? 0 : 0.14, p: -1 };
  });

  const parsePairs = (s, sep, kv) => s.split(sep).filter(Boolean).map((x) => { const k = x.indexOf(kv); return [+x.slice(0, k), x.slice(k + 1)]; }).sort((a, b) => a[0] - b[0]);
  const items = [];
  laps.forEach((l) => {
    l.el.querySelectorAll('[data-on],[data-kf],[data-st]').forEach((n) => {
      const it = { n, cache: {} };
      const ds = n.dataset;
      if (ds.on) { const [a, b] = ds.on.split('-').map(Number); it.on = [a, isNaN(b) ? Infinity : b]; }
      if (ds.kf) it.kf = parsePairs(ds.kf, ' ', ':').map(([a, b]) => [a, +b]);
      if (ds.st) it.st = parsePairs(ds.st, ' ', ':');
      items.push(it);
    });
  });
  const lastOf = (pairs, t) => { let v = null; for (const [a, b] of pairs) { if (a <= t) v = b; else break; } return v; };
  const ease = (pairs, t) => {
    if (t <= pairs[0][0]) return pairs[0][1];
    for (let i = 1; i < pairs.length; i++) {
      const [a, va] = pairs[i - 1], [b, vb] = pairs[i];
      if (t <= b) return va + (vb - va) * smooth(a, b, t);
    }
    return pairs[pairs.length - 1][1];
  };

  function renderScene(t) {
    for (const it of items) {
      const n = it.n, c = it.cache;
      if (it.on) { const v = t >= it.on[0] && t < it.on[1]; if (c.on !== v) { c.on = v; n.classList.toggle('on', v); } }
      if (it.kf) { const r = Math.round(ease(it.kf, t) * 10) / 10; if (c.v !== r) { c.v = r; n.style.setProperty('--v', r); } }
      if (it.st) { const v = lastOf(it.st, t) || ''; if (c.st !== v) { c.st = v; n.dataset.state = v; } }
    }
  }

  // ------------------------------------------------------------ step chips
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const stepsEl = root.querySelector('#duoSteps');
  const capEl = root.querySelector('#duoCap');
  stepsEl.innerHTML = STEPS.map((s, i) =>
    '<li><button type="button" data-i="' + i + '"><span class="n">0' + (i + 1) + '</span><span class="t">' + esc(s.t) + '</span><i><b></b></i></button></li>').join('');
  const chips = [...stepsEl.querySelectorAll('button')];
  let curStep = -1;
  function renderSteps(t) {
    let i = 0;
    for (let k = 0; k < STEPS.length; k++) if (t >= STEPS[k].at) i = k;
    const end = i + 1 < STEPS.length ? STEPS[i + 1].at : DUR;
    chips.forEach((b, k) => b.style.setProperty('--f', k < i ? 1 : k > i ? 0 : clamp((t - STEPS[i].at) / (end - STEPS[i].at), 0, 1)));
    if (i !== curStep) {
      curStep = i;
      chips.forEach((b, k) => { b.classList.toggle('is-on', k === i); b.setAttribute('aria-pressed', k === i ? 'true' : 'false'); });
      capEl.textContent = STEPS[i].d;
      // On a phone the chips are a scrolling strip: keep the playing one in view.
      if (stepsEl.scrollWidth > stepsEl.clientWidth + 2) stepsEl.scrollTo({ left: Math.max(0, chips[i].parentNode.offsetLeft - 16), behavior: RM.matches ? 'auto' : 'smooth' });
    }
  }

  // ------------------------------------------------------------ lids
  function setLap(l, p) {
    if (Math.abs(p - l.p) < 0.0005) return;
    l.p = p;
    // Seen from hinge height a lid looks nearly open at 45 degrees, so the angle starts
    // slow and the visible height grows about evenly with the scroll.
    const e = Math.pow(p, 1.55);
    const s = l.el.style;
    s.setProperty('--a', (-90 + 98 * e).toFixed(2) + 'deg');
    s.setProperty('--p', p.toFixed(3));
    // The keyboard's light spills out while the gap is opening, then settles low.
    s.setProperty('--kb', (smooth(0.06, 0.42, p) * (1 - 0.62 * smooth(0.55, 1, p))).toFixed(3));
    l.el.classList.toggle('is-shut', p < 0.004);
    l.el.classList.toggle('is-on', p > 0.88);
  }

  function lidProgress() {
    if (RM.matches) return 1;
    const vh = innerHeight;
    if (NARROW.matches) {
      const r = stage.getBoundingClientRect();
      return clamp((vh * 0.92 - r.top) / (vh * 0.55), 0, 1.2);
    }
    const r = root.getBoundingClientRect();
    return clamp((vh * 0.6 - r.top) / (vh * 0.95), 0, 1.2);
  }

  // ------------------------------------------------------------ playback
  let t = 0, last = 0, inView = false, raf = 0, held = -1;

  function frame(now) {
    raf = 0;
    const q = lidProgress();
    const pL = smooth(0, 0.78, q), pR = smooth(laps[1].lead, 0.92, q);
    setLap(laps[0], pL); setLap(laps[1], pR);
    root.style.setProperty('--q', smooth(0, 0.9, q).toFixed(3));
    const open = pL > 0.97 && pR > 0.97;
    if (!RM.matches) {
      if (!open && pL < 0.4) { t = 0; held = -1; }
      if (open && inView && !document.hidden) {
        if (last) t += Math.min(0.1, (now - last) / 1000);
        last = now;
        if (t >= DUR) t -= DUR;
      } else last = 0;
    }
    const tt = RM.matches ? (held >= 0 ? held : STILL) : t;
    renderScene(tt);
    renderSteps(tt);
    if (inView && !RM.matches) raf = requestAnimationFrame(frame);
  }
  const kick = () => { if (!raf) raf = requestAnimationFrame(frame); };

  chips.forEach((b) => b.addEventListener('click', () => {
    const s = STEPS[+b.dataset.i];
    if (RM.matches) held = Math.min(DUR - 0.5, s.at + 3.4);
    else { t = s.at + 0.01; last = 0; }
    kick();
  }));

  // For checking a frame by hand: document.getElementById('duo').seek(10)
  root.seek = (x) => { t = clamp(+x || 0, 0, DUR - 0.01); held = t; last = 0; kick(); };

  // Screens are drawn at 1000 x 625 and scaled to the glass.
  const fitScreens = () => laps.forEach((l) => { const w = l.screen.clientWidth; if (w) l.scr.style.setProperty('--sc', (w / 1000).toFixed(4)); });
  if ('ResizeObserver' in window) { const ro = new ResizeObserver(fitScreens); laps.forEach((l) => ro.observe(l.screen)); }
  fitScreens();

  new IntersectionObserver((es) => {
    inView = es.some((e) => e.isIntersecting);
    if (inView) kick(); else last = 0;
  }, { rootMargin: '10% 0px 10% 0px' }).observe(root);
  addEventListener('scroll', kick, { passive: true });
  addEventListener('resize', kick);
  RM.addEventListener && RM.addEventListener('change', kick);
  document.addEventListener('visibilitychange', () => { last = 0; kick(); });
  kick();
})();
