import { useCallback, useEffect, useMemo, useState } from "react";
import logo from "../src-tauri/icons/128x128@2x.png";
import logoLight from "./assets/logo-light.png";
import { openUrl } from "@tauri-apps/plugin-opener";
import { api, onChanged, onNavigate, FILTER_URL, REPO } from "./api";
import type { Library, RawRows, Settings, Stats, Status, SyncReport } from "./api";
import { mac, win } from "./chords";

type View = "onboarding" | "stats" | "library" | "settings";

function useLive<T>(load: () => Promise<T>, everyMs = 1500): [T | null, () => void] {
  const [value, setValue] = useState<T | null>(null);
  const refresh = useCallback(() => {
    load().then(setValue).catch(() => {});
  }, [load]);
  useEffect(() => {
    refresh();
    const un = onChanged(refresh);
    const t = window.setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, everyMs);
    return () => {
      window.clearInterval(t);
      un.then((f) => f());
    };
  }, [refresh, everyMs]);
  return [value, refresh];
}

export default function App() {
  const [view, setView] = useState<View>("stats");
  const [status] = useLive(api.status, 1000);
  const [settings, reloadSettings] = useLive(api.settings, 4000);
  const [lib, setLib] = useState<Library | null>(null);

  useEffect(() => {
    api.library().then(setLib);
    const un = onNavigate((v) => setView(v as View));
    return () => {
      un.then((f) => f());
    };
  }, []);
  useEffect(() => {
    if (settings && !settings.onboarded) setView("onboarding");
  }, [settings?.onboarded]);

  const save = async (patch: Partial<Settings>) => {
    if (!settings) return;
    await api.saveSettings({ ...settings, ...patch });
    reloadSettings();
  };

  if (!settings || !status) return <div className="boot" />;

  return (
    <div className="shell">
      <aside className="side">
        <div className="drag" data-tauri-drag-region />
        <div className="brand">
          <picture className="brand-mark"><source srcSet={logo} media="(prefers-color-scheme: dark)" /><img src={logoLight} alt="" aria-hidden /></picture>
          <span>cmdnudge</span>
        </div>
        <nav>
          <NavItem id="stats" view={view} setView={setView} icon="◔" label="Your habits" />
          <NavItem id="library" view={view} setView={setView} icon="⌗" label="Habit map" />
          <NavItem id="settings" view={view} setView={setView} icon="⚙︎" label="Settings" />
          <NavItem id="onboarding" view={view} setView={setView} icon="✦" label="Setup" />
        </nav>
        <StatusPill status={status} />
      </aside>
      <main className="content">
        <div className="drag top" data-tauri-drag-region />
        {view === "onboarding" && <Onboarding status={status} settings={settings} save={save} done={() => setView("stats")} />}
        {view === "stats" && <StatsView status={status} />}
        {view === "library" && lib && <LibraryView lib={lib} status={status} />}
        {view === "settings" && lib && <SettingsView status={status} settings={settings} save={save} lib={lib} />}
      </main>
    </div>
  );
}

function NavItem(p: { id: View; view: View; setView: (v: View) => void; icon: string; label: string }) {
  return (
    <button className={`nav ${p.view === p.id ? "on" : ""}`} onClick={() => p.setView(p.id)}>
      <span className="nav-icon" aria-hidden>{p.icon}</span>
      {p.label}
    </button>
  );
}

function pausedText(until: number) {
  return new Date(until * 1000).toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" });
}

function StatusPill({ status }: { status: Status }) {
  let tone = "ok";
  let text = "Watching";
  if (status.pausedUntil) {
    tone = "warn";
    text = `Paused until ${pausedText(status.pausedUntil)}`;
  } else if (status.tap === 0) {
    tone = "bad";
    text = "Needs permission";
  } else if (status.tap === 1) {
    tone = "warn";
    text = "Guard off";
  }
  return (
    <div className="pill-wrap">
      <div className={`pill ${tone}`}>
        <i />
        {text}
      </div>
      <div className="pill-sub">
        {status.layout.toUpperCase()} · {status.keyboard === "apple" ? "Apple keyboard" : "PC keyboard"}
      </div>
      {status.pausedUntil ? (
        <button className="btn small" onClick={() => api.resume()}>Resume</button>
      ) : (
        <button className="btn small ghost" onClick={() => api.pause(60)}>Pause 1 h</button>
      )}
    </div>
  );
}

/* ---------- Onboarding ---------------------------------------------------------------- */

function Onboarding(p: { status: Status; settings: Settings; save: (s: Partial<Settings>) => Promise<void>; done: () => void }) {
  const [step, setStep] = useState(0);
  const { status } = p;
  const test = status.keyCheck;
  const passed = !!test?.meaning?.startsWith("habit");
  const finish = async () => {
    await p.save({ onboarded: true });
    p.done();
  };
  return (
    <div className="page onboarding">
      <ol className="steps">
        {["What it sees", "Permissions", "Your keyboard", "Try it"].map((s, i) => (
          <li key={s} className={i === step ? "on" : i < step ? "past" : ""} onClick={() => setStep(i)}>
            <b>{i + 1}</b>
            {s}
          </li>
        ))}
      </ol>

      {step === 0 && (
        <section className="card hero-card">
          <h1>Your Windows habits, caught the moment they slip.</h1>
          <p className="lede">
            When you press a Windows shortcut on this Mac, cmdnudge shows the Mac one in the corner. Your key still goes through. The one
            exception: right ⌘Q from the AltGr+Q “@” habit is stopped before it quits your app.
          </p>
          <div className="never">
            <h3>What cmdnudge never records</h3>
            <ul>
              <li>What you type: letters, digits, words, passwords</li>
              <li>Window titles, documents, websites</li>
              <li>When exactly you pressed something. Only per-day counts.</li>
            </ul>
            <p>
              Only key combinations with ⌘, ⌃ or ⌥ (and F-keys, Home, End) are even looked at, and only those that match a known habit are counted.
              That decision is one short function:{" "}
              <a href="#" onClick={(e) => { e.preventDefault(); openUrl(FILTER_URL); }}>read filter.rs</a>.
            </p>
          </div>
          <div className="row end">
            <button className="btn primary" onClick={() => setStep(1)}>Continue</button>
          </div>
        </section>
      )}

      {step === 1 && (
        <section className="card">
          <h2>Two permissions</h2>
          <p className="muted">macOS asks for these for any app that sees key presses. You can switch them off any time in System Settings.</p>
          <Perm
            ok={status.inputMonitoring || status.tap > 0}
            title="Input Monitoring"
            why="To notice key combinations at all. Without it cmdnudge cannot coach."
            onGrant={() => api.requestPermission("input")}
          />
          <Perm
            ok={status.accessibility}
            title="Accessibility"
            why="To stop right ⌘Q before it quits your app (the guard), and for translate mode. Without it you still get every hint."
            onGrant={() => api.requestPermission("accessibility")}
          />
          <p className="hint">
            After you switch a permission on, cmdnudge picks it up by itself within a few seconds. If macOS insists, quit and reopen it from the menu bar.
          </p>
          <div className="row end">
            <button className="btn ghost" onClick={() => setStep(0)}>Back</button>
            <button className="btn primary" onClick={() => setStep(2)}>{status.tap > 0 ? "Continue" : "Continue anyway"}</button>
          </div>
        </section>
      )}

      {step === 2 && (
        <section className="card">
          <h2>Your keyboard</h2>
          <p className="muted">
            The same Windows habit lands on different Mac keys depending on the keyboard. On an Apple keyboard, AltGr sits where the right ⌘ is,
            so the German “@” habit (AltGr+Q) quits apps.
          </p>
          <div className="choice-grid">
            <Choice on={p.settings.keyboard !== "pc"} onClick={() => p.save({ keyboard: "apple" })} title="Apple keyboard" sub="MacBook, Magic Keyboard. Bottom row: fn ⌃ ⌥ ⌘" />
            <Choice on={p.settings.keyboard === "pc"} onClick={() => p.save({ keyboard: "pc" })} title="PC keyboard" sub="Bottom row: Ctrl Win Alt. Win acts as ⌘" />
          </div>
          <div className="kv">
            <span>Layout in use</span>
            <b>{layoutName(status.layout)}</b>
            <span className="muted small">{status.layoutSource ? `from ${status.layoutSource.replace("com.apple.keylayout.", "")}` : ""}</span>
          </div>
          <div className="seg">
            {(["auto", "us", "de", "at"] as const).map((l) => (
              <button key={l} className={p.settings.layout === l ? "on" : ""} onClick={() => p.save({ layout: l })}>
                {l === "auto" ? "Automatic" : layoutName(l)}
              </button>
            ))}
          </div>
          <div className="row end">
            <button className="btn ghost" onClick={() => setStep(1)}>Back</button>
            <button className="btn primary" onClick={() => setStep(3)}>Continue</button>
          </div>
        </section>
      )}

      {step === 3 && (
        <section className="card">
          <h2>Press Ctrl+C now</h2>
          <p className="muted">The Windows way, with the Control key. A hint should appear at the bottom right of your screen.</p>
          <div className={`tester ${passed ? "pass" : ""}`}>
            {test ? (
              <>
                <div className="tester-key">{test.pressed}</div>
                <div className="tester-meaning">{test.meaning ?? "not a known habit, so nothing is counted"}</div>
              </>
            ) : (
              <div className="tester-wait">{status.tap === 0 ? "Waiting for Input Monitoring…" : "Waiting for a key combination…"}</div>
            )}
          </div>
          <div className="row">
            <button className="btn ghost" onClick={() => api.testToast("hint")}>Show a sample hint</button>
            <button className="btn ghost" onClick={() => api.testToast("guard")}>Show the ⌘Q guard</button>
            <span className="grow" />
            <button className="btn primary" onClick={finish}>{passed ? "Done. Work as usual" : "Finish"}</button>
          </div>
        </section>
      )}
    </div>
  );
}

function Perm(p: { ok: boolean; title: string; why: string; onGrant: () => void }) {
  return (
    <div className={`perm ${p.ok ? "ok" : ""}`}>
      <span className="perm-dot" aria-hidden>{p.ok ? "✓" : "!"}</span>
      <div className="grow">
        <b>{p.title}</b>
        <p>{p.why}</p>
      </div>
      {p.ok ? <span className="tag ok">Granted</span> : <button className="btn" onClick={p.onGrant}>Open System Settings</button>}
    </div>
  );
}

function Choice(p: { on: boolean; onClick: () => void; title: string; sub: string }) {
  return (
    <button className={`choice ${p.on ? "on" : ""}`} onClick={p.onClick}>
      <b>{p.title}</b>
      <span>{p.sub}</span>
    </button>
  );
}

function layoutName(l: string) {
  return ({ us: "US", de: "German", at: "Austrian" } as Record<string, string>)[l] ?? l;
}

/* ---------- Stats ---------------------------------------------------------------------- */

function StatsView({ status }: { status: Status }) {
  const [stats] = useLive<Stats>(api.stats, 3000);
  if (!stats) return null;
  // Once a Windows computer syncs its counts (#17), the habits it really uses most come first:
  // those are the ones the hands keep bringing over.
  const fromWindows = stats.actions.some((a) => a.winUses > 0);
  const costing = stats.actions
    .filter((a) => a.misses > 0 && !a.mastered)
    .sort((a, b) => (fromWindows ? b.winUses - a.winUses : 0) || b.misses - a.misses)
    .slice(0, 10);
  const mastered = stats.actions.filter((a) => a.mastered);
  const today = stats.daily.filter((d) => d.day === stats.today);
  const missesToday = today.filter((d) => d.kind === "habit_miss").reduce((s, d) => s + d.count, 0);
  const rightToday = today.filter((d) => d.kind === "mac_correct").reduce((s, d) => s + d.count, 0);
  const days = lastDays(14, stats.today);
  const per = (day: string, kind: string) => stats.daily.filter((d) => d.day === day && d.kind === kind).reduce((s, d) => s + d.count, 0);
  const max = Math.max(1, ...days.map((d) => Math.max(per(d, "habit_miss"), per(d, "mac_correct"))));
  const empty = stats.actions.length === 0;

  return (
    <div className="page">
      <header className="page-head">
        <h1>Your habits</h1>
        <p className="muted">Counted on this Mac, per day. Nothing leaves it.</p>
      </header>
      <div className="tiles">
        <Tile n={missesToday} label="Windows habits today" tone="warm" />
        <Tile n={rightToday} label="Mac shortcuts used today" tone="cool" />
        <Tile n={mastered.length} label="Mastered" tone="ok" />
      </div>

      {empty ? (
        <div className="empty card">
          <div className="empty-icon" aria-hidden>⌘</div>
          <h3>Nothing yet. Work as usual.</h3>
          <p className="muted">The first time a Windows habit slips, it shows up here, together with the Mac way.</p>
          {status.recent.length === 0 && (
            <button className="btn" onClick={() => api.testToast("hint")}>Show a sample hint</button>
          )}
        </div>
      ) : (
        <>
          <section className="card">
            <h2>Still costing you</h2>
            {fromWindows && costing.length > 0 && (
              <p className="muted">Ordered by how often your Windows computer uses each one.</p>
            )}
            {costing.length === 0 ? (
              <p className="muted">No open habits. Everything you slipped on is mastered.</p>
            ) : (
              <ul className="habits">
                {costing.map((a) => (
                  <li key={a.actionId}>
                    <span className="k win">{a.windows}</span>
                    <span className="arrow">→</span>
                    <span className="k mac">{a.mac}</span>
                    <span className="habit-label">
                      {a.label}
                      {a.topFamily && a.topFamily !== "Any app" && <em>{a.topFamily}</em>}
                      {a.winUses > 0 && <em title="Presses on your Windows computer">{a.winUses}× on Windows</em>}
                    </span>
                    <span className="habit-count" title="Times the Windows habit slipped">{a.misses}×</span>
                    <span className="meter" title={`${a.correct} of 10 correct uses to master`}>
                      <i style={{ width: `${Math.min(100, a.correct * 10)}%` }} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="card">
            <h2>Last 14 days</h2>
            <div className="bars" role="img" aria-label="Windows habits and Mac shortcuts per day">
              {days.map((d) => (
                <div className="bar" key={d} title={`${d}: ${per(d, "habit_miss")} habits, ${per(d, "mac_correct")} Mac shortcuts`}>
                  <i className="miss" style={{ height: `${(per(d, "habit_miss") / max) * 100}%` }} />
                  <i className="right" style={{ height: `${(per(d, "mac_correct") / max) * 100}%` }} />
                  <span>{d.slice(8)}</span>
                </div>
              ))}
            </div>
            <div className="legend">
              <span><i className="miss" /> Windows habit slipped</span>
              <span><i className="right" /> Mac shortcut used</span>
            </div>
          </section>
          {mastered.length > 0 && (
            <section className="card">
              <h2>Mastered</h2>
              <p className="muted small">At least 10 Mac uses and no slip in 14 days. Their hints turn quiet.</p>
              <div className="chips">
                {mastered.map((a) => (
                  <span className="chip" key={a.actionId}>
                    <b>{a.mac}</b> {a.label}
                  </span>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function Tile(p: { n: number; label: string; tone: string }) {
  return (
    <div className={`tile ${p.tone}`}>
      <b>{p.n}</b>
      <span>{p.label}</span>
    </div>
  );
}

function lastDays(n: number, today: string) {
  const out: string[] = [];
  const t = new Date(`${today}T12:00:00`);
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(t);
    d.setDate(t.getDate() - i);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
  }
  return out;
}

/* ---------- Library -------------------------------------------------------------------- */

function LibraryView({ lib, status }: { lib: Library; status: Status }) {
  const [q, setQ] = useState("");
  const families = useMemo(() => Object.fromEntries(lib.appFamilies.map((f) => [f.id, f.label])), [lib]);
  const rules = lib.habitRules.filter((r) => r.layout === status.layout && r.keyboard === status.keyboard);
  const ql = q.trim().toLowerCase();
  const shown = rules.filter((r) => !ql || `${win(r.windows)} ${mac(r.mac[0])} ${lib.habits.find((h) => h.id === r.habit)?.label}`.toLowerCase().includes(ql));
  const works = lib.dropped.filter((d) => d.layout === status.layout && d.keyboard === status.keyboard && d.reason === "works");
  return (
    <div className="page">
      <header className="page-head">
        <h1>Habit map</h1>
        <p className="muted">
          {rules.length} habits for a {layoutName(status.layout)} layout on {status.keyboard === "apple" ? "an Apple" : "a PC"} keyboard. Middle column: what the Mac
          actually receives when your Windows fingers press the habit.
        </p>
      </header>
      <input className="search" placeholder="Search: copy, Ctrl+T, screenshot…" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="card flush">
        <table className="map">
          <thead>
            <tr><th>Windows habit</th><th>Arrives on the Mac as</th><th>Mac way</th><th>Does</th><th>Where</th></tr>
          </thead>
          <tbody>
            {shown.map((r) => {
              const h = lib.habits.find((x) => x.id === r.habit);
              return (
                <tr key={r.id} className={r.guard ? "guard" : ""}>
                  <td><span className="k win">{win(r.windows)}</span></td>
                  <td className="muted">{mac(r.arrives, true)}</td>
                  <td><span className="k mac">{mac(r.mac[0])}</span></td>
                  <td>
                    {h?.label}
                    {r.guard && <span className="tag bad">guarded</span>}
                  </td>
                  <td className="muted">{families[r.family]}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {works.length > 0 && (
        <p className="muted small">
          Already right on your keyboard, so no hint: {works.map((w) => win(lib.habits.find((h) => h.id === w.habit)?.windows ?? "")).join(", ")}.
        </p>
      )}
    </div>
  );
}

/* ---------- Settings ------------------------------------------------------------------- */

/** Shortens a path under the home folder and names iCloud Drive the way Finder does. */
function prettyFolder(path: string): string {
  return path
    .replace(/^\/Users\/[^/]+\/Library\/Mobile Documents\/com~apple~CloudDocs/, "iCloud Drive")
    .replace(/^\/Users\/[^/]+/, "~");
}

function reportLine(r: SyncReport): string {
  if (r.devices === 0 && r.problems.length) return `Could not sync: ${r.problems[0]}`;
  const who = r.devices === 0 ? "No other computer has written to the folder yet" : `Counts from ${r.devices} other computer${r.devices === 1 ? "" : "s"} included`;
  const skipped = r.skippedRows ? ` · ${r.skippedRows} rows from a newer version skipped` : "";
  return `${who}${skipped}. Last sync ${r.day}.`;
}

/** Sync with an account (#18). The button stays off until the server accepts accounts. */
function AccountSyncCard() {
  const [hosted, reload] = useLive(api.hostedStatus, 30000);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const run = (p: Promise<unknown>, done?: string) => {
    setBusy(true);
    setNote("");
    p.then(() => done && setNote(done))
      .catch((e) => setNote(String(e)))
      .finally(() => {
        setBusy(false);
        reload();
      });
  };
  if (!hosted) return null;
  const host = hosted.server.replace(/^https?:\/\//, "");
  return (
    <section className="card">
      <h2>Sync with an account</h2>
      <p className="muted small">
        No shared folder needed: sign in on {host} and this computer sends the same counters there, and gets back the
        ones from your other computers. Only counts, never keys or text.
      </p>
      {hosted.linked ? (
        <div className="row">
          <span className="k">Connected to {host}</span>
          <span className="grow" />
          <button className="btn" disabled={busy} onClick={() => run(api.hostedSyncNow(), "Synced.")}>Sync now</button>
          <button className="btn ghost" disabled={busy} onClick={() => run(api.hostedDisconnect(false), "Signed out. Counts from other computers stay until you remove them.")}>Sign out</button>
        </div>
      ) : (
        <div className="row">
          <button
            className="btn"
            disabled={busy || hosted.availability !== "open"}
            onClick={() => run(api.hostedConnect(), "Finish signing in in your browser. cmdnudge picks it up from there.")}
          >
            Sign in…
          </button>
          <span className="muted small">
            {hosted.availability === "open"
              ? "Opens your browser."
              : hosted.availability === "notYet"
                ? "Not open yet. Folder sync above works today."
                : `Can't reach ${host} right now.`}
          </span>
        </div>
      )}
      {hosted.error && <p className="muted small warn">{hosted.error}</p>}
      {note && <p className="note">{note}</p>}
    </section>
  );
}

function SyncCard() {
  const [sync, reload] = useLive(api.syncStatus, 5000);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const run = (p: Promise<unknown>, done?: string) => {
    setBusy(true);
    setNote("");
    p.then(() => done && setNote(done))
      .catch((e) => setNote(String(e)))
      .finally(() => {
        setBusy(false);
        reload();
      });
  };
  if (!sync) return null;
  const others = sync.devices.length;
  return (
    <section className="card">
      <h2>Your other computers</h2>
      <p className="muted small">
        Learning on two Macs? Point both at the same folder, for example in iCloud Drive or Dropbox. Each computer writes one
        small file with its counters there and reads the other files. Only the counters from the table below go into the file,
        never keys or text.
      </p>
      {sync.folder ? (
        <>
          <div className="row">
            <span className="k">{prettyFolder(sync.folder)}/cmdnudge-sync</span>
            <span className="grow" />
            <button className="btn" disabled={busy} onClick={() => run(api.syncNow())}>Sync now</button>
            <button className="btn ghost" disabled={busy} onClick={() => run(api.chooseSyncFolder())}>Change folder</button>
            <button className="btn ghost" disabled={busy} onClick={() => run(api.stopSync(false), "File sync is off. Counts from other computers stay until you remove them.")}>Turn off</button>
          </div>
          {sync.last && <p className={sync.last.problems.length ? "muted small warn" : "muted small"}>{reportLine(sync.last)}</p>}
        </>
      ) : (
        <div className="row">
          <button className="btn" disabled={busy} onClick={() => run(api.chooseSyncFolder())}>Choose a sync folder…</button>
          <span className="muted small">or move the file by hand:</span>
          <button className="btn ghost" disabled={busy} onClick={() => run(api.importData().then((r) => r && setNote(`Imported ${r.rows} counters from another computer.`)))}>Import counters…</button>
        </div>
      )}
      {others > 0 && (
        <div className="row">
          <span className="muted small">
            {others} other computer{others === 1 ? "" : "s"} in your totals ({sync.devices.map(([, n]) => n).reduce((a, b) => a + b, 0)} rows). This Mac is {sync.deviceId}.
          </span>
          <span className="grow" />
          {!sync.folder && <button className="btn ghost small" disabled={busy} onClick={() => run(api.stopSync(true), "Counts from other computers removed.")}>Remove their counts</button>}
        </div>
      )}
      {note && <p className="note">{note}</p>}
    </section>
  );
}

function SettingsView(p: { status: Status; settings: Settings; save: (s: Partial<Settings>) => Promise<void>; lib: Library }) {
  const { status, settings, save, lib } = p;
  const [raw, setRaw] = useState<RawRows | null>(null);
  const [note, setNote] = useState("");
  const [armed, setArmed] = useState(false);
  const toggleIn = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  return (
    <div className="page">
      <header className="page-head">
        <h1>Settings</h1>
      </header>

      <section className="card">
        <h2>Permissions</h2>
        <Perm ok={status.inputMonitoring || status.tap > 0} title="Input Monitoring" why="Needed to notice key combinations." onGrant={() => api.requestPermission("input")} />
        <Perm ok={status.accessibility} title="Accessibility" why="Needed for the guard and translate mode." onGrant={() => api.requestPermission("accessibility")} />
      </section>

      <section className="card">
        <h2>Learning mode</h2>
        <div className="choice-grid three">
          <Choice on={settings.mode === "toast"} onClick={() => save({ mode: "toast" })} title="Hint only" sub="Your key goes through; the Mac way shows in the corner. Default." />
          <Choice on={settings.mode === "translate"} onClick={() => save({ mode: "translate" })} title="Translate" sub="cmdnudge presses the Mac shortcut for you and tells you which." />
          <Choice on={settings.mode === "strict"} onClick={() => save({ mode: "strict" })} title="Strict" sub="The Windows habit does nothing. You press the Mac way yourself." />
        </div>
        <label className="switch-row">
          <input type="checkbox" checked={settings.guard} onChange={(e) => save({ guard: e.target.checked })} />
          <span>
            <b>Guard against destructive slips</b>
            <em>Stops right ⌘Q from the AltGr+Q “@” habit before it quits your app. Left ⌘Q always works.</em>
          </span>
        </label>
        <label className="switch-row">
          <input type="checkbox" checked={settings.menuTips} onChange={(e) => save({ menuTips: e.target.checked })} />
          <span>
            <b>Tips for menu items you click</b>
            <em>
              The third time you pick a menu item with the mouse, cmdnudge shows its shortcut once. Needs Accessibility. Menu names are
              only held while the menu is open, never stored.
            </em>
          </span>
        </label>
        <label className="switch-row">
          <input type="checkbox" checked={settings.quietWhileSharing} onChange={(e) => save({ quietWhileSharing: e.target.checked })} />
          <span>
            <b>Quiet while sharing your screen</b>
            <em>No hints pop up while Zoom, Teams, Meet or a screen recording captures your screen. Counting and the guard keep working.</em>
          </span>
        </label>
        <div className="row">
          <button className="btn ghost" onClick={() => api.testToast("hint")}>Show a sample hint</button>
          <button className="btn ghost" onClick={() => api.testToast("guard")}>Show the guard</button>
          <span className="grow" />
          <label className="inline">
            Hint position
            <select value={settings.position} onChange={(e) => save({ position: e.target.value as Settings["position"] })}>
              <option value="bottom-right">Bottom right</option>
              <option value="bottom-left">Bottom left</option>
              <option value="top-center">Top centre</option>
            </select>
          </label>
        </div>
      </section>

      <section className="card">
        <h2>Keyboard and layout</h2>
        <div className="row wrap">
          <label className="inline">
            Keyboard
            <select value={settings.keyboard} onChange={(e) => save({ keyboard: e.target.value as Settings["keyboard"] })}>
              <option value="auto">Apple (built in)</option>
              <option value="apple">Apple keyboard</option>
              <option value="pc">PC keyboard</option>
            </select>
          </label>
          <label className="inline">
            Layout
            <select value={settings.layout} onChange={(e) => save({ layout: e.target.value as Settings["layout"] })}>
              <option value="auto">Automatic ({layoutName(status.layoutDetected)})</option>
              <option value="us">US</option>
              <option value="de">German</option>
              <option value="at">Austrian</option>
            </select>
          </label>
        </div>
        <div className="keycheck">
          <span className="muted small">Key check: press any shortcut to see what cmdnudge makes of it. Shown here only, never stored.</span>
          {status.keyCheck ? (
            <div className="row">
              <span className="k mac big">{status.keyCheck.pressed}</span>
              <span className="muted">in {status.keyCheck.family}</span>
              <span>{status.keyCheck.meaning ?? "no habit, not counted"}</span>
            </div>
          ) : (
            <div className="muted">Nothing pressed yet.</div>
          )}
        </div>
      </section>

      <section className="card">
        <h2>Apps</h2>
        <p className="muted small">In these, Windows shortcuts are often right, so cmdnudge stays quiet by default.</p>
        {lib.appFamilies.filter((f) => f.exclude).map((f) => (
          <label className="switch-row" key={f.id}>
            <input
              type="checkbox"
              checked={!settings.includeFamilies.includes(f.id)}
              onChange={() => save({ includeFamilies: toggleIn(settings.includeFamilies, f.id) })}
            />
            <span>
              <b>Quiet in {f.label}</b>
              <em>{f.note}</em>
            </span>
          </label>
        ))}
        {lib.appFamilies.filter((f) => !f.exclude && f.id !== "system").map((f) => (
          <label className="switch-row" key={f.id}>
            <input type="checkbox" checked={settings.mutedFamilies.includes(f.id)} onChange={() => save({ mutedFamilies: toggleIn(settings.mutedFamilies, f.id) })} />
            <span>
              <b>No hints in {f.label}</b>
              <em>Still counted; the guard still works.</em>
            </span>
          </label>
        ))}
      </section>

      <SyncCard />
      <AccountSyncCard />

      <section className="card">
        <h2>What is stored</h2>
        <p className="muted small">
          One SQLite file in ~/Library/Application Support/com.cmdnudge.app. These are all of its rows. Nothing is sent anywhere unless you switch on one of the syncs above, and then only these counters.
        </p>
        <div className="row">
          <button className="btn" onClick={() => api.raw().then(setRaw)}>{raw ? "Refresh" : "Show the raw rows"}</button>
          <button className="btn ghost" onClick={() => api.exportData().then((path) => path && setNote(`Saved to ${path}`)).catch((e) => setNote(String(e)))}>Export counters</button>
          <span className="grow" />
          <button
            className="btn danger ghost"
            onClick={() => {
              if (!armed) return setArmed(true);
              setArmed(false);
              api.resetCounts().then(() => setNote("Counters deleted."));
            }}
            onBlur={() => setArmed(false)}
          >
            {armed ? "Click again to delete" : "Delete all counts"}
          </button>
        </div>
        {note && <p className="note">{note}</p>}
        {raw && (
          <div className="raw">
            <p className="muted small">Columns: {raw.columns.map(([t, c]) => `${t}(${c.join(", ")})`).join(" · ")}</p>
            <table className="map small">
              <thead><tr><th>device</th><th>app_family</th><th>action_id</th><th>kind</th><th>count</th><th>first day</th><th>last day</th></tr></thead>
              <tbody>
                {raw.counters.map((r) => (
                  <tr key={`${r.device_id}${r.app_family}${r.action_id}${r.kind}`}>
                    <td>{r.device_id === raw.deviceId ? "this Mac" : r.device_id}</td><td>{r.app_family}</td><td>{r.action_id}</td><td>{r.kind}</td><td>{r.count}</td><td>{r.first_seen_day}</td><td>{r.last_seen_day}</td>
                  </tr>
                ))}
                {raw.counters.length === 0 && <tr><td colSpan={7} className="muted">No rows yet.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="muted small about">
        cmdnudge {status.version} · MIT ·{" "}
        <a href="#" onClick={(e) => { e.preventDefault(); openUrl(REPO); }}>source on GitHub</a> ·{" "}
        <a href="#" onClick={(e) => { e.preventDefault(); openUrl("https://cmdnudge.com"); }}>cmdnudge.com</a>
      </p>
    </div>
  );
}
