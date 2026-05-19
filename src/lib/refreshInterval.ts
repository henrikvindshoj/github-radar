import { useCallback, useSyncExternalStore } from "react";

const STORAGE_KEY = "ghpr.refreshInterval";

export interface RefreshOption {
  label: string;
  ms: number | null;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export const REFRESH_OPTIONS: RefreshOption[] = [
  { label: "Off", ms: null },
  { label: "1m", ms: MINUTE },
  { label: "5m", ms: 5 * MINUTE },
  { label: "15m", ms: 15 * MINUTE },
  { label: "30m", ms: 30 * MINUTE },
  { label: "1h", ms: HOUR },
  { label: "2h", ms: 2 * HOUR },
  { label: "1d", ms: DAY },
];

export const DEFAULT_INTERVAL_MS: number = MINUTE;

function isAllowedMs(ms: number | null): boolean {
  if (ms === null) return true;
  return REFRESH_OPTIONS.some((o) => o.ms === ms);
}

const listeners = new Set<() => void>();
let cache: number | null = null;
let cacheLoaded = false;

function read(): number | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return DEFAULT_INTERVAL_MS;
    if (raw === "off") return null;
    const n = Number(raw);
    if (!Number.isFinite(n)) return DEFAULT_INTERVAL_MS;
    return isAllowedMs(n) ? n : DEFAULT_INTERVAL_MS;
  } catch {
    return DEFAULT_INTERVAL_MS;
  }
}

function write(ms: number | null): void {
  try {
    if (ms === null) localStorage.setItem(STORAGE_KEY, "off");
    else localStorage.setItem(STORAGE_KEY, String(ms));
  } catch {
    // ignore quota / privacy errors
  }
}

function getSnapshot(): number | null {
  if (!cacheLoaded) {
    cache = read();
    cacheLoaded = true;
  }
  return cache;
}

function emit(): void {
  for (const l of listeners) l();
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) {
      cache = read();
      cacheLoaded = true;
      cb();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

export function useRefreshInterval(): {
  value: number | null;
  set: (ms: number | null) => void;
  option: RefreshOption;
} {
  const value = useSyncExternalStore(subscribe, getSnapshot, () => DEFAULT_INTERVAL_MS);
  const set = useCallback((ms: number | null) => {
    if (!isAllowedMs(ms)) return;
    cache = ms;
    cacheLoaded = true;
    write(ms);
    emit();
  }, []);
  const option =
    REFRESH_OPTIONS.find((o) => o.ms === value) ?? REFRESH_OPTIONS[1];
  return { value, set, option };
}
