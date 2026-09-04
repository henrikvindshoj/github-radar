import { useEffect, useRef, useState } from "react";
import { Bot, CalendarRange, Check, ChevronDown, Users } from "lucide-react";
import { REVIEW_WINDOW_OPTIONS, type ReviewWindow } from "../lib/reviews";

interface ReviewFilterBarProps {
  window: ReviewWindow;
  onWindowChange: (w: ReviewWindow) => void;
  includeDependabot: boolean;
  onIncludeDependabotChange: (v: boolean) => void;
  /** Team names from the config; the picker is hidden when empty. */
  teams: string[];
  /** Selected team names; empty means every reviewer. */
  selectedTeams: string[];
  onSelectedTeamsChange: (names: string[]) => void;
}

const ROW_CLASS =
  "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-slate-100 dark:hover:bg-slate-800";

/** Multi-select of configured teams; nothing selected means all reviewers. */
function TeamPicker({
  teams,
  selectedTeams,
  onSelectedTeamsChange,
}: Pick<
  ReviewFilterBarProps,
  "teams" | "selectedTeams" | "onSelectedTeamsChange"
>) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const toggle = (name: string) => {
    const next = new Set(selectedTeams);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    // Keep the config's order regardless of click order.
    onSelectedTeamsChange(teams.filter((t) => next.has(t)));
  };

  const label =
    selectedTeams.length === 0
      ? "All reviewers"
      : selectedTeams.length === 1
        ? selectedTeams[0]
        : `${selectedTeams.length} teams`;

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="true"
        title="Rank only the members of one or more teams, across every configured repo"
        className="inline-flex h-7 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
      >
        <Users className="h-3.5 w-3.5 text-slate-400" />
        <span className="max-w-[14rem] truncate">{label}</span>
        <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-30 mt-1 max-h-80 min-w-[15rem] max-w-[22rem] overflow-y-auto rounded-md border border-slate-200 bg-white p-1 shadow-lg dark:border-slate-700 dark:bg-slate-900">
          <button
            type="button"
            onClick={() => onSelectedTeamsChange([])}
            className={ROW_CLASS}
          >
            <Check
              className={
                "h-3.5 w-3.5 shrink-0 " +
                (selectedTeams.length === 0 ? "opacity-100" : "opacity-0")
              }
            />
            <span>All reviewers</span>
          </button>

          <div className="my-1 border-t border-slate-200 dark:border-slate-800" />

          {teams.map((name) => (
            <label key={name} className={`${ROW_CLASS} cursor-pointer`}>
              <input
                type="checkbox"
                checked={selectedTeams.includes(name)}
                onChange={() => toggle(name)}
                className="h-3.5 w-3.5 shrink-0 rounded border-slate-300 dark:border-slate-600"
              />
              <span className="truncate" title={name}>
                {name}
              </span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

export function ReviewFilterBar({
  window,
  onWindowChange,
  includeDependabot,
  onIncludeDependabotChange,
  teams,
  selectedTeams,
  onSelectedTeamsChange,
}: ReviewFilterBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div
        className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 p-0.5 dark:border-slate-800 dark:bg-slate-900"
        role="group"
        aria-label="Timeframe"
      >
        <CalendarRange className="ml-1.5 mr-0.5 h-3.5 w-3.5 text-slate-400" />
        {REVIEW_WINDOW_OPTIONS.map((option) => {
          const active = option.value === window;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onWindowChange(option.value)}
              aria-pressed={active}
              title={`Rank reviews from ${option.description}`}
              className={
                "inline-flex h-7 items-center rounded-md px-2.5 text-xs font-medium leading-none transition-colors " +
                (active
                  ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                  : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800")
              }
            >
              {option.label}
            </button>
          );
        })}
      </div>

      {teams.length > 0 && (
        <TeamPicker
          teams={teams}
          selectedTeams={selectedTeams}
          onSelectedTeamsChange={onSelectedTeamsChange}
        />
      )}

      <button
        type="button"
        onClick={() => onIncludeDependabotChange(!includeDependabot)}
        aria-pressed={includeDependabot}
        title="Count reviews on pull requests opened by dependabot"
        className={
          "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors " +
          (includeDependabot
            ? "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900"
            : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800")
        }
      >
        <Bot className="h-3.5 w-3.5" />
        Include dependabot
      </button>
    </div>
  );
}
