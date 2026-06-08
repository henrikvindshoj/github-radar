import type { WorkflowRun } from "./githubActions";
import {
  derivePipelineState,
  isPendingProd,
  runsUpToFirstProd,
} from "./pipelineStatus";

export interface PipelineFilters {
  search: string;
  /** Only show runs that are not yet in PROD (awaiting / running). */
  pendingProdOnly: boolean;
  /** Only show pipelines whose most recent deployment failed. */
  failingOnly: boolean;
  /** Only show runs triggered by the signed-in user. */
  onlyMine: boolean;
  /**
   * Hide "Awaiting deployment" runs whose title starts with "Bump"
   * (typically dependabot-authored PRs).
   */
  notBump: boolean;
  /** Hide pipelines that have nothing awaiting PROD (already up to date). */
  hideUpToDate: boolean;
}

/**
 * Whether a pipeline's *latest* deployment is failing. `runs` must be ordered
 * newest-first (as returned by the GitHub API).
 */
export function latestDeploymentFailing(runs: WorkflowRun[]): boolean {
  const latest = runs[0];
  return latest ? derivePipelineState(latest) === "failed" : false;
}

/**
 * Whether a pipeline has any run still awaiting / progressing toward PROD.
 * `runs` must be ordered newest-first (as returned by the GitHub API).
 */
export function hasPendingProd(runs: WorkflowRun[]): boolean {
  return runsUpToFirstProd(runs).some((run) =>
    isPendingProd(derivePipelineState(run)),
  );
}

export const defaultPipelineFilters: PipelineFilters = {
  search: "",
  pendingProdOnly: false,
  failingOnly: false,
  onlyMine: false,
  notBump: false,
  hideUpToDate: false,
};

export function matchesPipelineFilters(
  run: WorkflowRun,
  filters: PipelineFilters,
  viewer: string | null,
): boolean {
  const state = derivePipelineState(run);

  if (
    filters.notBump &&
    state === "awaiting" &&
    run.display_title.trim().toLowerCase().startsWith("bump")
  ) {
    return false;
  }
  if (filters.pendingProdOnly && !isPendingProd(state)) return false;
  if (filters.onlyMine) {
    if (!viewer) return false;
    if (run.actor?.login !== viewer) return false;
  }
  if (filters.search.trim().length > 0) {
    const q = filters.search.trim().toLowerCase();
    const haystack = [
      run.display_title,
      run.name ?? "",
      String(run.run_number),
      run.actor?.login ?? "",
      run.head_branch ?? "",
      run.head_sha.slice(0, 7),
    ]
      .join(" ")
      .toLowerCase();
    if (!haystack.includes(q)) return false;
  }
  return true;
}
