import { useQueries, type UseQueryResult } from "@tanstack/react-query";
import { fetchRepoPipeline, type RepoPipeline } from "../lib/githubActions";
import { useToken } from "../lib/token";
import { useRefreshInterval } from "../lib/refreshInterval";
import { type PipelineTarget } from "../config/schema";

export interface PipelineQuery {
  target: PipelineTarget;
  query: UseQueryResult<RepoPipeline, Error>;
}

export function useAllPipelines(
  targets: PipelineTarget[],
  enabled: boolean,
  disabledKeys?: ReadonlySet<string>,
): PipelineQuery[] {
  const token = useToken();
  const { value: intervalMs } = useRefreshInterval();

  const results = useQueries({
    queries: targets.map((target) => {
      const { repo, pipeline } = target;
      const isDisabled = (disabledKeys?.has(target.key) ?? false) || !enabled;
      const autoRefreshOn = !isDisabled && intervalMs !== null;
      const refetchInterval = autoRefreshOn ? intervalMs : (false as const);
      return {
        queryKey: [
          "repo-pipeline",
          repo.owner,
          repo.name,
          pipeline.workflow,
          pipeline.branch,
          pipeline.runsToShow,
          token ? "auth" : "anon",
        ],
        queryFn: () => fetchRepoPipeline(repo.owner, repo.name, pipeline),
        enabled: Boolean(token) && !isDisabled,
        refetchInterval,
        refetchIntervalInBackground: false,
        refetchOnWindowFocus: autoRefreshOn,
        staleTime: 30_000,
        retry: 1,
      };
    }),
  });

  return targets.map((target, i) => ({ target, query: results[i] }));
}
