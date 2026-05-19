import type { PullRequestNode } from "./github";
import { deriveStatus } from "./status";

export interface Filters {
  search: string;
  hideDrafts: boolean;
  onlyMine: boolean;
  failingOnly: boolean;
}

export const defaultFilters: Filters = {
  search: "",
  hideDrafts: false,
  onlyMine: false,
  failingOnly: false,
};

export function matchesFilters(
  pr: PullRequestNode,
  filters: Filters,
  viewer: string | null,
): boolean {
  if (filters.hideDrafts && pr.isDraft) return false;
  if (filters.onlyMine) {
    if (!viewer) return false;
    if (pr.author?.login !== viewer) return false;
  }
  if (filters.failingOnly) {
    const status = deriveStatus(pr);
    if (status.overall !== "failure" && status.overall !== "changes_requested") {
      return false;
    }
  }
  if (filters.search.trim().length > 0) {
    const q = filters.search.trim().toLowerCase();
    const haystack = [
      pr.title,
      String(pr.number),
      pr.author?.login ?? "",
      pr.headRefName,
      pr.baseRefName,
    ]
      .join(" ")
      .toLowerCase();
    if (!haystack.includes(q)) return false;
  }
  return true;
}
