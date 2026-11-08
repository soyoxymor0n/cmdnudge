// cmdnudge.com. Everything that shows a shortcut here runs the app's own library.json and
// chord rules (chord.mjs), copied in at build time. No framework, no tracking.
import { arrive, formatMac, formatWin, matches, normalize } from '/chord.mjs';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const wide = () => matchMedia('(min-width: 980px)').matches;

/* ---------------------------------------------------------------- theme (standard) */
const themeMq = matchMedia('(prefers-color-scheme: dark)');
function savedTheme() {
  try { return localStorage.getItem('theme') || 'system'; } catch { return 'system'; }
}
function applyTheme(saved) {
  const dark = saved === 'dark' || (saved === 'system' && themeMq.matches);
  const r = document.documentElement;
  r.classList.toggle('dark', dark);
  r.setAttribute('data-theme', dark ? 'dark' : 'light');
  window.dispatchEvent(new Event('theme-changed'));
}
themeMq.addEventListener('change', () => { if (savedTheme() === 'system') applyTheme('system'); });
$$('[data-theme-toggle]').forEach((b) =>
  b.addEventListener('click', () => {
    const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem('theme', next); } catch {}
    applyTheme(next);
  }),
);

/* ---------------------------------------------------------------- reveal, header, rail */
const io = new IntersectionObserver(
  (es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); } }),
  { rootMargin: '0px 0px -8% 0px' },
);
$$('.reveal').forEach((el) => io.observe(el));

const topbar = $('#topbar');
const logo = $('#logo');
const hero = $('.hero');
function onScroll() {
  const past = scrollY > hero.offsetHeight - 80;
  topbar.classList.toggle('is-in', past);
  logo.classList.toggle('can-top', scrollY > 600);
}
addEventListener('scroll', onScroll, { passive: true });
onScroll();
logo.addEventListener('click', (e) => { e.preventDefault(); scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' }); });

const rail = $('#rail');
const railSecs = $$('[data-rail]');
railSecs.forEach((s) => {
  if (!s.id) s.id = 'start';
  const a = document.createElement('a');
  a.href = '#' + s.id;
  a.innerHTML = `<span>${s.dataset.rail}</span><i></i>`;
  rail.append(a);
});
const railLinks = $$('a', rail);
const navLinks = $$('.topnav a');
function railUpdate() {
  const mid = innerHeight * 0.45;
  let on = 0;
  railSecs.forEach((s, i) => { if (s.getBoundingClientRect().top < mid) on = i; });
  railLinks.forEach((a, i) => { a.classList.toggle('is-on', i === on); a.classList.toggle('is-past', i < on); });
  navLinks.forEach((a) => a.classList.toggle('is-on', a.getAttribute('href') === '#' + railSecs[on].id));
}
addEventListener('scroll', railUpdate, { passive: true });
railUpdate();

/* ---------------------------------------------------------------- the field: drifting modifier glyphs */
(function field() {
  const c = $('#field');
  const ctx = c.getContext('2d');
  const glyphs = ['⌘', '⌥', '⌃', '⇧', '⌘', '⌥', '⌘', 'Ctrl', '⌃', '⌘', '⌥', 'Alt'];
  let marks = [], w = 0, h = 0, ink = '180,200,255', dpr = 1;
  const readInk = () => { ink = getComputedStyle(document.documentElement).getPropertyValue('--field-ink').trim() || ink; };
  function size() {
    dpr = Math.min(devicePixelRatio || 1, 2);
    w = innerWidth; h = innerHeight;
    c.width = w * dpr; c.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const n = Math.round(Math.min(34, (w * h) / 40000));
    marks = Array.from({ length: n }, (_, i) => ({
      g: glyphs[i % glyphs.length], x: Math.random() * w, y: Math.random() * h,
      s: 11 + Math.random() * 16, a: 0.025 + Math.random() * 0.05, v: 0.08 + Math.random() * 0.22, z: 0.3 + Math.random() * 0.9,
    }));
  }
  let mx = 0, my = 0;
  addEventListener('pointermove', (e) => { mx = (e.clientX / w - 0.5) * 2; my = (e.clientY / h - 0.5) * 2; }, { passive: true });
  function draw() {
    ctx.clearRect(0, 0, w, h);
    const sy = scrollY;
    for (const m of marks) {
      const y = (((m.y - sy * 0.12 * m.z) % (h + 60)) + h + 60) % (h + 60) - 30;
      ctx.font = `600 ${m.s}px Inter, system-ui, sans-serif`;
      ctx.fillStyle = `rgba(${ink},${m.a})`;
      ctx.fillText(m.g, m.x + mx * 10 * m.z, y + my * 8 * m.z);
      if (!reduce) m.x += m.v * 0.25 * m.z, (m.x > w + 40) && (m.x = -40);
    }
    if (!reduce) requestAnimationFrame(draw);
  }
  readInk(); size();
  addEventListener('resize', size);
  addEventListener('theme-changed', () => { readInk(); if (reduce) draw(); });
  if (reduce) addEventListener('scroll', () => requestAnimationFrame(draw), { passive: true });
  draw();
})();

/* ---------------------------------------------------------------- the statement, word by word */
(function statement() {
  const el = $('#statementText');
  const hot = new Set(['@', 'quit', 'again.', 'slipping.']);
  el.innerHTML = el.textContent.split(/\s+/).map((w) => `<span class="w${hot.has(w) ? ' hot' : ''}">${w}</span>`).join(' ');
  const words = $$('.w', el);
  function update() {
    const r = el.getBoundingClientRect();
    const p = Math.min(1, Math.max(0, (innerHeight * 0.85 - r.top) / (r.height + innerHeight * 0.35)));
    const n = Math.round(p * words.length);
    words.forEach((w, i) => w.classList.toggle('is-on', i < n));
  }
  if (!reduce) { addEventListener('scroll', update, { passive: true }); update(); }
})();

/* ---------------------------------------------------------------- library + matcher (mirrors matcher.rs) */
const lib = await fetch('/library.json').then((r) => r.json());
const habitById = new Map(lib.habits.map((h) => [h.id, h]));
const actionLabel = (id) => lib.actions.find((a) => a.id === id)?.label ?? '';
const family = (id) => lib.appFamilies.find((f) => f.id === id);

function evaluate(ctx, pressed) {
  const fam = family(ctx.family);
  const exclusion = fam?.exclude ?? 'none';
  if (exclusion === 'all') return { kind: 'quiet' };
  const applies = (r) => r.layout === ctx.layout && r.keyboard === ctx.keyboard
    && (exclusion === 'none' || r.category === 'typing' || r.guard) && matches(r.arrives, pressed);
  const rule = lib.habitRules.find((r) => r.family === ctx.family && applies(r))
    || lib.habitRules.find((r) => r.family === 'system' && applies(r));
  if (rule) return { kind: 'habit', rule };
  if (exclusion !== 'none') return { kind: 'quiet' };
  const way = lib.macWays.find((w) => (w.family === ctx.family || w.family === 'system') && w.layouts.includes(ctx.layout) && matches(w.chord, pressed));
  return way ? { kind: 'correct', action: way.action, chord: way.chord } : { kind: 'none' };
}

/** Same words as engine.rs toast_for. */
function toastFor(rule, app, guardOn = true) {
  const label = actionLabel(rule.action);
  const mac = formatMac(rule.mac[0]);
  if (rule.guard && guardOn) {
    const pressed = formatMac(rule.arrives.replace(/[lr]cmd/, 'cmd'));
    return { from: `Blocked ${pressed}`, to: rule.arrives.endsWith('+q') ? `would quit ${app}` : `in ${app}`, detail: `For ${label} press ${mac}`, style: 'guard' };
  }
  return { from: formatWin(rule.windows), to: mac, detail: label, style: 'hint' };
}

function showToast(el, t) {
  el.classList.remove('is-guard', 'is-correct', 'is-quiet');
  if (t.style !== 'hint') el.classList.add('is-' + t.style);
  $('.t-from', el).textContent = t.from;
  $('.t-arrow', el).textContent = t.style === 'guard' ? '·' : t.style === 'correct' ? '' : '→';
  $('.t-to', el).textContent = t.to;
  $('.t-detail', el).textContent = t.detail;
  el.classList.remove('is-on');
  void el.offsetWidth;
  el.classList.add('is-on');
}

/* ---------------------------------------------------------------- marquee from the library */
(function marquee() {
  const pick = lib.habits.filter((h) => h.family === 'system' || h.family === 'browser').slice(0, 30);
  const html = pick.map((h) => `<span><b>${formatWin(h.windows)}</b>${formatMac(h.mac[0])}</span>`).join('');
  $('#marquee').innerHTML = html + html.replaceAll('<span>', '<span aria-hidden="true">');
})();

/* ---------------------------------------------------------------- hero: a scripted minute at the Mac */
(function heroScene() {
  const screen = $('#heroScreen');
  const toast = $('#heroToast');
  const keysEl = $('#heroKeys');
  const cap = $('#heroCaption');
  const sel = $('#heroSel');
  const type = $('#heroType');
  const ctx = { layout: 'de', keyboard: 'apple', family: 'chat' };
  const rule = (id) => lib.habitRules.find((r) => r.habit === id && r.layout === ctx.layout && r.keyboard === ctx.keyboard);
  const WIN = { ctrl: 'Ctrl', win: 'Win', alt: 'Alt', altgr: 'AltGr', shift: 'Shift' };
  const capKeys = (chord, cls = 'is-down') => {
    const parts = chord.split('+');
    keysEl.innerHTML = parts.map((p) => `<span class="key ${cls}">${WIN[p] ?? formatWin(p)}</span>`).join('<span class="plus">+</span>');
  };
  const macKeys = (chord) => {
    const sym = formatMac(chord);
    keysEl.innerHTML = [...sym].map((s) => `<span class="key is-mac">${s}</span>`).join('<span class="plus">+</span>');
  };
  const say = (t) => (cap.textContent = t);
  async function typeText(s) { for (const ch of s) { type.textContent += ch; await sleep(55 + Math.random() * 60); } }

  const scenes = [
    async () => {
      sel.classList.add('is-sel');
      await sleep(500);
      const r = rule('copy');
      capKeys(r.windows);
      say(`Your hands: ${formatWin(r.windows)}. Your Mac: ${formatMac(r.arrives)}, which copies nothing.`);
      await sleep(350);
      showToast(toast, toastFor(r, 'Chat'));
      await sleep(2600);
      sel.classList.remove('is-sel');
    },
    async () => {
      const r = rule('snip');
      capKeys(r.windows);
      say(`${formatWin(r.windows)} for a quick screenshot? On a Mac it is ${formatMac(r.mac[0])}.`);
      await sleep(350);
      showToast(toast, toastFor(r, 'Chat'));
      const shot = $('#heroShot');
      Object.assign(shot.style, { left: '30%', top: '30%', width: '0', height: '0' });
      await sleep(900);
      macKeys(r.mac[0]);
      shot.classList.add('is-on');
      shot.animate([{ width: '0%', height: '0%' }, { width: '40%', height: '30%' }], { duration: 900, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'forwards' });
      await sleep(1700);
      shot.classList.remove('is-on');
    },
    async () => {
      type.textContent = '';
      keysEl.innerHTML = '';
      say('Typing a reply…');
      await typeText('Done! Thanks ');
      const r = rule('at-sign');
      capKeys(r.windows, 'is-bad');
      say(`AltGr+Q for @. On an Apple keyboard that is right ⌘Q: quit.`);
      await sleep(400);
      showToast(toast, toastFor(r, 'Chat'));
      screen.classList.add('is-ping');
      await sleep(1900);
      screen.classList.remove('is-ping');
      macKeys(r.mac[0]);
      say(`Chat stays open. ${formatMac(r.mac[0])} types the @.`);
      await sleep(300);
      await typeText('@Anna');
      await sleep(1400);
    },
    async () => {
      const r = rule('undo');
      capKeys(r.windows);
      say(`Undo, the Windows way. One more time.`);
      await sleep(350);
      showToast(toast, toastFor(r, 'Chat'));
      await sleep(900);
      macKeys(r.mac[0]);
      for (let i = 0; i < 5; i++) { type.textContent = type.textContent.slice(0, -1); await sleep(70); }
      await sleep(1500);
    },
  ];

  if (reduce) {
    const r = rule('copy');
    sel.classList.add('is-sel');
    capKeys(r.windows);
    showToast(toast, toastFor(r, 'Chat'));
    say(`Your hands: ${formatWin(r.windows)}. cmdnudge: ${formatMac(r.mac[0])}.`);
    return;
  }
  let visible = false, running = false;
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible && !running) loop(); }, { threshold: 0.2 }).observe(screen);
  async function loop() {
    running = true;
    let i = 0;
    await sleep(1300);
    while (visible) {
      await scenes[i % scenes.length]();
      toast.classList.remove('is-on');
      await sleep(700);
      i++;
      if (i % scenes.length === 0) { type.textContent = ''; }
    }
    running = false;
  }
})();

/* ---------------------------------------------------------------- the trap: one key, two meanings */
(function trap() {
  const stage = $('#trapStage');
  const svg = $('#trapWires');
  const out = $('#trapOut');
  const items = $$('#trapSteps li');
  const k = (n) => $(`[data-k="${n}"]`, stage);
  const pairs = [['pc-ctrl', 'mac-ctrl'], ['pc-win', 'mac-opt'], ['pc-alt', 'mac-cmd'], ['pc-altgr', 'mac-rcmd']];
  function wires() {
    const box = svg.getBoundingClientRect();
    svg.setAttribute('viewBox', `0 0 ${box.width} ${box.height}`);
    svg.innerHTML = pairs.map(([a, b]) => {
      const ra = k(a).getBoundingClientRect(), rb = k(b).getBoundingClientRect();
      const x1 = ra.left + ra.width / 2 - box.left, x2 = rb.left + rb.width / 2 - box.left, h = box.height;
      return `<path data-w="${a}" d="M${x1},2 C${x1},${h / 2} ${x2},${h / 2} ${x2},${h - 2}"/>`;
    }).join('');
  }
  const rule = lib.habitRules.find((r) => r.id === 'at-sign:at:apple');
  function set(step) {
    stage.dataset.step = step;
    $$('.key', stage).forEach((el) => el.classList.remove('is-down', 'is-bad', 'is-mac', 'is-dim'));
    $$('path', svg).forEach((p) => p.classList.remove('is-hot', 'is-mac'));
    items.forEach((li) => li.classList.toggle('is-on', +li.dataset.step === step));
    const wire = $('path[data-w="pc-altgr"]', svg);
    out.innerHTML = '';
    if (step === 1) {
      k('pc-altgr').classList.add('is-down'); k('q').classList.add('is-down');
      out.innerHTML = '<span class="verdict at">@</span>';
    } else if (step === 2) {
      k('pc-altgr').classList.add('is-down'); k('mac-rcmd').classList.add('is-bad'); k('q').classList.add('is-bad');
      wire?.classList.add('is-hot');
      out.innerHTML = '<span class="verdict bad">right ⌘Q · Chat quits. Your draft is gone.</span>';
    } else if (step === 3) {
      k('mac-rcmd').classList.add('is-dim'); k('mac-opt').classList.add('is-mac'); k('l').classList.add('is-mac');
      wire?.classList.add('is-hot');
      out.innerHTML = '<div class="toast is-on"><div class="t-row"><span class="t-from"></span><span class="t-arrow"></span><span class="t-to"></span></div><div class="t-detail"></div></div>';
      showToast($('.toast', out), toastFor(rule, 'Chat'));
    } else if (step === 4) {
      k('mac-cmd').classList.add('is-down'); k('q').classList.add('is-down');
      out.innerHTML = '<span class="verdict">Left ⌘Q: quits, because you meant it.</span>';
    }
  }
  wires();
  addEventListener('resize', wires);
  addEventListener('load', wires);
  document.fonts?.ready.then(wires);
  set(0);
  // Wide: the steps scroll past a pinned stage. Narrow: no pinned travel, the stage plays the steps itself.
  const stepIo = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting && wide()) set(+e.target.dataset.step); }), { rootMargin: '-45% 0px -45% 0px' });
  items.forEach((li) => stepIo.observe(li));
  let timer = null;
  new IntersectionObserver(([e]) => {
    clearInterval(timer);
    if (e.isIntersecting && !wide()) {
      let s = +stage.dataset.step || 0;
      if (reduce) return set(3);
      set((s % 4) + 1);
      timer = setInterval(() => { s = (+stage.dataset.step % 4) + 1; set(s); }, 3200);
    }
  }, { threshold: 0.5 }).observe(stage);
})();

/* ---------------------------------------------------------------- how: the bars go down */
(function bars() {
  const row = $('#howBars');
  const vals = [92, 84, 88, 70, 64, 58, 61, 44, 38, 30, 26, 18, 12, 8];
  row.innerHTML = vals.map(() => '<i></i>').join('');
  new IntersectionObserver(([e], o) => {
    if (!e.isIntersecting) return;
    $$('i', row).forEach((b, i) => setTimeout(() => (b.style.height = vals[i] + '%'), reduce ? 0 : i * 60));
    o.disconnect();
  }, { threshold: 0.4 }).observe(row);
})();

/* ---------------------------------------------------------------- playground + habit map share one context */
const lang = (navigator.language || 'en').toLowerCase();
/** Browser language -> the layout people with that language most likely use. */
function guessLayout(l) {
  const by = [[/^de-ch/, 'ch-de'], [/^fr-ch/, 'ch-fr'], [/^(fr|nl)-be/, 'be'], [/^de/, 'de'], [/^fr/, 'fr'], [/^en-(gb|ie)/, 'uk'],
    [/^es/, 'es'], [/^it/, 'it'], [/^pt-pt/, 'pt'], [/^(sv|fi)/, 'se'], [/^(nb|nn|no)/, 'no'], [/^da/, 'dk'], [/^pl/, 'pl'], [/^cs/, 'cz'], [/^hu/, 'hu']];
  return by.find(([re]) => re.test(l))?.[1] ?? 'us';
}
const state = {
  keyboard: 'apple',
  layout: guessLayout(lang),
  family: 'system',
  first: null,
};
const LAYOUT_NAME = Object.fromEntries(lib.layoutInfo.map((l) => [l.id, l.label]));
const layoutSel = $('#layoutSel');
layoutSel.innerHTML = lib.layoutInfo.filter((l) => l.id !== 'other').map((l) => `<option value="${l.id}">${l.label}</option>`).join('');
layoutSel.value = state.layout;
layoutSel.addEventListener('change', () => { state.layout = layoutSel.value; segs(); chips(); renderMap(); layTiles(); });

/* ---------------------------------------------------------------- layouts (#36): one tile per layout, from the library */
const layGrid = $('#layGrid');
const htmlEsc = (x) => String(x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
function layTiles() {
  if (!layGrid) return;
  if (!layGrid.childElementCount) {
    const label = Object.fromEntries(lib.habits.map((h) => [h.id, h.label]));
    const typing = lib.habitRules.filter((r) => r.category === 'typing' && r.keyboard === 'apple');
    layGrid.innerHTML = lib.layoutInfo.filter((l) => l.id !== 'other').map((l) => {
      const rs = typing.filter((r) => r.layout === l.id);
      const chars = rs.slice(0, 6).map((r) => `<span>${htmlEsc(label[r.habit])}</span>`).join('');
      const ex = rs[0]
        ? `<span class="lay-ex">${htmlEsc(label[rs[0].habit])} <kbd>${htmlEsc(formatWin(rs[0].windows))}</kbd> → <kbd>${htmlEsc(formatMac(rs[0].mac[0]))}</kbd></span>`
        : '<span class="lay-ex">No AltGr here, so it is all shortcuts: <kbd>Ctrl+C</kbd> → <kbd>⌘C</kbd></span>';
      return `<button type="button" class="lay-tile" data-layout="${l.id}" aria-pressed="false"><b>${htmlEsc(l.label)}</b>` +
        `<span class="lay-chars" aria-hidden="true">${chars || '<span>⌘</span>'}</span>${ex}</button>`;
    }).join('') +
      '<a class="lay-tile lay-other" href="https://github.com/soyoxymor0n/cmdnudge/issues/new?template=layout.yml"><b>Something else?</b>' +
      '<span class="lay-ex">Shortcuts like Ctrl+C work on any layout, because cmdnudge reads the keys from yours. For your AltGr characters, tell us which layout you use →</span></a>';
    layGrid.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-layout]');
      if (!b) return;
      layoutSel.value = b.dataset.layout;
      layoutSel.dispatchEvent(new Event('change'));
    });
  }
  $$('button[data-layout]', layGrid).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.layout === state.layout)));
}
layTiles();
const isMacOS = /Mac/i.test(navigator.userAgentData?.platform || navigator.platform || '');

function segs() {
  $$('.seg[data-ctl]').forEach((seg) => {
    const ctl = seg.dataset.ctl;
    $$('button', seg).forEach((b) => b.setAttribute('aria-checked', String(b.dataset.v === state[ctl])));
  });
  $('#mapCtx').textContent = `${state.keyboard === 'apple' ? 'Apple keyboard' : 'PC keyboard'}, ${LAYOUT_NAME[state.layout]}`;
}
$('[data-ctl="family"]').innerHTML = lib.appFamilies.map((f) => `<button type="button" role="radio" data-v="${f.id}">${f.label}</button>`).join('');
$$('.seg[data-ctl]').forEach((seg) =>
  seg.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    state[seg.dataset.ctl] = b.dataset.v;
    segs(); chips(); renderMap();
  }),
);

const flow = $('#flow');
const padIdle = $('#padIdle');
const playToast = $('#playToast');
const note = $('#playNote');

function present({ hand, pressed }) {
  const ctx = { layout: state.layout, keyboard: state.keyboard, family: state.family };
  const res = evaluate(ctx, pressed);
  const app = state.family === 'system' ? 'the app' : family(state.family).label;
  padIdle.hidden = true;
  flow.hidden = false;
  flow.innerHTML = flow.innerHTML; // restart the pop animation
  const way = $('.flow-node.macway', flow);
  way.classList.remove('is-bad', 'is-ok');
  $('#flowRecv').innerHTML = formatMac(pressed, { sided: true });
  if (res.kind === 'habit') {
    const r = res.rule;
    $('#flowHand').textContent = hand ?? formatWin(r.windows);
    $('#flowWayLabel').textContent = r.guard ? 'Blocked. The Mac way' : 'The Mac way';
    $('#flowWay').innerHTML = `${formatMac(r.mac[0])}<br><small>${actionLabel(r.action)}</small>`;
    if (r.guard) way.classList.add('is-bad');
    showToast(playToast, toastFor(r, app));
  } else if (res.kind === 'correct') {
    $('#flowHand').textContent = hand ?? formatMac(pressed);
    $('#flowWayLabel').textContent = 'Already right';
    $('#flowWay').innerHTML = `✓ ${formatMac(res.chord)}<br><small>${actionLabel(res.action)}</small>`;
    way.classList.add('is-ok');
    showToast(playToast, { from: '✓', to: formatMac(res.chord), detail: `${actionLabel(res.action)}, the Mac way. Counted.`, style: 'correct' });
  } else if (res.kind === 'quiet') {
    $('#flowHand').textContent = hand ?? formatMac(pressed);
    $('#flowWayLabel').textContent = 'cmdnudge';
    $('#flowWay').innerHTML = `stays quiet<br><small>${state.family === 'remote' ? 'Windows keys are right in a remote desktop' : 'Ctrl means something here'}</small>`;
    playToast.classList.remove('is-on');
  } else {
    $('#flowHand').textContent = hand ?? formatMac(pressed);
    $('#flowWayLabel').textContent = 'cmdnudge';
    $('#flowWay').innerHTML = `no hint<br><small>not a Windows habit it knows</small>`;
    playToast.classList.remove('is-on');
  }
  const handText = $('#flowHand').textContent;
  if (!state.first && res.kind === 'habit') state.first = { hand: handText, mac: formatMac(res.rule.mac[0]) };
  remember();
}

/** Windows chord → what the Mac receives (chord.mjs arrive) → the matcher. */
function pressWindows(win) {
  present({ hand: formatWin(win), pressed: arrive(win, state.keyboard) });
}

const CHIPS = ['copy', 'undo', 'snip', 'at-sign', 'switch-app', 'close-app', 'word-left', 'find', 'new-tab', 'reopen-tab', 'lock', 'search', 'show-desktop', 'euro'];
function chips() {
  const el = $('#chips');
  el.innerHTML = CHIPS.map((id) => habitById.get(`${id}-${state.layout}`) ?? habitById.get(id)).filter((h) => h && h.layouts.includes(state.layout))
    .map((h) => `<button type="button" class="chip${h.guard ? ' is-guard' : ''}" data-win="${h.windows}">${formatWin(h.windows)}<span>${h.label.replace(/ \(.*\)$/, '')}</span></button>`).join('');
}
$('#chips').addEventListener('click', (e) => { const b = e.target.closest('.chip'); if (b) pressWindows(b.dataset.win); });

// Physical key (KeyboardEvent.code) → keycap label in the chosen layout, like keymap.rs. The
// keycaps come from library.json, measured from the Mac layouts themselves.
const CODE_COMMON = { Comma: 'comma', Period: 'period', Space: 'space', Enter: 'return', NumpadEnter: 'return', Tab: 'tab', Backspace: 'backspace', Escape: 'esc', Delete: 'fwddelete', Home: 'home', End: 'end', PageUp: 'pageup', PageDown: 'pagedown', ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', NumpadAdd: 'plus', NumpadSubtract: 'minus' };
function keyLabel(code) {
  const caps = lib.keycaps[state.layout] ?? lib.keycaps.us;
  let m;
  if (caps[code]) return caps[code];
  if ((m = /^Numpad(\d)$/.exec(code))) return m[1];
  if ((m = /^F(\d{1,2})$/.exec(code))) return 'f' + m[1];
  return CODE_COMMON[code] ?? null;
}
const held = new Set();
const pad = $('#pad');
pad.addEventListener('focus', () => pad.classList.add('is-focus'));
pad.addEventListener('blur', () => { pad.classList.remove('is-focus'); held.clear(); });
pad.addEventListener('keyup', (e) => held.delete(e.code));
pad.addEventListener('keydown', (e) => {
  if (/^(Meta|Alt|Control|Shift|OS)(Left|Right)?$/.test(e.code) || e.key === 'AltGraph') { held.add(e.code); return; }
  const key = keyLabel(e.code);
  if (!key) return;
  const altgr = e.getModifierState?.('AltGraph');
  // The app's privacy filter: plain typing is never looked at. Same rule here.
  const combo = e.metaKey || e.ctrlKey || e.altKey || altgr || /^(f\d+|home|end|fwddelete)$/.test(key);
  if (!combo) {
    if (key === 'tab') return;
    note.textContent = 'Plain typing is ignored, here and in the app. Only key combinations count.';
    return;
  }
  e.preventDefault();
  note.textContent = 'Nothing you press here leaves this page.';
  if (isMacOS) {
    const side = (l, r, any, name) => (held.has(r) ? 'r' + name : held.has(l) ? 'l' + name : any ? name : null);
    const mods = [e.ctrlKey && 'ctrl', side('AltLeft', 'AltRight', e.altKey, 'opt'), e.shiftKey && 'shift', side('MetaLeft', 'MetaRight', e.metaKey, 'cmd')].filter(Boolean);
    present({ hand: null, pressed: normalize([...mods, key].join('+')) });
  } else {
    const mods = altgr
      ? ['altgr', e.shiftKey && 'shift']
      : [e.ctrlKey && 'ctrl', e.metaKey && 'win', e.altKey && 'alt', e.shiftKey && 'shift'];
    pressWindows(normalize([...mods.filter(Boolean), key].join('+'), 'win'));
  }
});
if (!isMacOS) {
  $('#padHint').textContent = 'Click here, then press a Windows shortcut';
  $('#padSub').textContent = 'You are on a PC, so we show what your Mac would receive from the same keys.';
}

/* ---------------------------------------------------------------- habit map */
const CATS = [['all', 'All'], ['edit', 'Editing'], ['text', 'Text'], ['window', 'Windows'], ['system', 'System'], ['files', 'Finder'], ['browser', 'Browser'], ['typing', 'Typing'], ['file', 'Files'], ['format', 'Format']];
let cat = 'all', showAll = false;
$('#mapTabs').innerHTML = CATS.filter(([id]) => id === 'all' || lib.habits.some((h) => h.category === id))
  .map(([id, l]) => `<button type="button" role="tab" data-c="${id}" aria-selected="${id === cat}">${l}</button>`).join('');
$('#mapTabs').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  cat = b.dataset.c;
  $$('#mapTabs button').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
  renderMap();
});
$('#mapSearch').addEventListener('input', renderMap);
$('#mapMore').addEventListener('click', () => { showAll = !showAll; renderMap(); });

const src = (url, name) => !url ? '' : url.startsWith('measured') ? `<span title="${url.replace(/"/g, '&quot;')}">measured</span>` : `<a href="${url}" target="_blank" rel="noopener">${name}</a>`;
function renderMap() {
  const q = $('#mapSearch').value.trim().toLowerCase();
  const rows = lib.habits.filter((h) => h.layouts.includes(state.layout) && (cat === 'all' || h.category === cat)
    && (!q || `${h.label} ${h.id} ${h.windows} ${formatWin(h.windows)} ${h.mac.map((m) => formatMac(m)).join(' ')}`.toLowerCase().includes(q)));
  const list = showAll || q ? rows : rows.slice(0, 12);
  $('#mapList').innerHTML = list.length ? list.map((h) => {
    const r = lib.habitRules.find((x) => x.habit === h.id && x.layout === state.layout && x.keyboard === state.keyboard);
    const fam = h.family !== 'system' ? family(h.family)?.label : null;
    const macTxt = r ? h.mac.map((m) => formatMac(m)).join(' or ') : 'Same keys work';
    return `<div class="row${r ? '' : ' is-none'}" role="listitem">
      <span class="r-label">${h.label}${fam ? `<small>in ${fam}</small>` : ''}</span>
      <span class="r-win">${formatWin(h.windows)}</span><span class="r-arrow">→</span>
      <span class="r-mac">${macTxt}${r?.guard ? '<span class="guard">guarded</span>' : ''}</span>
      <span class="r-src">${src(h.sourceURL, 'Apple')}${h.windowsSourceURL && h.windowsSourceURL !== h.sourceURL ? ' · ' + src(h.windowsSourceURL, 'Microsoft') : ''}</span>
    </div>`;
  }).join('') : '<p class="map-empty">No habit matches that. Try “copy” or “tab”.</p>';
  const more = $('#mapMore');
  more.hidden = !!q || rows.length <= 12;
  more.textContent = showAll ? 'Show fewer' : `Show all ${rows.length}`;
}

/* ---------------------------------------------------------------- finale: count up, and remember */
function remember() {
  if (!state.first) return;
  $('#finaleRemember').textContent = `You pressed ${state.first.hand} first. On a Mac that is ${state.first.mac}. Your hands will get there; cmdnudge keeps count until they do.`;
}
(function countUp() {
  const nums = $$('#stats b[data-to]');
  new IntersectionObserver(([e], o) => {
    if (!e.isIntersecting) return;
    o.disconnect();
    if (reduce) return;
    const t0 = performance.now();
    (function tick(t) {
      const p = Math.min(1, (t - t0) / 1400), ease = 1 - Math.pow(1 - p, 3);
      nums.forEach((n) => (n.textContent = Math.round(+n.dataset.to * ease)));
      if (p < 1) requestAnimationFrame(tick);
    })(t0);
  }, { threshold: 0.4 }).observe($('#stats'));
})();

segs(); chips(); renderMap();

/* ---------------------------------------------------------------- 3a · context-switch calculator */
(() => {
  const calc = document.getElementById('calc');
  if (!calc) return;
  const WORKDAYS = 220;
  const val = (k) => Number(calc.querySelector(`[data-calc="${k}"]`).value);
  const update = () => {
    for (const k of ['slips', 'lookups', 'back']) calc.querySelector(`[data-show="${k}"]`).textContent = val(k);
    const perDay = (val('slips') * 3) / 60 + val('lookups') * (1 + val('back'));
    const hours = (perDay * WORKDAYS) / 60;
    const days = hours / 8;
    document.getElementById('calcHours').textContent = hours < 10 ? hours.toFixed(1) : Math.round(hours);
    const dayText = days >= 1 ? ` About ${days < 10 ? Math.round(days * 2) / 2 : Math.round(days)} full working day${days >= 1.5 ? 's' : ''}.` : '';
    document.getElementById('calcSub').textContent = `${Math.round(perDay)} minute${Math.round(perDay) === 1 ? '' : 's'} a day, over ${WORKDAYS} working days.${dayText}`;
  };
  calc.addEventListener('input', update);
  update();
})();
