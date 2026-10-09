import { useMemo } from 'react';
import { useQueries, useQueryClient } from '@tanstack/react-query';
import { fetchRepoPipeline, type RepoPipeline } from '../lib/githubActions';
import { useToken } from '../lib/token';
import { useRefreshInterval } from '../lib/refreshInterval';
import { type PipelineTarget } from '../config/schema';
import { type RollingTarget } from '../lib/rollingRefresh';
import { useRollingRefresh, useAuthScope } from './useRollingRefresh';
import type { RadarQuery } from './usePullRequests';

export interface PipelineQuery { target: PipelineTarget; query: RadarQuery<RepoPipeline>; }
export function useAllPipelines(targets: PipelineTarget[], enabled: boolean, disabledKeys?: ReadonlySet<string>) {
  const token = useToken(), auth = useAuthScope(token), client = useQueryClient();
  const { value: interval } = useRefreshInterval();
  const descriptors = useMemo(() => targets.map(target => {
    const {repo,pipeline} = target;
    const queryKey = ['repo-pipeline', auth, repo.owner, repo.name, pipeline.workflow, pipeline.branch, pipeline.runsToShow, pipeline.prodEnvironment];
    return { target, queryKey, key: JSON.stringify(queryKey) };
  }), [targets, auth]);
  const observers = useQueries({ queries: descriptors.map(d => ({
    queryKey: d.queryKey, enabled: false, refetchOnWindowFocus: false, refetchOnReconnect: false, retry: false,
    queryFn: async (): Promise<RepoPipeline> => { throw new Error('Use rolling refresh'); },
  })) });
  const jobs = useMemo<RollingTarget[]>(() => descriptors.filter(d => enabled && !disabledKeys?.has(d.target.key)).map(d => ({
    key: d.key, create: () => async (signal, initial) => ({ done: true, data: await fetchRepoPipeline(d.target.repo.owner, d.target.repo.name, d.target.pipeline, token ?? undefined, signal, initial) }),
  })), [descriptors, enabled, disabledKeys, token]);
  const { states, busy, refresh } = useRollingRefresh({ targets: jobs, interval, token, initialBurst: true,
    onComplete(key, data) { const d = descriptors.find(d => d.key === key); if (d) client.setQueryData(d.queryKey, data); },
  });
  const entries: PipelineQuery[] = descriptors.map((d, i) => {
    const observer = observers[i], state = states[d.key];
    const data = observer.data;
    return { target: d.target, query: { data, error: state?.error, isFetching: Boolean(state?.fetching),
      isPending: !data && !state?.error, isError: Boolean(state?.error), isSuccess: Boolean(data),
      dataUpdatedAt: observer.dataUpdatedAt, refetch: () => refresh(d.key) } };
  });
  return { entries, busy, refresh };
}
