import type { ReviewActivityPullRequest, ReviewState } from "./github";

/** Rolling window the leaderboard is scored over. */
export type ReviewWindow = "1d" | "7d" | "30d";

export interface ReviewWindowOption {
  value: ReviewWindow;
  /** Compact label for the segmented control. */
  label: string;
  /** Prose used in headings and summaries. */
  description: string;
  days: number;
}

export const REVIEW_WINDOW_OPTIONS: ReviewWindowOption[] = [
  { value: "1d", label: "24h", description: "the last 24 hours", days: 1 },
  { value: "7d", label: "7 days", description: "the last 7 days", days: 7 },
  { value: "30d", label: "30 days", description: "the last 30 days", days: 30 },
];

export const DEFAULT_REVIEW_WINDOW: ReviewWindow = "7d";

const DAY_MS = 24 * 60 * 60 * 1000;

export function reviewWindowOption(w: ReviewWindow): ReviewWindowOption {
  return (
    REVIEW_WINDOW_OPTIONS.find((o) => o.value === w) ??
    REVIEW_WINDOW_OPTIONS[1]
  );
}

/** Start of the window as an ISO timestamp, usable in a GitHub search query. */
export function reviewWindowStart(w: ReviewWindow, now = Date.now()): string {
  return new Date(now - reviewWindowOption(w).days * DAY_MS).toISOString();
}

const DEPENDABOT_LOGINS = new Set([
  "dependabot[bot]",
  "dependabot-preview[bot]",
  "dependabot",
]);

export function isDependabot(login: string | undefined | null): boolean {
  return login ? DEPENDABOT_LOGINS.has(login.toLowerCase()) : false;
}

/** Review states that represent an actual, submitted review. */
const COUNTED_STATES: ReadonlySet<ReviewState> = new Set<ReviewState>([
  "APPROVED",
  "CHANGES_REQUESTED",
  "COMMENTED",
  "DISMISSED",
]);

export interface ReviewerStat {
  login: string;
  avatarUrl: string | null;
  /** Distinct pull requests reviewed inside the window -- the ranking metric. */
  prCount: number;
  /** Total submitted reviews, which may exceed `prCount`. */
  reviewCount: number;
  approvals: number;
  changesRequested: number;
  commented: number;
  /** Repos (owner/name) the reviewer touched. */
  repos: string[];
  /** Share of all counted PR reviews, 0..1. */
  share: number;
  /** Most recent counted review, as an epoch millisecond timestamp. */
  lastReviewAt: number;
}

export interface ReviewLeaderboard {
  reviewers: ReviewerStat[];
  /** Sum of every reviewer's `prCount`. */
  totalPrReviews: number;
  /** Sum of every reviewer's `reviewCount`. */
  totalReviews: number;
  /** Distinct pull requests that received at least one counted review. */
  reviewedPrs: number;
  /** Pull requests skipped because dependabot authored them. */
  skippedDependabotPrs: number;
}

export interface AggregateOptions {
  window: ReviewWindow;
  includeDependabot: boolean;
  /** When set, only these (lowercased) logins are ranked. */
  members?: ReadonlySet<string>;
  /** Overridable for tests; defaults to now. */
  now?: number;
}

interface Accumulator extends Omit<ReviewerStat, "repos" | "share"> {
  prs: Set<string>;
  repoSet: Set<string>;
}

/**
 * Fold per-repo review activity into a ranked leaderboard. Pure: the same
 * input always yields the same output.
 */
export function aggregateReviewers(
  results: Array<{ repo: string; pullRequests: ReviewActivityPullRequest[] }>,
  options: AggregateOptions,
): ReviewLeaderboard {
  const since = new Date(
    reviewWindowStart(options.window, options.now),
  ).getTime();
  const byLogin = new Map<string, Accumulator>();
  const reviewedPrs = new Set<string>();
  let skippedDependabotPrs = 0;

  for (const { repo, pullRequests } of results) {
    for (const pr of pullRequests) {
      const prAuthor = pr.author?.login ?? null;
      if (!options.includeDependabot && isDependabot(prAuthor)) {
        skippedDependabotPrs++;
        continue;
      }
      const prKey = `${repo}#${pr.number}`;
      for (const review of pr.reviews?.nodes ?? []) {
        const login = review.author?.login;
        if (!login) continue;
        if (options.members && !options.members.has(login.toLowerCase())) {
          continue;
        }
        if (!COUNTED_STATES.has(review.state)) continue;
        if (!review.submittedAt) continue;
        const at = new Date(review.submittedAt).getTime();
        if (!Number.isFinite(at) || at < since) continue;
        // Reviewing your own PR is not reviewing.
        if (prAuthor && login.toLowerCase() === prAuthor.toLowerCase()) continue;

        let acc = byLogin.get(login);
        if (!acc) {
          acc = {
            login,
            avatarUrl: review.author?.avatarUrl ?? null,
            prCount: 0,
            reviewCount: 0,
            approvals: 0,
            changesRequested: 0,
            commented: 0,
            lastReviewAt: 0,
            prs: new Set<string>(),
            repoSet: new Set<string>(),
          };
          byLogin.set(login, acc);
        }
        acc.reviewCount++;
        acc.prs.add(prKey);
        acc.repoSet.add(repo);
        if (review.state === "APPROVED") acc.approvals++;
        else if (review.state === "CHANGES_REQUESTED") acc.changesRequested++;
        else acc.commented++;
        if (at > acc.lastReviewAt) acc.lastReviewAt = at;
        if (!acc.avatarUrl && review.author?.avatarUrl) {
          acc.avatarUrl = review.author.avatarUrl;
        }
        reviewedPrs.add(prKey);
      }
    }
  }

  const accumulators = [...byLogin.values()];
  for (const acc of accumulators) acc.prCount = acc.prs.size;
  const totalPrReviews = accumulators.reduce((sum, a) => sum + a.prCount, 0);

  const reviewers: ReviewerStat[] = accumulators
    .map((acc) => ({
      login: acc.login,
      avatarUrl: acc.avatarUrl,
      prCount: acc.prCount,
      reviewCount: acc.reviewCount,
      approvals: acc.approvals,
      changesRequested: acc.changesRequested,
      commented: acc.commented,
      repos: [...acc.repoSet].sort(),
      share: totalPrReviews > 0 ? acc.prCount / totalPrReviews : 0,
      lastReviewAt: acc.lastReviewAt,
    }))
    .sort(
      (a, b) =>
        b.prCount - a.prCount ||
        b.reviewCount - a.reviewCount ||
        b.approvals - a.approvals ||
        a.login.localeCompare(b.login),
    );

  return {
    reviewers,
    totalPrReviews,
    totalReviews: accumulators.reduce((sum, a) => sum + a.reviewCount, 0),
    reviewedPrs: reviewedPrs.size,
    skippedDependabotPrs,
  };
}

export interface ReviewBadge {
  label: string;
  /** Explains what earned the badge, shown in its tooltip. */
  title: string;
  className: string;
}

/** Playful, purely derived badges shown next to a reviewer. */
export function reviewBadges(
  stat: ReviewerStat,
  rank: number,
  window: ReviewWindow,
): ReviewBadge[] {
  const badges: ReviewBadge[] = [];
  const perDay = stat.prCount / reviewWindowOption(window).days;

  if (rank === 0 && stat.prCount > 0) {
    badges.push({
      label: "Reigning",
      title: "Rank 1: most pull requests reviewed in this timeframe",
      className:
        "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
    });
  }
  if (perDay >= 3) {
    badges.push({
      label: "On fire",
      title: `Averaging ${
        Math.round(perDay * 10) / 10
      } reviewed pull requests per day \u2014 3 or more earns this`,
      className:
        "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
    });
  }
  if (stat.repos.length >= 5) {
    const names = stat.repos.map((r) => r.split("/").pop() ?? r);
    const shown =
      names.length > 4
        ? `${names.slice(0, 4).join(", ")}, +${names.length - 4} more`
        : names.join(", ");
    badges.push({
      label: "Everywhere",
      title: `Reviewed in ${stat.repos.length} different repos \u2014 5 or more earns this (${shown})`,
      className:
        "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300",
    });
  }
  if (stat.prCount >= 3 && stat.changesRequested === 0 && stat.approvals > 0) {
    badges.push({
      label: "Rubber stamp",
      title: "Reviewed 3+ pull requests, approved them all and never requested changes",
      className:
        "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
    });
  }
  if (stat.changesRequested >= 3) {
    badges.push({
      label: "Gatekeeper",
      title: `Requested changes ${stat.changesRequested} times \u2014 3 or more earns this`,
      className:
        "bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300",
    });
  }
  return badges;
}
