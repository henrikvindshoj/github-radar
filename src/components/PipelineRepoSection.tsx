import {
  ExternalLink,
  AlertOctagon,
  Loader2,
  Workflow,
  CheckCircle2,
} from "lucide-react";
import type { PipelineQuery } from "../hooks/usePipelines";
import {
  latestDeploymentFailing,
  matchesPipelineFilters,
  type PipelineFilters,
} from "../lib/pipelineFilters";
import {
  derivePipelineState,
  isPendingProd,
  runsUpToFirstProd,
} from "../lib/pipelineStatus";
import { PipelineRunRow } from "./PipelineRunRow";
import { EmptyState } from "./EmptyState";

interface PipelineRepoSectionProps {
  entry: PipelineQuery;
  filters: PipelineFilters;
  viewer: string | null;
}

export function PipelineRepoSection({
  entry,
  filters,
  viewer,
}: PipelineRepoSectionProps) {
  const { repo, pipeline } = entry.target;
  const { query } = entry;
  const repoUrl = `https://github.com/${repo.owner}/${repo.name}`;
  const prodEnv = pipeline.prodEnvironment;

  const dataRuns = query.data?.runs ?? [];
  const sectionVisible =
    !filters.failingOnly || latestDeploymentFailing(dataRuns);
  const allRuns = runsUpToFirstProd(dataRuns);
  const filteredRuns = sectionVisible
    ? allRuns.filter((run) => matchesPipelineFilters(run, filters, viewer))
    : [];
  const pendingCount = allRuns.filter((run) =>
    isPendingProd(derivePipelineState(run)),
  ).length;

  return (
    <section className="space-y-3">
      <header className="flex flex-wrap items-center gap-2">
        <a
          href={repoUrl}
          target="_blank"
          rel="noreferrer"
          className="group inline-flex items-center gap-1 text-base font-semibold text-slate-800 dark:text-slate-200 hover:underline"
        >
          <span className="font-mono">{repo.name}</span>
          <ExternalLink className="h-3.5 w-3.5 opacity-0 group-hover:opacity-60 transition-opacity" />
        </a>

        <a
          href={query.data?.workflow.url ?? `${repoUrl}/actions`}
          target="_blank"
          rel="noreferrer"
          className="pill bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
          title={`Workflow: ${pipeline.workflow} (${pipeline.branch})`}
        >
          <Workflow className="h-3 w-3" />
          <span className="truncate max-w-[16rem]">{pipeline.workflow}</span>
        </a>

        {query.isFetching && (
          <Loader2
            className="h-3.5 w-3.5 animate-spin text-slate-400"
            aria-label="refreshing"
          />
        )}

        {query.isSuccess && (
          <span className="ml-auto">
            {pendingCount > 0 ? (
              <span className="pill bg-status-changes/10 text-status-changes">
                {pendingCount} awaiting {prodEnv}
              </span>
            ) : (
              <span className="pill bg-status-success/10 text-status-success">
                <CheckCircle2 className="h-3 w-3" />
                Up to date in {prodEnv}
              </span>
            )}
          </span>
        )}
      </header>

      {query.isError && (
        <div className="card p-4 flex items-start gap-2 border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40">
          <AlertOctagon className="h-4 w-4 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-red-700 dark:text-red-300">
            <p className="font-medium">Failed to load pipeline</p>
            <p className="text-xs mt-0.5">{query.error?.message}</p>
            <button
              type="button"
              onClick={() => query.refetch()}
              className="mt-2 text-xs font-medium underline hover:no-underline"
            >
              Retry
            </button>
          </div>
        </div>
      )}

      {query.isPending && !query.isError && (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="card h-14 animate-pulse bg-slate-100 dark:bg-slate-900"
            />
          ))}
        </div>
      )}

      {query.isSuccess && allRuns.length === 0 && (
        <EmptyState
          title="No runs found"
          description={`No "${pipeline.workflow}" runs on ${pipeline.branch}.`}
        />
      )}

      {query.isSuccess && allRuns.length > 0 && filteredRuns.length === 0 && (
        <EmptyState
          title="No runs match the current filters"
          description="Try clearing the search or toggles."
        />
      )}

      {query.isSuccess && filteredRuns.length > 0 && (
        <div className="card divide-y divide-slate-200 overflow-hidden dark:divide-slate-800">
          {filteredRuns.map((run) => (
            <PipelineRunRow key={run.id} run={run} prodEnvironment={prodEnv} />
          ))}
        </div>
      )}
    </section>
  );
}
