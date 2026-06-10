import { useSyncExternalStore } from "react";
import {
  ConfigSchema,
  defaultConfig,
  defaultResolvedConfig,
  resolveConfig,
  type ResolvedConfig,
} from "./schema";

// The active configuration lives in the browser's localStorage (like the
// GitHub token), so it can be edited and persisted independently per user.
// When nothing is stored we fall back to the bundled default config.
const CONFIG_KEY = "ghpr.config";

const listeners = new Set<() => void>();
let cache: ResolvedConfig | null = null;
let cacheLoaded = false;

function readRaw(): string | null {
  try {
    return localStorage.getItem(CONFIG_KEY);
  } catch {
    return null;
  }
}

function compute(): ResolvedConfig {
  const raw = readRaw();
  if (raw === null) return defaultResolvedConfig;
  try {
    const parsed = ConfigSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return defaultResolvedConfig;
    return resolveConfig(parsed.data);
  } catch {
    return defaultResolvedConfig;
  }
}

function getSnapshot(): ResolvedConfig {
  if (!cacheLoaded) {
    cache = compute();
    cacheLoaded = true;
  }
  return cache as ResolvedConfig;
}

function emit(): void {
  for (const l of listeners) l();
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key === CONFIG_KEY) {
      cache = compute();
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

/** Reactive resolved configuration for use inside React components. */
export function useConfig(): ResolvedConfig {
  return useSyncExternalStore(subscribe, getSnapshot, () => defaultResolvedConfig);
}

/** True when no custom config is stored and the bundled default is in use. */
export function isUsingDefaultConfig(): boolean {
  return readRaw() === null;
}

/**
 * The editable config as pretty-printed JSON text. Returns the stored config if
 * present (re-formatted when valid JSON), otherwise the bundled default.
 */
export function getConfigText(): string {
  const raw = readRaw();
  if (raw !== null) {
    try {
      return JSON.stringify(JSON.parse(raw), null, 2);
    } catch {
      return raw;
    }
  }
  return JSON.stringify(defaultConfig, null, 2);
}

export interface SaveResult {
  ok: boolean;
  error?: string;
}

/** Validate and persist new config JSON text. Returns a friendly error on failure. */
export function saveConfigText(text: string): SaveResult {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (e) {
    return { ok: false, error: `Invalid JSON: ${(e as Error).message}` };
  }

  const parsed = ConfigSchema.safeParse(json);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = issue.path.join(".");
    return {
      ok: false,
      error: path ? `${path}: ${issue.message}` : issue.message,
    };
  }

  try {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(parsed.data));
  } catch (e) {
    return { ok: false, error: `Could not save: ${(e as Error).message}` };
  }

  cache = resolveConfig(parsed.data);
  cacheLoaded = true;
  emit();
  return { ok: true };
}

/** Drop the stored config and revert to the bundled default. */
export function resetConfig(): void {
  try {
    localStorage.removeItem(CONFIG_KEY);
  } catch {
    // ignore privacy / quota errors
  }
  cache = defaultResolvedConfig;
  cacheLoaded = true;
  emit();
}
