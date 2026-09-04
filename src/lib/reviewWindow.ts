import { useCallback, useSyncExternalStore } from "react";
import {
  DEFAULT_REVIEW_WINDOW,
  REVIEW_WINDOW_OPTIONS,
  type ReviewWindow,
} from "./reviews";

// Leaderboard settings live in localStorage (like the token, config and
// refresh interval) so each browser keeps its own preference.
const WINDOW_KEY = "ghpr.reviewWindow";
const DEPENDABOT_KEY = "ghpr.reviewIncludeDependabot";
const TEAMS_KEY = "ghpr.reviewTeams";
/** Single-team key used before the picker became multi-select. */
const LEGACY_TEAM_KEY = "ghpr.reviewTeam";

function isWindow(value: string | null): value is ReviewWindow {
  return REVIEW_WINDOW_OPTIONS.some((o) => o.value === value);
}

function makeStore<T>(read: () => T) {
  const listeners = new Set<() => void>();
  let cache: T;
  let cacheLoaded = false;

  return {
    getSnapshot(): T {
      if (!cacheLoaded) {
        cache = read();
        cacheLoaded = true;
      }
      return cache;
    },
    set(value: T): void {
      cache = value;
      cacheLoaded = true;
      for (const l of listeners) l();
    },
    subscribe(cb: () => void, key: string): () => void {
      listeners.add(cb);
      const onStorage = (e: StorageEvent) => {
        if (e.key === key) {
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
    },
  };
}

function readItem(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function removeItem(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore quota / privacy errors
  }
}

function writeItem(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore quota / privacy errors
  }
}

const windowStore = makeStore<ReviewWindow>(() => {
  const raw = readItem(WINDOW_KEY);
  return isWindow(raw) ? raw : DEFAULT_REVIEW_WINDOW;
});

const dependabotStore = makeStore<boolean>(
  () => readItem(DEPENDABOT_KEY) === "true",
);

// Selected team names; empty means "all reviewers". Validated against the
// current config by the consumer, since a team can disappear at any time.
const teamsStore = makeStore<string[]>(() => {
  const raw = readItem(TEAMS_KEY);
  if (raw === null) {
    const legacy = readItem(LEGACY_TEAM_KEY);
    return legacy === null ? [] : [legacy];
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter((n): n is string => typeof n === "string");
    }
  } catch {
    // fall through to "all reviewers"
  }
  return [];
});

export function useReviewWindow(): {
  value: ReviewWindow;
  set: (w: ReviewWindow) => void;
} {
  const value = useSyncExternalStore(
    useCallback((cb: () => void) => windowStore.subscribe(cb, WINDOW_KEY), []),
    windowStore.getSnapshot,
    () => DEFAULT_REVIEW_WINDOW,
  );
  const set = useCallback((w: ReviewWindow) => {
    if (!isWindow(w)) return;
    writeItem(WINDOW_KEY, w);
    windowStore.set(w);
  }, []);
  return { value, set };
}

export function useIncludeDependabot(): {
  value: boolean;
  set: (v: boolean) => void;
} {
  const value = useSyncExternalStore(
    useCallback(
      (cb: () => void) => dependabotStore.subscribe(cb, DEPENDABOT_KEY),
      [],
    ),
    dependabotStore.getSnapshot,
    () => false,
  );
  const set = useCallback((v: boolean) => {
    writeItem(DEPENDABOT_KEY, String(v));
    dependabotStore.set(v);
  }, []);
  return { value, set };
}

const NO_TEAMS: string[] = [];

export function useReviewTeams(): {
  value: string[];
  set: (names: string[]) => void;
} {
  const value = useSyncExternalStore(
    useCallback((cb: () => void) => teamsStore.subscribe(cb, TEAMS_KEY), []),
    teamsStore.getSnapshot,
    () => NO_TEAMS,
  );
  const set = useCallback((names: string[]) => {
    removeItem(LEGACY_TEAM_KEY);
    if (names.length === 0) removeItem(TEAMS_KEY);
    else writeItem(TEAMS_KEY, JSON.stringify(names));
    teamsStore.set(names);
  }, []);
  return { value, set };
}
