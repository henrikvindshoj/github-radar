import { z } from "zod";
import rawDefaultConfig from "./repos.json";

// Pipeline (GitHub Actions) configuration. `pipelineDefaults` applies to every
// repo; each repo may override any field or opt out via `enabled: false`.
const PipelineDefaultsSchema = z.object({
  workflow: z.string().min(1).optional(),
  branch: z.string().min(1).optional(),
  runsToShow: z.number().int().positive().max(50).optional(),
  prodEnvironment: z.string().min(1).optional(),
});

const RepoPipelineSchema = PipelineDefaultsSchema.extend({
  enabled: z.boolean().optional(),
});

const RepoEntrySchema = z.object({
  owner: z.string().min(1),
  name: z.string().min(1),
  label: z.string().optional(),
  team: z.string().min(1).optional(),
  // A single pipeline...
  pipeline: RepoPipelineSchema.optional(),
  // ...or several pipelines to monitor from the same repo.
  pipelines: z.array(RepoPipelineSchema).optional(),
});

const RepoGroupSchema = z.object({
  name: z.string().min(1),
  repos: z.array(RepoEntrySchema).min(1),
});

const TeamsSchema = z.record(
  z.string().min(1),
  z.array(z.string().min(1)).min(1),
);

export const ConfigSchema = z
  .object({
    teams: TeamsSchema,
    pipelineDefaults: PipelineDefaultsSchema.optional(),
    groups: z.array(RepoGroupSchema),
  })
  .superRefine((cfg, ctx) => {
    for (let gi = 0; gi < cfg.groups.length; gi++) {
      const g = cfg.groups[gi];
      for (let ri = 0; ri < g.repos.length; ri++) {
        const r = g.repos[ri];
        if (r.team && !(r.team in cfg.teams)) {
          ctx.addIssue({
            code: "custom",
            path: ["groups", gi, "repos", ri, "team"],
            message: `Repo ${r.owner}/${r.name} references unknown team "${r.team}". Define it under "teams".`,
          });
        }
      }
    }
  });

export type Config = z.infer<typeof ConfigSchema>;

export interface ResolvedPipeline {
  /** Workflow display name or file name to match (e.g. "Build and publish main"). */
  workflow: string;
  /** Branch whose runs to track. */
  branch: string;
  /** How many recent runs to fetch and display. */
  runsToShow: number;
  /** Human label for the production deployment target (display only). */
  prodEnvironment: string;
}

export interface Repo {
  owner: string;
  name: string;
  label?: string;
  team?: string;
  teamMembers?: ReadonlySet<string>;
}

export interface RepoGroup {
  name: string;
  repos: Repo[];
}

/** One monitored pipeline: a repo paired with a resolved pipeline config. */
export interface PipelineTarget {
  repo: Repo;
  pipeline: ResolvedPipeline;
  /** Stable unique key: owner/name#workflow@branch. */
  key: string;
}

export interface PipelineGroup {
  name: string;
  targets: PipelineTarget[];
}

/** Fully resolved configuration ready for consumption by the UI. */
export interface ResolvedConfig {
  groups: RepoGroup[];
  repos: Repo[];
  pipelineGroups: PipelineGroup[];
  pipelineTargets: PipelineTarget[];
}

const DEFAULT_BRANCH = "main";
const DEFAULT_RUNS_TO_SHOW = 10;
const DEFAULT_PROD_ENVIRONMENT = "PROD";

export function repoKey(r: Pick<Repo, "owner" | "name">): string {
  return `${r.owner}/${r.name}`;
}

export function pipelineKey(repo: Repo, p: ResolvedPipeline): string {
  return `${repoKey(repo)}#${p.workflow}@${p.branch}`;
}

/**
 * Turn a validated raw config into the resolved shape used by the app. Pure:
 * the same input always yields the same output, with no module-level state.
 */
export function resolveConfig(parsed: Config): ResolvedConfig {
  const teamMembersByName = new Map<string, ReadonlySet<string>>();
  for (const [name, members] of Object.entries(parsed.teams)) {
    teamMembersByName.set(name, new Set(members.map((m) => m.toLowerCase())));
  }

  const pipelineDefaults = parsed.pipelineDefaults;

  function resolvePipeline(
    input: z.infer<typeof RepoPipelineSchema> | undefined,
  ): ResolvedPipeline | undefined {
    const enabled = input?.enabled ?? true;
    if (!enabled) return undefined;

    const workflow = input?.workflow ?? pipelineDefaults?.workflow;
    if (!workflow) return undefined;

    return {
      workflow,
      branch: input?.branch ?? pipelineDefaults?.branch ?? DEFAULT_BRANCH,
      runsToShow:
        input?.runsToShow ??
        pipelineDefaults?.runsToShow ??
        DEFAULT_RUNS_TO_SHOW,
      prodEnvironment:
        input?.prodEnvironment ??
        pipelineDefaults?.prodEnvironment ??
        DEFAULT_PROD_ENVIRONMENT,
    };
  }

  function resolveRepo(input: z.infer<typeof RepoEntrySchema>): Repo {
    const repo: Repo = {
      owner: input.owner,
      name: input.name,
      label: input.label,
      team: input.team,
    };
    if (input.team) {
      repo.teamMembers = teamMembersByName.get(input.team);
    }
    return repo;
  }

  function resolvePipelineList(
    input: z.infer<typeof RepoEntrySchema>,
  ): ResolvedPipeline[] {
    let inputs: Array<z.infer<typeof RepoPipelineSchema> | undefined>;
    if (input.pipelines && input.pipelines.length > 0) {
      inputs = input.pipelines;
    } else if (input.pipeline) {
      inputs = [input.pipeline];
    } else {
      inputs = [undefined]; // may still resolve from pipelineDefaults
    }

    const resolved: ResolvedPipeline[] = [];
    const seen = new Set<string>();
    for (const i of inputs) {
      const p = resolvePipeline(i);
      if (!p) continue;
      const k = `${p.workflow}@${p.branch}`;
      if (seen.has(k)) continue;
      seen.add(k);
      resolved.push(p);
    }
    return resolved;
  }

  const groups: RepoGroup[] = parsed.groups.map((g) => ({
    name: g.name,
    repos: g.repos.map(resolveRepo),
  }));

  const repos: Repo[] = groups.flatMap((g) => g.repos);

  const pipelineGroups: PipelineGroup[] = parsed.groups
    .map((g) => {
      const targets: PipelineTarget[] = [];
      for (const entry of g.repos) {
        const repo = resolveRepo(entry);
        for (const pipeline of resolvePipelineList(entry)) {
          targets.push({ repo, pipeline, key: pipelineKey(repo, pipeline) });
        }
      }
      return { name: g.name, targets };
    })
    .filter((g) => g.targets.length > 0);

  const pipelineTargets: PipelineTarget[] = pipelineGroups.flatMap(
    (g) => g.targets,
  );

  return { groups, repos, pipelineGroups, pipelineTargets };
}

/** The bundled configuration, used as the seed/default for new browsers. */
export const defaultConfig: Config = ConfigSchema.parse(rawDefaultConfig);
export const defaultResolvedConfig: ResolvedConfig = resolveConfig(defaultConfig);
