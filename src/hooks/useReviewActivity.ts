import { useQueries, type UseQueryResult } from "@tanstack/react-query";
import {
  fetchRepoReviewActivity,
  type RepoReviewActivity,
} from "../lib/github";
import { useToken } from "../lib/token";
import { useRefreshInterval } from "../lib/refreshInterval";
import { type Repo } from "../config/schema";
import { reviewWindowStart, type ReviewWindow } from "../lib/reviews";

export interface ReviewActivityQuery {
  repo: Repo;
  query: UseQueryResult<RepoReviewActivity, Error>;
}

export function useReviewActivity(
  repos: Repo[],
  window: ReviewWindow,
): ReviewActivityQuery[] {
  const token = useToken();
  const { value: intervalMs } = useRefreshInterval();
  // Bucket the window start so the query key (and cache) is stable between
  // renders instead of changing on every millisecond.
  const since = bucketedWindowStart(window);

  const results = useQueries({
    queries: repos.map((repo) => {
      const autoRefreshOn = intervalMs !== null;
      return {
        queryKey: [
          "repo-review-activity",
          repo.owner,
          repo.name,
          window,
          since,
          token ? "auth" : "anon",
        ],
        queryFn: () => fetchRepoReviewActivity(repo.owner, repo.name, since),
        enabled: Boolean(token),
        refetchInterval: autoRefreshOn ? intervalMs : (false as const),
        refetchIntervalInBackground: false,
        refetchOnWindowFocus: autoRefreshOn,
        staleTime: 60_000,
        retry: 1,
      };
    }),
  });

  return repos.map((repo, i) => ({ repo, query: results[i] }));
}

const BUCKET_MS = 5 * 60_000;

function bucketedWindowStart(window: ReviewWindow): string {
  const now = Math.floor(Date.now() / BUCKET_MS) * BUCKET_MS;
  return reviewWindowStart(window, now);
}
