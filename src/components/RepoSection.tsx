import { ExternalLink, AlertOctagon, Loader2 } from "lucide-react";
import type { RepoQuery } from "../hooks/usePullRequests";
import { matchesFilters, type Filters } from "../lib/filters";
import { PrCard } from "./PrCard";
import { EmptyState } from "./EmptyState";
import { repoKey } from "../config/schema";

interface RepoSectionProps {
  entry: RepoQuery;
  filters: Filters;
  viewer: string | null;
}

export function RepoSection({ entry, filters, viewer }: RepoSectionProps) {
  const { repo, query } = entry;
  const key = repoKey(repo);
  const repoUrl = `https://github.com/${repo.owner}/${repo.name}`;

  const allPrs = query.data?.pullRequests.nodes ?? [];
  const filteredPrs = allPrs.filter((pr) => matchesFilters(pr, filters, viewer));
  const isCollapsed = query.isSuccess && allPrs.length === 0;

  return (
    <section className={isCollapsed ? "" : "space-y-3"}>
      <header className="flex items-center gap-2">
        <a
          href={repoUrl}
          target="_blank"
          rel="noreferrer"
          className="group inline-flex items-center gap-1 text-base font-semibold text-slate-800 dark:text-slate-200 hover:underline"
        >
          <span className="font-mono">{key}</span>
          <ExternalLink className="h-3.5 w-3.5 opacity-0 group-hover:opacity-60 transition-opacity" />
        </a>
        {query.isFetching && (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" aria-label="refreshing" />
        )}
        <span className="text-xs text-slate-500 dark:text-slate-400 ml-auto tabular-nums">
          {query.isSuccess
            ? filteredPrs.length === allPrs.length
              ? `${allPrs.length} open`
              : `${filteredPrs.length} / ${allPrs.length}`
            : ""}
        </span>
      </header>

      {query.isError && (
        <div className="card p-4 flex items-start gap-2 border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40">
          <AlertOctagon className="h-4 w-4 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-red-700 dark:text-red-300">
            <p className="font-medium">Failed to load PRs</p>
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="card h-32 animate-pulse bg-slate-100 dark:bg-slate-900"
            />
          ))}
        </div>
      )}

      {query.isSuccess && allPrs.length > 0 && filteredPrs.length === 0 && (
        <EmptyState
          title="No PRs match the current filters"
          description="Try clearing the search or toggles."
        />
      )}

      {query.isSuccess && filteredPrs.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-3">
          {filteredPrs.map((pr) => (
            <PrCard key={pr.id} pr={pr} />
          ))}
        </div>
      )}
    </section>
  );
}
