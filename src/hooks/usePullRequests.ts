import { useQueries, type UseQueryResult } from "@tanstack/react-query";
import { fetchRepoPullRequests, type RepoPullRequests } from "../lib/github";
import { useToken } from "../lib/token";
import { useRefreshInterval } from "../lib/refreshInterval";
import { repoKey, type Repo } from "../config/schema";

export interface RepoQuery {
  repo: Repo;
  query: UseQueryResult<RepoPullRequests, Error>;
}

export function useAllPullRequests(
  repos: Repo[],
  disabledKeys?: ReadonlySet<string>,
): RepoQuery[] {
  const token = useToken();
  const { value: intervalMs } = useRefreshInterval();

  const results = useQueries({
    queries: repos.map((repo) => {
      const key = repoKey(repo);
      const isDisabled = disabledKeys?.has(key) ?? false;
      const refetchInterval =
        isDisabled || intervalMs === null ? (false as const) : intervalMs;
      return {
        queryKey: ["repo-prs", repo.owner, repo.name, token ? "auth" : "anon"],
        queryFn: () => fetchRepoPullRequests(repo.owner, repo.name),
        enabled: Boolean(token) && !isDisabled,
        refetchInterval,
        refetchIntervalInBackground: false,
        refetchOnWindowFocus: !isDisabled,
        staleTime: 30_000,
        retry: 1,
      };
    }),
  });
  return repos.map((repo, i) => ({ repo, query: results[i] }));
}

export function summarizeQueries(queries: RepoQuery[]) {
  const isFetching = queries.some((q) => q.query.isFetching);
  const lastUpdated = queries.reduce<number>((acc, q) => {
    const t = q.query.dataUpdatedAt;
    return t > acc ? t : acc;
  }, 0);
  const errors = queries
    .map((q) => ({ key: repoKey(q.repo), error: q.query.error }))
    .filter((e) => Boolean(e.error));
  return { isFetching, lastUpdated, errors };
}
