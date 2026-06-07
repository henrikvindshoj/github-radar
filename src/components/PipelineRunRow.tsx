import { formatDistanceToNowStrict } from "date-fns";
import {
  CheckCircle2,
  XCircle,
  Loader2,
  Clock,
  MinusCircle,
  ExternalLink,
  GitBranch,
} from "lucide-react";
import type { WorkflowRun } from "../lib/githubActions";
import {
  derivePipelineState,
  pipelineBadgeClass,
  pipelineColorClass,
  pipelineLabel,
  pipelineTextClass,
  type PipelineState,
} from "../lib/pipelineStatus";

interface PipelineRunRowProps {
  run: WorkflowRun;
  prodEnvironment: string;
}

function StateIcon({ state }: { state: PipelineState }) {
  const cls = "h-4 w-4 " + pipelineTextClass(state);
  switch (state) {
    case "in_prod":
      return <CheckCircle2 className={cls} />;
    case "awaiting":
      return <Clock className={cls} />;
    case "running":
      return <Loader2 className={cls + " animate-spin"} />;
    case "failed":
      return <XCircle className={cls} />;
    case "neutral":
    default:
      return <MinusCircle className={cls} />;
  }
}

export function PipelineRunRow({ run, prodEnvironment }: PipelineRunRowProps) {
  const state = derivePipelineState(run);
  const label = pipelineLabel(state, prodEnvironment);
  const started = run.run_started_at ?? run.created_at;
  const when = formatDistanceToNowStrict(new Date(started), { addSuffix: true });

  return (
    <article className="flex items-stretch overflow-hidden transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50">
      <div
        className={`w-1 flex-shrink-0 ${pipelineColorClass(state)}`}
        aria-hidden
      />
      <div className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5">
        <StateIcon state={state} />

        <div className="min-w-0 flex-1">
          <a
            href={run.html_url}
            target="_blank"
            rel="noreferrer"
            className="group block truncate text-sm font-medium leading-snug hover:underline"
            title={run.display_title}
          >
            {run.display_title}
            <ExternalLink className="inline h-3 w-3 ml-1 opacity-0 group-hover:opacity-60 transition-opacity" />
          </a>
          <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span className="font-mono">#{run.run_number}</span>
            <span aria-hidden>&middot;</span>
            <span className="inline-flex items-center gap-1 min-w-0">
              <GitBranch className="h-3 w-3 flex-shrink-0" />
              <span className="font-mono truncate">
                {run.head_branch ?? "?"}
              </span>
            </span>
            <span aria-hidden>&middot;</span>
            <span className="inline-flex items-center gap-1 min-w-0">
              {run.actor?.avatar_url ? (
                <img
                  src={run.actor.avatar_url}
                  alt={run.actor.login}
                  className="h-3.5 w-3.5 rounded-full flex-shrink-0"
                  loading="lazy"
                />
              ) : null}
              <span className="truncate">{run.actor?.login ?? "unknown"}</span>
            </span>
          </div>
        </div>

        <div className="flex flex-col items-end gap-0.5 text-right flex-shrink-0">
          <span className={`pill ${pipelineBadgeClass(state)}`}>
            <StateIcon state={state} />
            {label}
          </span>
          <span
            className="text-xs text-slate-400 tabular-nums"
            title={new Date(started).toLocaleString()}
          >
            {when}
          </span>
        </div>
      </div>
    </article>
  );
}
