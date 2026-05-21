import { z } from "zod";
import rawConfig from "./repos.json";

const RepoEntrySchema = z.object({
  owner: z.string().min(1),
  name: z.string().min(1),
  label: z.string().optional(),
  team: z.string().min(1).optional(),
});

const RepoGroupSchema = z.object({
  name: z.string().min(1),
  repos: z.array(RepoEntrySchema).min(1),
});

const TeamsSchema = z.record(
  z.string().min(1),
  z.array(z.string().min(1)).min(1),
);

const ConfigSchema = z
  .object({
    teams: TeamsSchema,
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
            message: `Repo ${r.owner}/${r.name} references unknown team "${r.team}". Define it under "teams" in repos.json.`,
          });
        }
      }
    }
  });

const parsed = ConfigSchema.parse(rawConfig);

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

const teamMembersByName = new Map<string, ReadonlySet<string>>();
for (const [name, members] of Object.entries(parsed.teams)) {
  teamMembersByName.set(
    name,
    new Set(members.map((m) => m.toLowerCase())),
  );
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

export const groups: RepoGroup[] = parsed.groups.map((g) => ({
  name: g.name,
  repos: g.repos.map(resolveRepo),
}));

export const repos: Repo[] = groups.flatMap((g) => g.repos);

export function repoKey(r: Pick<Repo, "owner" | "name">): string {
  return `${r.owner}/${r.name}`;
}
