import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { formatDistanceToNowStrict } from "date-fns";
import {
  AlertOctagon,
  Check,
  Crown,
  GitPullRequestArrow,
  Loader2,
  MessageSquare,
  Trophy,
  Users,
  XOctagon,
} from "lucide-react";
import { useReviewActivity } from "../hooks/useReviewActivity";
import { useConfig } from "../config/configStore";
import { repoKey } from "../config/schema";
import {
  aggregateReviewers,
  reviewBadges,
  reviewWindowOption,
  type ReviewBadge,
  type ReviewerStat,
  type ReviewWindow,
} from "../lib/reviews";
import { EmptyState } from "./EmptyState";

interface TopReviewersProps {
  window: ReviewWindow;
  includeDependabot: boolean;
  /** Selected team names; empty ranks every reviewer over every repo. */
  selectedTeams: string[];
  viewer: string | null;
  onSummaryChange: (s: { isFetching: boolean; lastUpdated: number }) => void;
  refreshSignal: number;
}

/** Animates from 0 to `value` so the leaderboard lands with a bit of drama. */
function useCountUp(value: number, durationMs = 700): number {
  const [shown, setShown] = useState(value);
  const fromRef = useRef(0);

  useEffect(() => {
    const from = fromRef.current;
    if (from === value) return;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - (1 - t) ** 3;
      setShown(Math.round(from + (value - from) * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
      else fromRef.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, durationMs]);

  return shown;
}

function Avatar({
  stat,
  className,
}: {
  stat: ReviewerStat;
  className: string;
}) {
  return stat.avatarUrl ? (
    <img
      src={stat.avatarUrl}
      alt={stat.login}
      loading="lazy"
      className={`rounded-full object-cover ${className}`}
    />
  ) : (
    <div
      className={`rounded-full bg-slate-200 dark:bg-slate-700 ${className}`}
    />
  );
}

function Breakdown({ stat }: { stat: ReviewerStat }) {
  return (
    <span className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
      <span
        className="inline-flex items-center gap-0.5"
        title={`${stat.approvals} approvals`}
      >
        <Check className="h-3 w-3 text-emerald-500" />
        {stat.approvals}
      </span>
      <span
        className="inline-flex items-center gap-0.5"
        title={`${stat.changesRequested} times requested changes`}
      >
        <XOctagon className="h-3 w-3 text-orange-500" />
        {stat.changesRequested}
      </span>
      <span
        className="inline-flex items-center gap-0.5"
        title={`${stat.commented} comment-only reviews`}
      >
        <MessageSquare className="h-3 w-3 text-slate-400" />
        {stat.commented}
      </span>
    </span>
  );
}

/** A badge pill that explains itself on hover or keyboard focus. */
function Badge({ badge }: { badge: ReviewBadge }) {
  const id = useId();
  return (
    <span className="group/badge relative inline-flex">
      <span
        tabIndex={0}
        aria-describedby={id}
        className={`pill cursor-help focus:outline-none focus-visible:ring-1 focus-visible:ring-slate-400 ${badge.className}`}
      >
        {badge.label}
      </span>
      <span
        role="tooltip"
        id={id}
        className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1.5 hidden w-max max-w-[15rem] -translate-x-1/2 rounded-md bg-slate-900 px-2 py-1 text-center text-[11px] font-normal leading-snug text-white shadow-lg group-hover/badge:block group-focus-within/badge:block dark:bg-slate-700"
      >
        {badge.title}
      </span>
    </span>
  );
}

function Badges({
  stat,
  rank,
  window,
}: {
  stat: ReviewerStat;
  rank: number;
  window: ReviewWindow;
}) {
  const badges = reviewBadges(stat, rank, window);
  if (badges.length === 0) return null;
  return (
    <span className="flex flex-wrap items-center gap-1">
      {badges.map((b) => (
        <Badge key={b.label} badge={b} />
      ))}
    </span>
  );
}

const PODIUM_STYLES = [
  {
    // 1st
    order: "order-2",
    height: "h-28",
    ring: "ring-4 ring-amber-400/80",
    avatar: "h-16 w-16",
    plinth:
      "bg-gradient-to-b from-amber-300 to-amber-500 dark:from-amber-400 dark:to-amber-600",
    medal: "\u{1F947}",
  },
  {
    // 2nd
    order: "order-1",
    height: "h-20",
    ring: "ring-4 ring-slate-300",
    avatar: "h-12 w-12",
    plinth:
      "bg-gradient-to-b from-slate-200 to-slate-400 dark:from-slate-400 dark:to-slate-600",
    medal: "\u{1F948}",
  },
  {
    // 3rd
    order: "order-3",
    height: "h-14",
    ring: "ring-4 ring-orange-300",
    avatar: "h-12 w-12",
    plinth:
      "bg-gradient-to-b from-orange-200 to-orange-400 dark:from-orange-400 dark:to-orange-600",
    medal: "\u{1F949}",
  },
] as const;

function PodiumPlace({
  stat,
  rank,
  window,
  isViewer,
}: {
  stat: ReviewerStat;
  rank: number;
  window: ReviewWindow;
  isViewer: boolean;
}) {
  const style = PODIUM_STYLES[rank];
  const count = useCountUp(stat.prCount);

  return (
    <div
      className={`flex w-full max-w-[13rem] flex-col items-center ${style.order}`}
    >
      <div className="relative animate-[podium-rise_500ms_ease-out_both]">
        {rank === 0 && (
          <Crown className="absolute -top-5 left-1/2 h-6 w-6 -translate-x-1/2 text-amber-400 drop-shadow animate-[crown-float_2.6s_ease-in-out_infinite]" />
        )}
        <Avatar stat={stat} className={`${style.avatar} ${style.ring}`} />
        <span
          className="absolute -bottom-1 -right-1 text-lg leading-none"
          aria-hidden
        >
          {style.medal}
        </span>
      </div>

      <a
        href={`https://github.com/${stat.login}`}
        target="_blank"
        rel="noreferrer"
        className="mt-2 max-w-full truncate text-sm font-semibold hover:underline"
        title={stat.login}
      >
        {stat.login}
        {isViewer && (
          <span className="ml-1 text-xs font-normal text-slate-400">(you)</span>
        )}
      </a>

      <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
        {Math.round(stat.share * 100)}% of the review load
      </span>

      <span className="mt-1 flex min-h-5 flex-wrap justify-center gap-1">
        <Badges stat={stat} rank={rank} window={window} />
      </span>

      <div
        className={`mt-2 flex w-full flex-col items-center justify-start rounded-t-md pt-2 text-slate-900 shadow-inner ${style.height} ${style.plinth} animate-[podium-rise_600ms_ease-out_both]`}
      >
        <span className="text-2xl font-bold leading-none tabular-nums">
          {count}
        </span>
        <span className="text-[10px] font-medium uppercase tracking-wider opacity-80">
          {stat.prCount === 1 ? "PR" : "PRs"}
        </span>
      </div>
    </div>
  );
}

function ReviewerRow({
  stat,
  rank,
  window,
  isViewer,
  maxCount,
}: {
  stat: ReviewerStat;
  rank: number;
  window: ReviewWindow;
  isViewer: boolean;
  maxCount: number;
}) {
  const width = maxCount > 0 ? (stat.prCount / maxCount) * 100 : 0;

  return (
    <li
      className={
        "card flex items-center gap-3 px-3 py-2 transition-colors hover:border-slate-300 dark:hover:border-slate-700 " +
        (isViewer ? "ring-1 ring-emerald-400/60" : "")
      }
    >
      <span className="w-6 shrink-0 text-center text-sm font-semibold text-slate-400 tabular-nums">
        {rank + 1}
      </span>
      <Avatar stat={stat} className="h-8 w-8 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <a
            href={`https://github.com/${stat.login}`}
            target="_blank"
            rel="noreferrer"
            className="truncate text-sm font-medium hover:underline"
          >
            {stat.login}
          </a>
          {isViewer && (
            <span className="text-xs text-slate-400">(you)</span>
          )}
          <Badges stat={stat} rank={rank} window={window} />
        </div>
        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
          <div
            className="h-full origin-left rounded-full bg-gradient-to-r from-emerald-400 to-sky-500 animate-[bar-grow_700ms_ease-out_both]"
            style={{ width: `${width}%` }}
          />
        </div>
      </div>
      <div className="hidden shrink-0 sm:block">
        <Breakdown stat={stat} />
      </div>
      <span
        className="hidden w-28 shrink-0 text-right text-xs text-slate-500 dark:text-slate-400 lg:block"
        title={
          stat.lastReviewAt
            ? new Date(stat.lastReviewAt).toLocaleString()
            : undefined
        }
      >
        {stat.lastReviewAt
          ? formatDistanceToNowStrict(new Date(stat.lastReviewAt), {
              addSuffix: true,
            })
          : ""}
      </span>
      <span className="w-14 shrink-0 text-right text-sm font-semibold tabular-nums">
        {stat.prCount}
        <span className="ml-1 text-xs font-normal text-slate-400">
          {stat.reviewCount !== stat.prCount ? `(${stat.reviewCount})` : ""}
        </span>
      </span>
    </li>
  );
}

function SummaryStat({
  icon,
  value,
  label,
}: {
  icon: ReactNode;
  value: string | number;
  label: string;
}) {
  return (
    <div className="card flex items-center gap-3 px-4 py-3">
      <div className="text-slate-400">{icon}</div>
      <div>
        <div className="text-lg font-semibold leading-none tabular-nums">
          {value}
        </div>
        <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
          {label}
        </div>
      </div>
    </div>
  );
}

export function TopReviewers({
  window,
  includeDependabot,
  selectedTeams,
  viewer,
  onSummaryChange,
  refreshSignal,
}: TopReviewersProps) {
  const { repos, teams } = useConfig();
  // A team narrows *who* is ranked; every configured repo is still scanned, so
  // members get credit for reviews outside their own team's repos.
  const teamKey = selectedTeams.join("\u0000");
  const activeTeams = useMemo(
    () => teams.filter((t) => selectedTeams.includes(t.name)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [teams, teamKey],
  );
  // Several teams rank as one pool: the union of their members.
  const members = useMemo(() => {
    if (activeTeams.length === 0) return undefined;
    const union = new Set<string>();
    for (const t of activeTeams) for (const m of t.members) union.add(m);
    return union;
  }, [activeTeams]);
  const teamLabel =
    activeTeams.length === 0
      ? null
      : activeTeams.length === 1
        ? `team ${activeTeams[0].name}`
        : `${activeTeams.length} teams`;
  const entries = useReviewActivity(repos, window);

  const isFetching = entries.some((e) => e.query.isFetching);
  const lastUpdated = entries.reduce<number>(
    (acc, e) => (e.query.dataUpdatedAt > acc ? e.query.dataUpdatedAt : acc),
    0,
  );

  useEffect(() => {
    onSummaryChange({ isFetching, lastUpdated });
  }, [isFetching, lastUpdated, onSummaryChange]);

  useEffect(() => {
    if (refreshSignal === 0) return;
    for (const e of entries) e.query.refetch();
  }, [refreshSignal]); // eslint-disable-line react-hooks/exhaustive-deps

  const successEntries = entries.filter((e) => e.query.isSuccess);
  const dataSignature = successEntries
    .map((e) => `${repoKey(e.repo)}:${e.query.dataUpdatedAt}`)
    .join("|");

  const board = useMemo(
    () =>
      aggregateReviewers(
        successEntries.map((e) => ({
          repo: e.query.data?.nameWithOwner ?? repoKey(e.repo),
          pullRequests: e.query.data?.pullRequests ?? [],
        })),
        { window, includeDependabot, members },
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dataSignature, window, includeDependabot, members],
  );

  const failed = entries.filter((e) => e.query.isError);
  const truncated = successEntries.filter((e) => e.query.data?.truncated);
  const option = reviewWindowOption(window);
  const podium = board.reviewers.slice(0, 3);
  const rest = board.reviewers.slice(3);
  const maxCount = board.reviewers[0]?.prCount ?? 0;
  const stillLoading = entries.some((e) => e.query.isPending);

  if (repos.length === 0) {
    return (
      <EmptyState
        title="No repos configured"
        description="Add repos in the Config editor to rank their reviewers."
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryStat
          icon={<Trophy className="h-5 w-5" />}
          value={board.reviewers.length}
          label={
            activeTeams.length > 0
              ? "team members reviewing"
              : `reviewers in ${option.description}`
          }
        />
        <SummaryStat
          icon={<GitPullRequestArrow className="h-5 w-5" />}
          value={board.reviewedPrs}
          label="pull requests reviewed"
        />
        <SummaryStat
          icon={<Check className="h-5 w-5" />}
          value={board.totalReviews}
          label="reviews submitted"
        />
        <SummaryStat
          icon={<Users className="h-5 w-5" />}
          value={repos.length}
          label={repos.length === 1 ? "repo scanned" : "repos scanned"}
        />
      </div>

      {stillLoading && (
        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Counting reviews across {repos.length} repos&hellip;
        </div>
      )}

      {failed.length > 0 && (
        <div className="card flex items-start gap-2 border-rose-200 p-3 text-xs text-rose-700 dark:border-rose-900 dark:text-rose-300">
          <AlertOctagon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <div>
            <p className="font-medium">
              {failed.length} {failed.length === 1 ? "repo" : "repos"} could not
              be read
            </p>
            <p className="mt-0.5 opacity-80">
              {failed
                .map((e) => `${repoKey(e.repo)}: ${e.query.error?.message}`)
                .join(" · ")}
            </p>
          </div>
        </div>
      )}

      {board.reviewers.length === 0 ? (
        !stillLoading && (
          <EmptyState
            title={
              teamLabel
                ? `No reviews from ${teamLabel} in ${option.description}`
                : `No reviews in ${option.description}`
            }
            description={
              includeDependabot
                ? "Nobody submitted a review on the scanned repos in this timeframe."
                : "Try a longer timeframe, or include dependabot pull requests."
            }
            icon={<Trophy className="h-6 w-6" />}
          />
        )
      ) : (
        <>
          <section className="card overflow-hidden">
            <div className="border-b border-slate-200 px-4 py-2 dark:border-slate-800">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Podium &middot; {option.description}
                {teamLabel && <> &middot; {teamLabel}</>}
              </h2>
            </div>
            <div className="flex items-end justify-center gap-3 px-4 pb-4 pt-8 sm:gap-8">
              {podium.map((stat, i) => (
                <PodiumPlace
                  key={stat.login}
                  stat={stat}
                  rank={i}
                  window={window}
                  isViewer={stat.login === viewer}
                />
              ))}
            </div>
          </section>

          {rest.length > 0 && (
            <section className="space-y-2">
              <h2 className="border-b border-slate-200 pb-1 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:text-slate-400">
                The chasing pack
              </h2>
              <ul className="space-y-2">
                {rest.map((stat, i) => (
                  <ReviewerRow
                    key={stat.login}
                    stat={stat}
                    rank={i + 3}
                    window={window}
                    isViewer={stat.login === viewer}
                    maxCount={maxCount}
                  />
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      <p className="text-xs text-slate-400 dark:text-slate-500">
        {activeTeams.length > 0
          ? `Ranked within ${activeTeams
              .map((t) => `"${t.name}"`)
              .join(" + ")} by distinct pull requests reviewed`
          : "Ranked by distinct pull requests reviewed"}
        {board.reviewers.some((r) => r.reviewCount !== r.prCount) &&
          " (total reviews submitted in parentheses)"}
        . Self-reviews are ignored
        {!includeDependabot && board.skippedDependabotPrs > 0 && (
          <>
            {" "}
            and {board.skippedDependabotPrs} dependabot pull{" "}
            {board.skippedDependabotPrs === 1
              ? "request was"
              : "requests were"}{" "}
            excluded
          </>
        )}
        .
        {truncated.length > 0 && (
          <>
            {" "}
            {truncated.length}{" "}
            {truncated.length === 1 ? "repo has" : "repos have"} more activity
            than one fetch covers, so those counts are a lower bound.
          </>
        )}
      </p>
    </div>
  );
}
