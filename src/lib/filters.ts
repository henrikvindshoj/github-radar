import type { PullRequestNode } from "./github";

export interface Filters {
  search: string;
  hideDrafts: boolean;
  onlyMine: boolean;
  failingOnly: boolean;
  needsReview: boolean;
}

export const defaultFilters: Filters = {
  search: "",
  hideDrafts: false,
  onlyMine: false,
  failingOnly: false,
  needsReview: false,
};

export function matchesFilters(
  pr: PullRequestNode,
  filters: Filters,
  viewer: string | null,
): boolean {
  const isMine = Boolean(viewer && pr.author?.login.toLowerCase() === viewer.toLowerCase());
  if (filters.hideDrafts && pr.isDraft) return false;
  if (filters.onlyMine) {
    if (!viewer) return false;
    if (!isMine) return false;
  }
  if (filters.failingOnly) {
    if (!viewer || isMine || pr.isDraft) return false;
    if ((pr.viewerActiveReviews?.totalCount ?? 0) > 0) return false;
    if (pr.reviewDecision === "APPROVED") return false;
  }
  if (filters.needsReview) {
    if (pr.isDraft) return false;
    if (pr.reviewDecision !== "REVIEW_REQUIRED") return false;
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
