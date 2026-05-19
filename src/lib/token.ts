import { useSyncExternalStore } from "react";

const TOKEN_KEY = "ghpr.token";
const VIEWER_KEY = "ghpr.viewer";

const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(value: string | null): void {
  try {
    if (value && value.trim().length > 0) {
      localStorage.setItem(TOKEN_KEY, value.trim());
    } else {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(VIEWER_KEY);
    }
  } catch {
    // ignore quota / privacy errors
  }
  emit();
}

export function getViewer(): string | null {
  try {
    return localStorage.getItem(VIEWER_KEY);
  } catch {
    return null;
  }
}

export function setViewer(login: string | null): void {
  try {
    if (login) localStorage.setItem(VIEWER_KEY, login);
    else localStorage.removeItem(VIEWER_KEY);
  } catch {
    // ignore
  }
  emit();
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key === TOKEN_KEY || e.key === VIEWER_KEY) cb();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

export function useToken(): string | null {
  return useSyncExternalStore(subscribe, getToken, () => null);
}

export function useViewer(): string | null {
  return useSyncExternalStore(subscribe, getViewer, () => null);
}
