import { useCallback, useEffect, useRef, useState } from 'react';
import { waitForVisibility } from '../lib/githubRequest';
import { abortIfNeeded, nextSweepDelay, runSweep, runInitialBurst, type RollingTarget, type RollingUpdate } from '../lib/rollingRefresh';

export type TargetState = RollingUpdate & { complete?: boolean; updatedAt?: number };
interface Options {
  targets: readonly RollingTarget[];
  interval: number | null;
  token: string | null;
  prepare?: (keys: ReadonlySet<string>, signal: AbortSignal, update: (key: string, value: RollingUpdate) => void) => Promise<void>;
  onComplete: (key: string, data: unknown) => void;
  initialBurst?: boolean;
  mergeData?: (previous: unknown, incoming: unknown) => unknown;
}
/** One view owns a queue; the shared transport also serializes requests across view teardown. */
export function useRollingRefresh({ targets, interval, token, prepare, onComplete, mergeData, initialBurst = false }: Options) {
  const [states, setStates] = useState<Record<string, TargetState>>({});
  const [busy, setBusy] = useState(false);
  const pendingAll = useRef(false), pendingKeys = useRef(new Set<string>());
  const wake = useRef<() => void>(() => {});
  const completeRef = useRef(onComplete), prepareRef = useRef(prepare), mergeRef = useRef(mergeData);
  const intervalRef = useRef(interval); intervalRef.current = interval;
  completeRef.current = onComplete; prepareRef.current = prepare; mergeRef.current = mergeData;
  useEffect(() => { wake.current(); }, [interval]);
  const refresh = useCallback((key?: string) => {
    if (key) pendingKeys.current.add(key); else pendingAll.current = true;
    wake.current();
  }, []);

  useEffect(() => {
    const controller = new AbortController(), signal = controller.signal;
    pendingAll.current = false; pendingKeys.current.clear();
    const currentKeys = new Set(targets.map(t => t.key));
    setStates(previous => Object.fromEntries(Object.entries(previous).filter(([key]) => currentKeys.has(key))));
    if (!token || !targets.length) { setBusy(false); return () => controller.abort(); }
    const eligible = currentKeys;
    const suspended = new Set<string>();
    function update(key: string, value: RollingUpdate) {
      if (signal.aborted || !eligible.has(key)) return;
      if (value.done && value.data !== undefined && !value.error) completeRef.current(key, value.data);
      const failure = value.error as (Error & { status?: number; retryable?: boolean }) | undefined;
      if (failure && !failure.retryable && (failure.status === 401 || failure.status === 403)) suspended.add(key);
      setStates(previous => ({ ...previous, [key]: { ...previous[key], ...value,
        data: value.data === undefined ? previous[key]?.data : !value.done && mergeRef.current ? mergeRef.current(previous[key]?.data, value.data) : value.data,
        progress: value.progress ? { ...previous[key]?.progress, ...value.progress } : previous[key]?.progress,
        complete: value.done ? !value.error : previous[key]?.complete,
        updatedAt: value.done && !value.error ? Date.now() : previous[key]?.updatedAt,
      } }));
    }
    function sleep(ms: number | null): Promise<void> {
      abortIfNeeded(signal);
      return new Promise((resolve, reject) => {
        let timer: ReturnType<typeof setTimeout> | undefined;
        const cleanup = () => { if (timer) clearTimeout(timer); signal.removeEventListener('abort', cancel); if (wake.current === finish) wake.current = () => {}; };
        const finish = () => { cleanup(); resolve(); };
        const cancel = () => { cleanup(); reject(new DOMException('Cancelled', 'AbortError')); };
        wake.current = finish;
        if (ms !== null) timer = setTimeout(finish, Math.max(0, ms));
        signal.addEventListener('abort', cancel, { once: true });
      });
    }
    async function visible() { await waitForVisibility(signal); }
    const visibilityChange = () => wake.current();
    document.addEventListener('visibilitychange', visibilityChange);
    async function loop() {
      let selected = targets;
      let firstSweep = initialBurst;
      while (!signal.aborted) {
        await visible(); abortIfNeeded(signal);
        setBusy(true);
        const start = Date.now();
        selected = selected.filter(t => !suspended.has(t.key));
        const keys = new Set(selected.map(t => t.key));
        for (const key of keys) update(key, { fetching: false, error: undefined, done: false, progress: { loaded: 0, counting: Boolean(prepareRef.current) } });
        if (firstSweep) {
          firstSweep = false;
          for (const key of keys) update(key, { progress: { loaded: 0, counting: false } });
          selected = await runInitialBurst(selected, { signal, onUpdate: update, beforeRequest: visible });
        } else await prepareRef.current?.(keys, signal, update);
        await runSweep(selected, { signal, onUpdate: update, beforeRequest: visible });
        abortIfNeeded(signal); setBusy(false);
        while (!signal.aborted) {
          if (pendingAll.current) {
            pendingAll.current = false; pendingKeys.current.clear(); suspended.clear(); selected = targets; break;
          }
          if (pendingKeys.current.size) {
            selected = targets.filter(t => pendingKeys.current.has(t.key));
            for (const t of selected) suspended.delete(t.key);
            pendingKeys.current.clear();
            if (selected.length) break;
          }
          const delay = nextSweepDelay(intervalRef.current, start, Date.now());
          if (delay === 0) { selected = targets; break; }
          await sleep(delay); abortIfNeeded(signal);
          if (intervalRef.current !== null && Date.now() >= start + intervalRef.current) { selected = targets; break; }
        }
      }
    }
    void loop().catch(error => {
      if (!signal.aborted) {
        for (const key of eligible) update(key, { done: true, fetching: false, error: error instanceof Error ? error : new Error(String(error)) });
        setBusy(false);
      }
    });
    return () => { controller.abort(); document.removeEventListener('visibilitychange', visibilityChange); };
  }, [targets, token, initialBurst]);
  return { states, busy, refresh };
}

let previousToken: string | null = null;
let authScope = 0;
/** Cache identity contains a generation, never a PAT; credentials changes cannot reuse other accounts' data. */
export function useAuthScope(token: string | null): number {
  if (token !== previousToken) { previousToken = token; authScope++; }
  return authScope;
}
