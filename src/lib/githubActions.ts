import { GitHubApiError, githubRequest } from "./githubRequest.ts";
import { getToken } from "./token.ts";
import type { ResolvedPipeline } from "../config/schema";

function restGet<T>(path: string, token: string, signal?: AbortSignal, initial = false): Promise<T> {
  return githubRequest<T>(`https://api.github.com${path}`, {
    method: "GET",
    headers: { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" },
  }, token, signal, initial);
}

interface WorkflowSummary {
  id: number;
  name: string;
  path: string;
  state: string;
}

interface WorkflowsResponse {
  total_count: number;
  workflows: WorkflowSummary[];
}

export interface WorkflowRun {
  id: number;
  name: string | null;
  display_title: string;
  run_number: number;
  event: string;
  status: string | null;
  conclusion: string | null;
  html_url: string;
  head_branch: string | null;
  head_sha: string;
  created_at: string;
  run_started_at: string | null;
  updated_at: string;
  actor: { login: string; avatar_url: string } | null;
  head_commit: { message: string } | null;
}

interface RunsResponse {
  total_count: number;
  workflow_runs: WorkflowRun[];
}

export interface RepoPipeline {
  nameWithOwner: string;
  url: string;
  workflow: { id: number; name: string; path: string; url: string };
  runs: WorkflowRun[];
}

function basename(path: string): string {
  const parts = path.split("/");
  return parts[parts.length - 1] ?? path;
}

/**
 * Resolve the configured workflow against the repo's workflow list.
 * Matches on exact display name, then on file name (with or without extension).
 */
function matchWorkflow(
  workflows: WorkflowSummary[],
  configured: string,
): WorkflowSummary | undefined {
  const target = configured.trim();
  const targetLower = target.toLowerCase();
  return (
    workflows.find((w) => w.name === target) ??
    workflows.find((w) => w.name.toLowerCase() === targetLower) ??
    workflows.find((w) => basename(w.path) === target) ??
    workflows.find((w) => basename(w.path).toLowerCase() === targetLower) ??
    workflows.find(
      (w) => basename(w.path).replace(/\.ya?ml$/i, "").toLowerCase() ===
        targetLower.replace(/\.ya?ml$/i, ""),
    )
  );
}

export async function fetchRepoPipeline(
  owner: string,
  name: string,
  pipeline: ResolvedPipeline,
  token?: string,
  signal?: AbortSignal,
  initial = false,
): Promise<RepoPipeline> {
  const effectiveToken = token ?? getToken() ?? "";
  const repoSummary = {
    nameWithOwner: `${owner}/${name}`,
    url: `https://github.com/${owner}/${name}`,
  };

  const workflowsData = await restGet<WorkflowsResponse>(
    `/repos/${owner}/${name}/actions/workflows?per_page=100`, effectiveToken, signal, initial,
  );
  const matched = matchWorkflow(workflowsData.workflows, pipeline.workflow);
  if (!matched) {
    throw new GitHubApiError(
      `No workflow matching "${pipeline.workflow}" in ${owner}/${name}`,
      404,
    );
  }

  const params = new URLSearchParams({
    branch: pipeline.branch,
    per_page: String(pipeline.runsToShow),
  });
  const runsData = await restGet<RunsResponse>(
    `/repos/${owner}/${name}/actions/workflows/${matched.id}/runs?${params.toString()}`, effectiveToken, signal, initial,
  );

  return {
    ...repoSummary,
    workflow: {
      id: matched.id,
      name: matched.name,
      path: matched.path,
      url: `${repoSummary.url}/actions/workflows/${basename(matched.path)}`,
    },
    runs: runsData.workflow_runs,
  };
}
