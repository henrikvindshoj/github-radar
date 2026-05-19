import { formatDistanceToNowStrict } from "date-fns";
import { RefreshCw, Settings, Loader2, Radar } from "lucide-react";
import { useEffect, useState } from "react";

interface HeaderProps {
  viewer: string | null;
  isFetching: boolean;
  lastUpdated: number;
  onRefresh: () => void;
  onOpenSettings: () => void;
}

function useTicker(intervalMs: number): number {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return 0;
}

export function Header({
  viewer,
  isFetching,
  lastUpdated,
  onRefresh,
  onOpenSettings,
}: HeaderProps) {
  useTicker(15_000);
  const updatedLabel =
    lastUpdated > 0
      ? formatDistanceToNowStrict(new Date(lastUpdated), { addSuffix: true })
      : "never";

  return (
    <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/80 backdrop-blur-md dark:border-slate-800 dark:bg-slate-950/80">
      <div className="mx-auto max-w-screen-2xl px-4 py-3 flex items-center gap-3">
        <div className="flex items-center gap-2">
          <Radar className="h-5 w-5 text-emerald-500" />
          <h1 className="text-base font-semibold tracking-tight">GitHub Radar</h1>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <span
            className="text-xs text-slate-500 dark:text-slate-400 tabular-nums hidden sm:inline"
            title={
              lastUpdated > 0
                ? new Date(lastUpdated).toLocaleString()
                : "No successful fetch yet"
            }
          >
            Updated {updatedLabel}
          </span>

          <button
            type="button"
            onClick={onRefresh}
            disabled={isFetching}
            className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium shadow-sm hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800"
            title="Refresh all repos now"
          >
            {isFetching ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            <span className="hidden sm:inline">Refresh</span>
          </button>

          <button
            type="button"
            onClick={onOpenSettings}
            className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium shadow-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800"
            title={viewer ? `Signed in as ${viewer}` : "Configure token"}
          >
            <Settings className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">
              {viewer ? `@${viewer}` : "Token"}
            </span>
          </button>
        </div>
      </div>
    </header>
  );
}
