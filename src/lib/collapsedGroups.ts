import { useCallback, useSyncExternalStore } from "react";

const DEFAULT_STORAGE_KEY = "ghpr.collapsedGroups";

interface Store {
  storageKey: string;
  listeners: Set<() => void>;
  cache: Set<string> | null;
}

const stores = new Map<string, Store>();

function getStore(storageKey: string): Store {
  let store = stores.get(storageKey);
  if (!store) {
    store = { storageKey, listeners: new Set(), cache: null };
    stores.set(storageKey, store);
  }
  return store;
}

function read(storageKey: string): Set<string> {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((v): v is string => typeof v === "string"));
  } catch {
    return new Set();
  }
}

function write(storageKey: string, value: Set<string>): void {
  try {
    localStorage.setItem(storageKey, JSON.stringify([...value]));
  } catch {
    // ignore quota / privacy errors
  }
}

function getSnapshot(store: Store): Set<string> {
  if (store.cache === null) store.cache = read(store.storageKey);
  return store.cache;
}

function emit(store: Store): void {
  for (const l of store.listeners) l();
}

function subscribe(store: Store, cb: () => void): () => void {
  store.listeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key === store.storageKey) {
      store.cache = read(store.storageKey);
      cb();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    store.listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

export function useCollapsedGroups(storageKey: string = DEFAULT_STORAGE_KEY): {
  collapsed: Set<string>;
  isCollapsed: (groupName: string) => boolean;
  toggle: (groupName: string) => void;
} {
  const store = getStore(storageKey);

  const collapsed = useSyncExternalStore(
    (cb) => subscribe(store, cb),
    () => getSnapshot(store),
    () => new Set<string>(),
  );

  const toggle = useCallback(
    (groupName: string) => {
      const current = getSnapshot(store);
      const next = new Set(current);
      if (next.has(groupName)) next.delete(groupName);
      else next.add(groupName);
      store.cache = next;
      write(store.storageKey, next);
      emit(store);
    },
    [store],
  );

  const isCollapsed = useCallback(
    (groupName: string) => collapsed.has(groupName),
    [collapsed],
  );

  return { collapsed, isCollapsed, toggle };
}
