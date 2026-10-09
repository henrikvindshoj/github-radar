import {
  CheckCircle2,
  XCircle,
  Clock,
  MinusCircle,
  AlertCircle,
  GitMerge,
  GitPullRequestDraft,
} from "lucide-react";
import { PrChecks } from "./PrChecks";
import type { StatusBreakdown } from "../lib/status";
import { statusColorClass, statusLabel } from "../lib/status";

interface StatusFooterProps {
  status: StatusBreakdown;
  owner: string;
  name: string;
  sha?: string;
  prUrl: string;
}

function CheckIcon({ state }: { state: StatusBreakdown["checks"] }) {
  switch (state) {
    case "SUCCESS":
      return <CheckCircle2 className="h-3.5 w-3.5 text-status-success" />;
    case "FAILURE":
    case "ERROR":
      return <XCircle className="h-3.5 w-3.5 text-status-failure" />;
    case "PENDING":
    case "EXPECTED":
      return <Clock className="h-3.5 w-3.5 text-status-pending" />;
    case "NONE":
    default:
      return <MinusCircle className="h-3.5 w-3.5 text-status-neutral" />;
  }
}

function ReviewIcon({ state }: { state: StatusBreakdown["review"] }) {
  switch (state) {
    case "APPROVED":
      return <CheckCircle2 className="h-3.5 w-3.5 text-status-success" />;
    case "CHANGES_REQUESTED":
      return <AlertCircle className="h-3.5 w-3.5 text-status-changes" />;
    case "REVIEW_REQUIRED":
      return <Clock className="h-3.5 w-3.5 text-status-pending" />;
    default:
      return <MinusCircle className="h-3.5 w-3.5 text-status-neutral" />;
  }
}

function MergeIcon({ state, isDraft }: { state: StatusBreakdown["mergeable"]; isDraft: boolean }) {
  if (isDraft) {
    return <GitPullRequestDraft className="h-3.5 w-3.5 text-status-neutral" />;
  }
  switch (state) {
    case "MERGEABLE":
      return <GitMerge className="h-3.5 w-3.5 text-status-success" />;
    case "CONFLICTING":
      return <AlertCircle className="h-3.5 w-3.5 text-status-failure" />;
    case "UNKNOWN":
    default:
      return <Clock className="h-3.5 w-3.5 text-status-neutral" />;
  }
}

function reviewLabel(state: StatusBreakdown["review"]): string {
  switch (state) {
    case "APPROVED":
      return "Approved";
    case "CHANGES_REQUESTED":
      return "Changes requested";
    case "REVIEW_REQUIRED":
      return "Awaiting review";
    default:
      return "No review";
  }
}

function checksLabel(state: StatusBreakdown["checks"]): string {
  switch (state) {
    case "SUCCESS":
      return "Checks passing";
    case "FAILURE":
      return "Checks failing";
    case "ERROR":
      return "Checks errored";
    case "PENDING":
    case "EXPECTED":
      return "Checks running";
    case "NONE":
    default:
      return "No checks";
  }
}

function mergeLabel(state: StatusBreakdown["mergeable"], isDraft: boolean): string {
  if (isDraft) return "Draft";
  switch (state) {
    case "MERGEABLE":
      return "Mergeable";
    case "CONFLICTING":
      return "Conflicts";
    case "UNKNOWN":
    default:
      return "Mergeable: unknown";
  }
}

export function StatusFooter({ status, owner, name, sha, prUrl }: StatusFooterProps) {
  return (
    <div className="mt-auto">
      <div className="flex items-center justify-between gap-2 px-3 py-2 text-xs text-slate-600 dark:text-slate-400 border-t border-slate-100 dark:border-slate-800">
        <PrChecks owner={owner} name={name} sha={sha} prUrl={prUrl} label={checksLabel(status.checks)}>
          <CheckIcon state={status.checks} />
          <span className="hidden sm:inline">Checks</span>
        </PrChecks>
        <div
          className="flex items-center gap-1"
          title={reviewLabel(status.review)}
          aria-label={reviewLabel(status.review)}
        >
          <ReviewIcon state={status.review} />
          <span className="hidden sm:inline">Review</span>
        </div>
        <div
          className="flex items-center gap-1"
          title={mergeLabel(status.mergeable, status.isDraft)}
          aria-label={mergeLabel(status.mergeable, status.isDraft)}
        >
          <MergeIcon state={status.mergeable} isDraft={status.isDraft} />
          <span className="hidden sm:inline">Merge</span>
        </div>
      </div>
      <div
        className={`status-bar ${statusColorClass(status.overall)}`}
        title={statusLabel(status.overall)}
        aria-label={statusLabel(status.overall)}
      />
    </div>
  );
}
