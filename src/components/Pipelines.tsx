import { useEffect, useMemo, useRef } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useAllPipelines, type PipelineQuery } from "../hooks/usePipelines";
import { useConfig } from "../config/configStore";
import {
  matchesPipelineStateFilters,
  matchesPipelineFilters,
  type PipelineFilters,
} from "../lib/pipelineFilters";
import { runsUpToFirstProd } from "../lib/pipelineStatus";
import { useCollapsedGroups } from "../lib/collapsedGroups";
import { PipelineRepoSection } from "./PipelineRepoSection";
import { EmptyState } from "./EmptyState";

interface PipelinesProps {
  filters: PipelineFilters;
  viewer: string | null;
  onSummaryChange: (s: { isFetching: boolean; lastUpdated: number }) => void;
  refreshSignal: number;
}

const COLLAPSE_STORAGE_KEY = "ghpr.collapsedPipelineGroups";

export function Pipelines({
  filters,
  viewer,
  onSummaryChange,
  refreshSignal,
}: PipelinesProps) {
  const { isCollapsed, toggle } = useCollapsedGroups(COLLAPSE_STORAGE_KEY);
  const { pipelineGroups, pipelineTargets } = useConfig();

  const disabledKeys = useMemo(() => {
    const set = new Set<string>();
    for (const g of pipelineGroups) {
      if (isCollapsed(g.name)) {
        for (const t of g.targets) set.add(t.key);
      }
    }
    return set;
  }, [isCollapsed, pipelineGroups]);

  const { entries, busy, refresh } = useAllPipelines(pipelineTargets, true, disabledKeys);

  const entryByKey = useMemo(() => {
    const map = new Map<string, PipelineQuery>();
    for (const e of entries) map.set(e.target.key, e);
    return map;
  }, [entries]);

  const isFetching = busy;
  const lastUpdated = entries.reduce<number>((acc, e) => {
    const t = e.query.dataUpdatedAt;
    return t > acc ? t : acc;
  }, 0);

  useEffect(() => {
    onSummaryChange({ isFetching, lastUpdated });
  }, [isFetching, lastUpdated, onSummaryChange]);

  const consumedRefresh = useRef(refreshSignal);
  useEffect(() => {
    if (refreshSignal === consumedRefresh.current) return;
    consumedRefresh.current = refreshSignal;
    refresh();
  }, [refreshSignal, refresh]);

  if (pipelineGroups.length === 0) {
    return (
      <EmptyState
        title="No pipelines configured"
        description='Set "pipelineDefaults" or a per-repo "pipeline" / "pipelines" in the Config editor (gear menu).'
      />
    );
  }

  return (
    <div className="space-y-10">
      {pipelineGroups.map((group) => {
        const collapsed = isCollapsed(group.name);
        const targetCount = group.targets.length;

        const visibleEntries = collapsed
          ? []
          : group.targets
              .map((t) => entryByKey.get(t.key))
              .filter((e): e is PipelineQuery => Boolean(e))
              .filter((e) => hasContentToRender(e, filters, viewer));

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
                  ({targetCount} {targetCount === 1 ? "pipeline" : "pipelines"})
                </span>
              </button>
            </h2>
            {showBody && (
              <div className="grid grid-cols-1 gap-x-6 gap-y-6 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {visibleEntries.map((entry) => (
                  <PipelineRepoSection
                    key={entry.target.key}
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

function hasContentToRender(
  entry: PipelineQuery,
  filters: PipelineFilters,
  viewer: string | null,
): boolean {
  const q = entry.query;
  if (q.isPending || q.isError) return true;
  if (q.isSuccess) {
    const dataRuns = q.data?.runs ?? [];
    if (!matchesPipelineStateFilters(dataRuns, filters)) return false;
    const runs = runsUpToFirstProd(dataRuns);
    return runs.some((run) => matchesPipelineFilters(run, filters, viewer));
  }
  return true;
}
