import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export type Mode = "toast" | "translate" | "strict";
export interface Settings {
  mode: Mode;
  guard: boolean;
  keyboard: "auto" | "apple" | "pc";
  layout: "auto" | "us" | "de" | "at";
  pausedUntil: number | null;
  includeFamilies: string[];
  mutedFamilies: string[];
  position: "bottom-right" | "bottom-left" | "top-center";
  onboarded: boolean;
  syncFolder: string | null;
  menuTips: boolean;
}
export interface RecentHint { from: string; to: string; label: string; guarded: boolean }
export interface KeyCheck { pressed: string; family: string; meaning: string | null }
export interface Status {
  version: string;
  pausedUntil: number | null;
  tap: 0 | 1 | 2;
  inputMonitoring: boolean;
  accessibility: boolean;
  secureInput: boolean;
  layout: string;
  layoutDetected: string;
  layoutSource: string;
  keyboard: "apple" | "pc";
  keyCheck: KeyCheck | null;
  recent: RecentHint[];
}
export interface ActionStats {
  actionId: string; label: string; category: string; misses: number; correct: number;
  lastMissDay: string | null; mastered: boolean;
  /** Presses on synced Windows computers (#17). */
  winUses: number; topFamily: string; windows: string; mac: string;
}
export interface DailyRow { day: string; app_family: string; kind: string; count: number }
export interface Stats { actions: ActionStats[]; daily: DailyRow[]; today: string }
export interface CounterRow {
  device_id: string; platform: string; app_family: string; action_id: string; kind: string;
  count: number; first_seen_day: string; last_seen_day: string;
}
export interface RawRows { counters: CounterRow[]; daily: DailyRow[]; columns: [string, string[]][]; deviceId: string }

export interface SyncReport { day: string; devices: number; rows: number; skippedRows: number; problems: string[] }
export interface SyncStatus { folder: string | null; deviceId: string; last: SyncReport | null; devices: [string, number][] }

export interface HabitRule {
  id: string; habit: string; action: string; family: string; layout: string; keyboard: string;
  windows: string; arrives: string; mac: string[]; guard: boolean; category: string;
}
export interface Library {
  habits: { id: string; label: string; family: string; windows: string; mac: string[]; sourceURL: string; note?: string }[];
  habitRules: HabitRule[];
  appFamilies: { id: string; label: string; exclude?: string; note?: string; mac: string[] }[];
  dropped: { habit: string; layout: string; keyboard: string; arrives: string; reason: string; by?: string }[];
}

export const api = {
  status: () => invoke<Status>("get_status"),
  settings: () => invoke<Settings>("get_settings"),
  saveSettings: (settings: Settings) => invoke<void>("save_settings", { settings }),
  stats: () => invoke<Stats>("get_stats"),
  raw: () => invoke<RawRows>("get_raw_rows"),
  pause: (minutes: number | null) => invoke<void>("pause", { minutes }),
  resume: () => invoke<void>("resume"),
  requestPermission: (kind: "input" | "accessibility") => invoke<boolean>("request_permission", { kind }),
  testToast: (kind: "hint" | "guard") => invoke<void>("test_toast", { kind }),
  exportData: () => invoke<string | null>("export_data"),
  importData: () => invoke<SyncReport | null>("import_data"),
  syncStatus: () => invoke<SyncStatus>("sync_status"),
  syncNow: () => invoke<SyncStatus>("sync_now"),
  chooseSyncFolder: () => invoke<SyncStatus | null>("choose_sync_folder"),
  stopSync: (forget: boolean) => invoke<SyncStatus>("stop_sync", { forget }),
  resetCounts: () => invoke<void>("reset_counts"),
  library: async () => JSON.parse(await invoke<string>("get_library")) as Library,
};

export const onChanged = (f: () => void) => listen("cmdnudge://changed", f);
export const onNavigate = (f: (view: string) => void) => listen<string>("cmdnudge://navigate", (e) => f(e.payload));

export const REPO = "https://github.com/soyoxymor0n/cmdnudge";
export const FILTER_URL = `${REPO}/blob/main/apps/desktop/src-tauri/src/filter.rs`;
