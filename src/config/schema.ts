import { z } from "zod";
import rawGroups from "./repos.json";

export const RepoSchema = z.object({
  owner: z.string().min(1),
  name: z.string().min(1),
  label: z.string().optional(),
});

export const RepoGroupSchema = z.object({
  name: z.string().min(1),
  repos: z.array(RepoSchema).min(1),
});

export const GroupsSchema = z.array(RepoGroupSchema);

export type Repo = z.infer<typeof RepoSchema>;
export type RepoGroup = z.infer<typeof RepoGroupSchema>;

export const groups: RepoGroup[] = GroupsSchema.parse(rawGroups);

export const repos: Repo[] = groups.flatMap((g) => g.repos);

export function repoKey(r: Pick<Repo, "owner" | "name">): string {
  return `${r.owner}/${r.name}`;
}
