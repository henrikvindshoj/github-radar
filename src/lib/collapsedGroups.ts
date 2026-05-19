import { useCallback, useSyncExternalStore } from "react";

const STORAGE_KEY = "ghpr.collapsedGroups";

const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

function read(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((v): v is string => typeof v === "string"));
  } catch {
    return new Set();
  }
}

function write(value: Set<string>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...value]));
  } catch {
    // ignore quota / privacy errors
  }
}

let cache: Set<string> | null = null;

function getSnapshot(): Set<string> {
  if (cache === null) cache = read();
  return cache;
}

function refreshFromStorage(): void {
  cache = read();
  emit();
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) {
      refreshFromStorage();
      cb();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

export function useCollapsedGroups(): {
  collapsed: Set<string>;
  isCollapsed: (groupName: string) => boolean;
  toggle: (groupName: string) => void;
} {
  const collapsed = useSyncExternalStore(
    subscribe,
    getSnapshot,
    () => new Set<string>(),
  );

  const toggle = useCallback((groupName: string) => {
    const current = getSnapshot();
    const next = new Set(current);
    if (next.has(groupName)) next.delete(groupName);
    else next.add(groupName);
    cache = next;
    write(next);
    emit();
  }, []);

  const isCollapsed = useCallback(
    (groupName: string) => collapsed.has(groupName),
    [collapsed],
  );

  return { collapsed, isCollapsed, toggle };
}
