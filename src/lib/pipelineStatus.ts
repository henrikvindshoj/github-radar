import type { WorkflowRun } from "./githubActions";

export type PipelineState =
  | "in_prod" // completed successfully -> deployed to PROD
  | "awaiting" // waiting on deployment approval / action required
  | "running" // queued or in progress
  | "failed" // failed / timed out / startup failure
  | "neutral"; // cancelled / skipped / stale / unknown

export function derivePipelineState(run: WorkflowRun): PipelineState {
  const status = run.status ?? "";
  const conclusion = run.conclusion;

  if (status === "completed") {
    switch (conclusion) {
      case "success":
        return "in_prod";
      case "failure":
      case "timed_out":
      case "startup_failure":
        return "failed";
      case "action_required":
        return "awaiting";
      default:
        // cancelled, skipped, stale, neutral, null
        return "neutral";
    }
  }

  if (status === "waiting" || status === "action_required" || status === "pending") {
    return "awaiting";
  }

  if (status === "queued" || status === "in_progress" || status === "requested") {
    return "running";
  }
  return "neutral";
}

/** A run that has not yet reached PROD but is still progressing toward it. */
export function isPendingProd(state: PipelineState): boolean {
  return state === "awaiting" || state === "running";
}

/** Current pipeline state always comes from the newest unfiltered run. */
export function latestPipelineState(runs: WorkflowRun[]): PipelineState | null {
  return runs[0] ? derivePipelineState(runs[0]) : null;
}

export function summarizePipeline(runs: WorkflowRun[], prodEnvironment: string) {
  const state = latestPipelineState(runs);
  const label = state === "in_prod"
    ? `Up to date in ${prodEnvironment}`
    : state === "awaiting"
      ? `1 awaiting ${prodEnvironment}`
      : state === null
        ? "No runs"
        : pipelineLabel(state, prodEnvironment);
  return { state, label };
}

/**
 * Given runs ordered newest-first, return every run up to and including the
 * first one that is in PROD. Anything older than the latest PROD deployment is
 * already shipped and not interesting. If no run is in PROD, returns all runs.
 */
export function runsUpToFirstProd<T extends WorkflowRun>(runs: T[]): T[] {
  const idx = runs.findIndex((run) => derivePipelineState(run) === "in_prod");
  return idx === -1 ? runs : runs.slice(0, idx + 1);
}

/** Keep both endpoints visible around the expandable, newest-first middle. */
export function splitPipelineHistory<T extends WorkflowRun>(runs: T[]) {
  return {
    newest: runs[0],
    middle: runs.slice(1, -1),
    oldest: runs.length > 1 ? runs[runs.length - 1] : undefined,
  };
}

export function pipelineColorClass(state: PipelineState): string {
  switch (state) {
    case "in_prod":
      return "bg-status-success";
    case "awaiting":
      return "bg-status-changes";
    case "running":
      return "bg-status-pending";
    case "failed":
      return "bg-status-failure";
    case "neutral":
    default:
      return "bg-status-neutral";
  }
}

export function pipelineTextClass(state: PipelineState): string {
  switch (state) {
    case "in_prod":
      return "text-status-success";
    case "awaiting":
      return "text-status-changes";
    case "running":
      return "text-status-pending";
    case "failed":
      return "text-status-failure";
    case "neutral":
    default:
      return "text-status-neutral";
  }
}

/** Full literal class strings so Tailwind's JIT can detect them. */
export function pipelineBadgeClass(state: PipelineState): string {
  switch (state) {
    case "in_prod":
      return "bg-status-success/10 text-status-success";
    case "awaiting":
      return "bg-status-changes/10 text-status-changes";
    case "running":
      return "bg-status-pending/10 text-status-pending";
    case "failed":
      return "bg-status-failure/10 text-status-failure";
    case "neutral":
    default:
      return "bg-status-neutral/10 text-status-neutral";
  }
}

export function pipelineLabel(state: PipelineState, prodEnvironment: string): string {
  switch (state) {
    case "in_prod":
      return `In ${prodEnvironment}`;
    case "awaiting":
      return "Awaiting deployment";
    case "running":
      return "Running";
    case "failed":
      return "Failed";
    case "neutral":
    default:
      return "No deployment";
  }
}
