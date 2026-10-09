/** One shared HTTP gate: paced initial pages, exclusive normal work, and provider cooldown. */
export class GitHubApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly retryable = false,
    public readonly cooldownUntil?: number,
  ) {
    super(message);
    this.name = "GitHubApiError";
  }
}

interface TransportRuntime {
  now: () => number;
  wait: (milliseconds: number, signal?: AbortSignal) => Promise<void>;
  fetch: typeof fetch;
}

function wait(milliseconds: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    signal?.throwIfAborted();
    const abort = () => { clearTimeout(timer); reject(signal?.reason); };
    const timer = setTimeout(() => { signal?.removeEventListener("abort", abort); resolve(); }, milliseconds);
    signal?.addEventListener("abort", abort, { once: true });
  });
}

export async function waitForVisibility(signal?: AbortSignal): Promise<void> {
  if (typeof document === "undefined" || !document.hidden) return;
  await new Promise<void>((resolve, reject) => {
    signal?.throwIfAborted();
    const cleanup = () => { document.removeEventListener("visibilitychange", visible); signal?.removeEventListener("abort", abort); };
    const visible = () => { if (!document.hidden) { cleanup(); resolve(); } };
    const abort = () => { cleanup(); reject(signal?.reason); };
    document.addEventListener("visibilitychange", visible);
    signal?.addEventListener("abort", abort, { once: true });
  });
}

function headerCooldown(headers: Headers, now: number): number {
  const retry = headers.get("retry-after");
  const seconds = retry === null ? NaN : Number(retry);
  const retryTime = Number.isFinite(seconds) ? now + Math.max(0, seconds) * 1000 : Date.parse(retry ?? "");
  const reset = headers.get("x-ratelimit-remaining") === "0" ? Number(headers.get("x-ratelimit-reset")) * 1000 : 0;
  return Math.max(now, Number.isFinite(retryTime) ? retryTime : 0, Number.isFinite(reset) ? reset : 0);
}

export function createGitHubTransport(overrides: Partial<TransportRuntime> = {}) {
  const runtime: TransportRuntime = {
    now: () => Date.now(), wait,
    fetch: (input, init) => globalThis.fetch(input, init),
    ...overrides,
  };
  let tail: Promise<unknown> = Promise.resolve();
  let lastStart = -Infinity;
  let cooldownUntil = 0;
  let active = 0;
  let normalActive = false;
  const released = new Set<() => void>();

  async function waitForSlot(initial: boolean, signal?: AbortSignal): Promise<void> {
    while (normalActive || active >= (initial ? 4 : 1)) {
      await new Promise<void>((resolve, reject) => {
        signal?.throwIfAborted();
        const cleanup = () => { released.delete(wake); signal?.removeEventListener("abort", abort); };
        const wake = () => { cleanup(); resolve(); };
        const abort = () => { cleanup(); reject(signal?.reason); };
        released.add(wake);
        signal?.addEventListener("abort", abort, { once: true });
      });
    }
  }

  return async function request<T>(url: string, init: RequestInit, token: string, signal?: AbortSignal, initial = false): Promise<T> {
    signal?.throwIfAborted();
    if (!token) return Promise.reject(new GitHubApiError("Missing GitHub token", 401));
    // Serialize reservations, not response lifetimes; normal reservations wait for every slot.
    const reservation = tail.then(async () => {
      await waitForSlot(initial, signal);
      signal?.throwIfAborted();
      await waitForVisibility(signal);
      let delay = Math.max(lastStart + (initial ? 250 : 1000), cooldownUntil) - runtime.now();
      while (delay > 0) {
        await runtime.wait(delay, signal);
        await waitForVisibility(signal);
        delay = Math.max(lastStart + (initial ? 250 : 1000), cooldownUntil) - runtime.now();
      }
      await waitForVisibility(signal);
      signal?.throwIfAborted();
      lastStart = runtime.now();
      active++;
      normalActive = !initial;
    });
    tail = reservation.catch(() => {});
    await reservation;
    try {
      let res: Response;
      try {
        res = await runtime.fetch(url, {
          ...init, signal,
          headers: { ...Object.fromEntries(new Headers(init.headers)), Authorization: `Bearer ${token}` },
        });
      } catch (error) {
        signal?.throwIfAborted();
        if (error instanceof Error && error.name === "AbortError") throw error;
        throw new GitHubApiError("GitHub network request failed", undefined, true);
      }
      signal?.throwIfAborted();
      let json: unknown;
      try { json = await res.json(); } catch { json = undefined; }
      signal?.throwIfAborted();
      const payload = json as { message?: unknown; errors?: Array<{ type?: string; message?: string }> } | undefined;
      const errors = Array.isArray(payload?.errors) ? payload.errors : [];
      // Inspect messages only to classify provider limits; never display upstream bodies.
      const message = typeof payload?.message === "string" ? payload.message : "";
      const rateLimited = res.status === 429 ||
        (res.status === 403 && (res.headers.get("x-ratelimit-remaining") === "0" || /rate limit|secondary limit|abuse/i.test(message))) ||
        errors.some(e => e.type === "RATE_LIMITED" || /rate limit|secondary limit/i.test(e.message ?? ""));
      if (rateLimited) {
        const indicated = headerCooldown(res.headers, runtime.now());
        const secondary = /secondary|abuse/i.test(message) || errors.some(e => /secondary|abuse/i.test(e.message ?? ""));
        cooldownUntil = Math.max(cooldownUntil, indicated, secondary || indicated <= runtime.now() ? runtime.now() + 60000 : 0);
        throw new GitHubApiError("GitHub rate limit reached", res.status, true, cooldownUntil);
      }
      if (res.headers.get("x-ratelimit-remaining") === "0") cooldownUntil = Math.max(cooldownUntil, headerCooldown(res.headers, runtime.now()));
      if (!res.ok) throw new GitHubApiError(`GitHub API request failed (${res.status})`, res.status, res.status >= 500 || res.status === 408);
      if (errors.length) {
        const forbidden = errors.some(e => e.type === "FORBIDDEN" || e.type === "UNAUTHORIZED");
        const missing = errors.some(e => e.type === "NOT_FOUND");
        const transient = errors.some(e => e.type === "INTERNAL" || e.type === "SERVICE_UNAVAILABLE" || e.type === "TIMEOUT");
        throw new GitHubApiError("GitHub GraphQL request failed", forbidden ? 403 : missing ? 404 : undefined, transient);
      }
      if (json === undefined || json === null) throw new GitHubApiError("Invalid GitHub response", res.status, true);
      return json as T;
    } finally {
      active--;
      if (!initial) normalActive = false;
      for (const wake of [...released]) wake();
    }
  };
}

export const githubRequest = createGitHubTransport();
