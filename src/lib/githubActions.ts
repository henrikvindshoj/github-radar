import { GitHubApiError } from "./github";
import { getToken } from "./token";
import type { ResolvedPipeline } from "../config/schema";

const REST_ENDPOINT = "https://api.github.com";

async function restGet<T>(path: string, token?: string): Promise<T> {
  const effectiveToken = token ?? getToken();
  if (!effectiveToken) {
    throw new GitHubApiError("Missing GitHub token", 401);
  }
  const res = await fetch(`${REST_ENDPOINT}${path}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${effectiveToken}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!res.ok) {
    let body = "";
    try {
      body = await res.text();
    } catch {
      // ignore
    }
    throw new GitHubApiError(
      `GitHub API ${res.status} ${res.statusText}${body ? `: ${body.slice(0, 200)}` : ""}`,
      res.status,
    );
  }
  return (await res.json()) as T;
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
): Promise<RepoPipeline> {
  const repoSummary = {
    nameWithOwner: `${owner}/${name}`,
    url: `https://github.com/${owner}/${name}`,
  };

  const workflowsData = await restGet<WorkflowsResponse>(
    `/repos/${owner}/${name}/actions/workflows?per_page=100`,
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
    `/repos/${owner}/${name}/actions/workflows/${matched.id}/runs?${params.toString()}`,
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
