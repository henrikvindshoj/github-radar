import { useEffect, useMemo } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useAllPullRequests, type RepoQuery } from "../hooks/usePullRequests";
import { groups, repos, repoKey } from "../config/schema";
import type { Filters } from "../lib/filters";
import { useCollapsedGroups } from "../lib/collapsedGroups";
import { RepoSection } from "./RepoSection";

interface DashboardProps {
  filters: Filters;
  viewer: string | null;
  onSummaryChange: (s: { isFetching: boolean; lastUpdated: number }) => void;
  refreshSignal: number;
}

export function Dashboard({
  filters,
  viewer,
  onSummaryChange,
  refreshSignal,
}: DashboardProps) {
  const { isCollapsed, toggle } = useCollapsedGroups();

  const disabledKeys = useMemo(() => {
    const set = new Set<string>();
    for (const g of groups) {
      if (isCollapsed(g.name)) {
        for (const r of g.repos) set.add(repoKey(r));
      }
    }
    return set;
  }, [isCollapsed]);

  const entries = useAllPullRequests(repos, disabledKeys);

  const entryByKey = useMemo(() => {
    const map = new Map<string, RepoQuery>();
    for (const e of entries) map.set(repoKey(e.repo), e);
    return map;
  }, [entries]);

  const isFetching = entries.some((e) => e.query.isFetching);
  const lastUpdated = entries.reduce<number>((acc, e) => {
    const t = e.query.dataUpdatedAt;
    return t > acc ? t : acc;
  }, 0);

  useEffect(() => {
    onSummaryChange({ isFetching, lastUpdated });
  }, [isFetching, lastUpdated, onSummaryChange]);

  useEffect(() => {
    if (refreshSignal === 0) return;
    for (const e of entries) {
      if (disabledKeys.has(repoKey(e.repo))) continue;
      e.query.refetch();
    }
  }, [refreshSignal]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-10">
      {groups.map((group) => {
        const collapsed = isCollapsed(group.name);
        const repoCount = group.repos.length;

        const visibleEntries = collapsed
          ? []
          : group.repos
              .map((repo) => entryByKey.get(repoKey(repo)))
              .filter((e): e is RepoQuery => Boolean(e))
              .filter(hasContentToRender);

        const showBody = !collapsed && visibleEntries.length > 0;

        return (
          <section key={group.name} className={showBody ? "space-y-4" : ""}>
            <h2 className="border-b border-slate-200 dark:border-slate-800 pb-1">
              <button
                type="button"
                onClick={() => toggle(group.name)}
                aria-expanded={!collapsed}
                className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 transition-colors"
              >
                {collapsed ? (
                  <ChevronRight className="h-3.5 w-3.5" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5" />
                )}
                <span>{group.name}</span>
                <span className="font-normal text-slate-400 dark:text-slate-500 normal-case tracking-normal">
                  ({repoCount} {repoCount === 1 ? "repo" : "repos"})
                </span>
              </button>
            </h2>
            {showBody && (
              <div className="space-y-6">
                {visibleEntries.map((entry) => (
                  <RepoSection
                    key={repoKey(entry.repo)}
                    entry={entry}
                    filters={filters}
                    viewer={viewer}
                  />
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

function hasContentToRender(entry: RepoQuery): boolean {
  const q = entry.query;
  if (q.isPending || q.isError) return true;
  if (q.isSuccess) {
    return (q.data?.pullRequests.nodes.length ?? 0) > 0;
  }
  return true;
}
