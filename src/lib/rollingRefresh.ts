export interface LoadProgress {
  loaded: number;
  total?: number;
  counting?: boolean;
  countError?: string;
}
export interface RollingUpdate {
  done?: boolean;
  data?: unknown;
  progress?: LoadProgress;
  error?: Error;
  fetching?: boolean;
}
export interface RollingTarget {
  key: string;
  create: (initial?: boolean) => (signal: AbortSignal, initial?: boolean) => Promise<RollingUpdate>;
}
export interface SweepOptions {
  signal: AbortSignal;
  onUpdate: (key: string, update: RollingUpdate) => void;
  now?: () => number;
  wait?: (ms: number, signal: AbortSignal) => Promise<void>;
  spacingMs?: number;
  beforeRequest?: () => Promise<void>;
}
export function abortIfNeeded(signal: AbortSignal): void {
  if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
}
export function waitFor(ms: number, signal: AbortSignal): Promise<void> {
  abortIfNeeded(signal);
  return new Promise((resolve, reject) => {
    const cancel = () => { clearTimeout(timer); reject(new DOMException('Cancelled', 'AbortError')); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', cancel); resolve(); }, Math.max(0, ms));
    signal.addEventListener('abort', cancel, { once: true });
  });
}
export function nextSweepDelay(interval: number | null, start: number, end: number): number | null {
  return interval === null ? null : Math.max(0, interval - (end - start));
}

/** A step retains its cursor until it succeeds. Each successful page goes to the tail. */
export async function runSweep(targets: readonly RollingTarget[], options: SweepOptions): Promise<void> {
  const now = options.now ?? Date.now, wait = options.wait ?? waitFor;
  const spacing = options.spacingMs ?? 1000;
  const queue = [...new Map(targets.map(t => [t.key, { key: t.key, step: t.create(), retries: 0, ready: 0 }])).values()];
  let lastStart = -Infinity;
  while (queue.length) {
    abortIfNeeded(options.signal);
    await options.beforeRequest?.();
    abortIfNeeded(options.signal);
    const readyIndex = queue.findIndex(job => job.ready <= now());
    if (readyIndex === -1) {
      await wait(Math.max(0, Math.min(...queue.map(job => job.ready)) - now()), options.signal);
      continue;
    }
    const [job] = queue.splice(readyIndex, 1);
    const spacingWait = Math.max(0, lastStart + spacing - now());
    if (spacingWait) await wait(spacingWait, options.signal);
    await options.beforeRequest?.();
    abortIfNeeded(options.signal);
    lastStart = now();
    options.onUpdate(job.key, { fetching: true });
    try {
      const update = await job.step(options.signal);
      abortIfNeeded(options.signal);
      options.onUpdate(job.key, { ...update, fetching: false });
      job.retries = 0;
      if (!update.done) queue.push(job);
    } catch (cause) {
      abortIfNeeded(options.signal);
      const error = cause instanceof Error ? cause : new Error(String(cause));
      const metadata = error as Error & { retryable?: boolean; cooldownUntil?: number };
      if (metadata.retryable && job.retries < 1) {
        job.retries++;
        job.ready = Math.max(now() + 2000, metadata.cooldownUntil ?? 0);
        options.onUpdate(job.key, { fetching: false });
        queue.push(job);
      } else options.onUpdate(job.key, { done: true, error, fetching: false });
    }
  }
}

export interface CursorPage<T> {
  restart?: boolean;
  nodes: T[];
  totalCount: number;
  pageInfo: { hasNextPage: boolean; endCursor: string | null };
}
/** Accumulate a replacement privately; a failed page leaves the cursor/data unchanged for retry. */
export function createPagedLoad<T extends { id: string }>(
  loadPage: (cursor: string | null, signal: AbortSignal, initial?: boolean) => Promise<CursorPage<T>>,
  filter: (node: T) => boolean = () => true,
  estimatedTotal?: number,
): (signal: AbortSignal, initial?: boolean) => Promise<RollingUpdate> {
  let cursor: string | null = null;
  const cursors = new Set<string>(), nodes = new Map<string, T>();
  return async (signal, initial) => {
    const page = await loadPage(cursor, signal, initial);
    abortIfNeeded(signal);
    if (page.restart) { cursor = null; cursors.clear(); nodes.clear(); }
    const next = page.pageInfo.endCursor;
    if (page.pageInfo.hasNextPage && (!next || next === cursor || cursors.has(next))) throw new Error('GitHub pagination cursor did not advance');
    for (const node of page.nodes) if (filter(node)) nodes.set(node.id, node);
    if (next) cursors.add(next);
    cursor = next;
    return { done: !page.pageInfo.hasNextPage, data: [...nodes.values()],
      progress: { loaded: nodes.size, total: estimatedTotal ?? page.totalCount, counting: false } };
  };
}

/** Keep displayed identities until a complete replacement can safely remove absent items. */
export function mergeNodes<T extends { id: string }>(previous: readonly T[], incoming: readonly T[], complete: boolean): T[] {
  if (complete) return [...incoming];
  const merged = new Map(previous.map(node => [node.id, node]));
  for (const node of incoming) merged.set(node.id, node);
  return [...merged.values()];
}

/** First-page warmup is bounded, not a repository-wide all-at-once request burst. */
export async function runInitialBurst(targets: readonly RollingTarget[], options: SweepOptions): Promise<RollingTarget[]> {
  let next = 0;
  const pending = new Map<number, RollingTarget>();
  await Promise.all(Array.from({ length: Math.min(4, targets.length) }, async () => {
    while (next < targets.length) {
      abortIfNeeded(options.signal);
      const index = next++;
      await options.beforeRequest?.();
      abortIfNeeded(options.signal);
      const target = targets[index], step = target.create(true);
      options.onUpdate(target.key, { fetching: true });
      try {
        const update = await step(options.signal, true);
        abortIfNeeded(options.signal);
        options.onUpdate(target.key, { ...update, fetching: false });
        if (!update.done) pending.set(index, { ...target, create: () => step });
      } catch (cause) {
        abortIfNeeded(options.signal);
        const error = cause instanceof Error ? cause : new Error(String(cause));
        const metadata = error as Error & { status?: number; retryable?: boolean };
        if (!metadata.retryable) options.onUpdate(target.key, { done: true, error, fetching: false });
        else { options.onUpdate(target.key, { fetching: false }); pending.set(index, { ...target, create: () => step }); }
      }
    }
  }));
  return [...pending.entries()].sort(([a], [b]) => a - b).map(([, target]) => target);
}
