import type {
  CheckState,
  MergeableState,
  PullRequestNode,
  ReviewDecision,
} from "./github";

export type OverallStatus =
  | "success"
  | "failure"
  | "pending"
  | "changes_requested"
  | "neutral";

export interface StatusBreakdown {
  overall: OverallStatus;
  checks: CheckState | "NONE";
  review: ReviewDecision;
  mergeable: MergeableState;
  isDraft: boolean;
}

export function getCheckState(pr: PullRequestNode): CheckState | "NONE" {
  const rollup = pr.commits.nodes[0]?.commit.statusCheckRollup;
  return rollup?.state ?? "NONE";
}

export function deriveStatus(pr: PullRequestNode): StatusBreakdown {
  const checks = getCheckState(pr);
  const review = pr.reviewDecision;
  const mergeable = pr.mergeable;

  let overall: OverallStatus;
  if (pr.isDraft) {
    overall = "neutral";
  } else if (checks === "FAILURE" || checks === "ERROR") {
    overall = "failure";
  } else if (review === "CHANGES_REQUESTED") {
    overall = "changes_requested";
  } else if (checks === "PENDING" || checks === "EXPECTED") {
    overall = "pending";
  } else if (checks === "SUCCESS" && review === "APPROVED") {
    overall = "success";
  } else if (checks === "SUCCESS") {
    overall = "pending";
  } else {
    overall = "neutral";
  }

  return {
    overall,
    checks,
    review,
    mergeable,
    isDraft: pr.isDraft,
  };
}

export function statusColorClass(s: OverallStatus): string {
  switch (s) {
    case "success":
      return "bg-status-success";
    case "failure":
      return "bg-status-failure";
    case "pending":
      return "bg-status-pending";
    case "changes_requested":
      return "bg-status-changes";
    case "neutral":
    default:
      return "bg-status-neutral";
  }
}

export function statusLabel(s: OverallStatus): string {
  switch (s) {
    case "success":
      return "Ready to merge";
    case "failure":
      return "Checks failing";
    case "pending":
      return "Awaiting checks or review";
    case "changes_requested":
      return "Changes requested";
    case "neutral":
    default:
      return "No status";
  }
}
