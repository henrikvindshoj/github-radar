import { githubRequest, GitHubApiError } from "./githubRequest.ts";

export interface CheckDetail {
  id: string;
  name: string;
  outcome: "success" | "failure" | "pending" | "neutral";
  label: string;
  url?: string;
}

export interface CheckDetailsError { source: "Check runs" | "Commit statuses"; message: string }
export interface PrCheckDetails { checks: CheckDetail[]; errors: CheckDetailsError[] }

const conclusions: Record<string, [CheckDetail["outcome"], string]> = {
  success: ["success", "Passed"], failure: ["failure", "Failed"], timed_out: ["failure", "Timed out"],
  action_required: ["failure", "Action required"], cancelled: ["neutral", "Cancelled"],
  skipped: ["neutral", "Skipped"], neutral: ["neutral", "Neutral"], stale: ["neutral", "Stale"],
};
const pending: Record<string, string> = {
  queued: "Queued", in_progress: "In progress", waiting: "Waiting", requested: "Requested", pending: "Pending",
};
const states: Record<string, [CheckDetail["outcome"], string]> = {
  success: ["success", "Passed"], failure: ["failure", "Failed"], error: ["failure", "Error"], pending: ["pending", "Pending"],
};

function invalid(): never { throw new GitHubApiError("Invalid GitHub check details response"); }
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid();
  return value as Record<string, unknown>;
}
function text(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) invalid();
  return value;
}
function id(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) invalid();
  return value;
}
function link(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value !== "string") invalid();
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : undefined;
  } catch { return undefined; }
}

function checkRun(value: unknown): CheckDetail {
  const run = record(value);
  const status = text(run.status);
  const conclusion = run.conclusion;
  if (conclusion !== null && (typeof conclusion !== "string" || !Object.hasOwn(conclusions, conclusion))) invalid();
  let outcome: CheckDetail["outcome"], label: string;
  if (status === "completed") {
    if (typeof conclusion !== "string") invalid();
    [outcome, label] = conclusions[conclusion];
  } else {
    if (!Object.hasOwn(pending, status)) invalid();
    outcome = "pending"; label = pending[status];
  }
  return { id: `check:${id(run.id)}`, name: text(run.name), outcome, label, url: link(run.html_url) };
}

function commitStatus(value: unknown): CheckDetail {
  const status = record(value);
  const state = text(status.state);
  if (!Object.hasOwn(states, state)) invalid();
  const [outcome, label] = states[state];
  return { id: `status:${id(status.id)}`, name: text(status.context), outcome, label, url: link(status.target_url) };
}

/** Lazily read current check runs and each status context's latest result, with shared pacing. */
export async function fetchPrChecks(
  owner: string, name: string, sha: string, token: string, signal?: AbortSignal, request = githubRequest,
): Promise<PrCheckDetails> {
  signal?.throwIfAborted();
  const checks = new Map<string, CheckDetail>();
  const errors: CheckDetailsError[] = [];
  const base = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/commits/${encodeURIComponent(sha)}`;
  for (const endpoint of [
    { source: "Check runs" as const, path: "check-runs?filter=latest", field: "check_runs", normalize: checkRun },
    { source: "Commit statuses" as const, path: "status?", field: "statuses", normalize: commitStatus },
  ]) {
    try {
      let received = 0;
      for (let page = 1; ; page++) {
        signal?.throwIfAborted();
        const url = `${base}/${endpoint.path}${endpoint.path.endsWith("?") ? "" : "&"}per_page=100&page=${page}`;
        const payload = record(await request<unknown>(url, {
          headers: { Accept: "application/vnd.github+json" },
        }, token, signal));
        signal?.throwIfAborted();
        const total = id(payload.total_count);
        const entries = payload[endpoint.field];
        if (!Array.isArray(entries) || entries.length > 100 || (!entries.length && received < total)) invalid();
        // Validate the entire page before publishing any of its results.
        const normalized = entries.map(endpoint.normalize);
        normalized.forEach(check => checks.set(check.id, check));
        received += entries.length;
        if (received >= total) break;
      }
    } catch (error) {
      signal?.throwIfAborted();
      if (error instanceof Error && error.name === "AbortError") throw error;
      errors.push({ source: endpoint.source, message: error instanceof GitHubApiError ? error.message : "Could not load GitHub check details" });
    }
  }
  signal?.throwIfAborted();
  return { checks: [...checks.values()], errors };
}
