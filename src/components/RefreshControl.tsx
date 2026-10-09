import { useEffect, useRef, useState } from "react";
import { ChevronDown, Loader2, RefreshCw, Check } from "lucide-react";
import {
  REFRESH_OPTIONS,
  useRefreshInterval,
  type RefreshOption,
} from "../lib/refreshInterval";

interface RefreshControlProps {
  isFetching: boolean;
  onRefresh: () => void;
}

export function RefreshControl({ isFetching, onRefresh }: RefreshControlProps) {
  const { value, set, option } = useRefreshInterval();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  const select = (opt: RefreshOption) => {
    set(opt.ms);
    setOpen(false);
  };

  return (
    <div ref={rootRef} className="relative inline-flex items-center">
      <button
        type="button"
        onClick={onRefresh}
        className="inline-flex h-7 items-center justify-center gap-1 rounded-l-md border border-r-0 border-slate-300 bg-white px-2.5 text-xs font-medium leading-none shadow-sm hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800"
        title="Queue a refresh of all visible repositories"
        aria-label="Refresh now"
      >
        {isFetching ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <RefreshCw className="h-3.5 w-3.5" />
        )}
      </button>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="inline-flex h-7 items-center gap-1 rounded-r-md border border-slate-300 bg-white px-2 text-xs font-medium leading-none shadow-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800"
        title={
          value === null
            ? "Auto-refresh is off"
            : `Rolling refresh: start a new sweep every ${option.label}, or immediately when a slower sweep finishes`
        }
      >
        <span className="tabular-nums">{option.label}</span>
        <ChevronDown
          className={
            "h-3 w-3 transition-transform " + (open ? "rotate-180" : "")
          }
        />
      </button>
      {open && (
        <ul
          role="listbox"
          aria-label="Refresh interval"
          className="absolute right-0 top-full z-30 mt-1 w-28 overflow-hidden rounded-md border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-900"
        >
          {REFRESH_OPTIONS.map((opt) => {
            const isActive = opt.ms === value;
            return (
              <li key={opt.label}>
                <button
                  type="button"
                  role="option"
                  aria-selected={isActive}
                  onClick={() => select(opt)}
                  className={
                    "flex w-full items-center justify-between px-3 py-1.5 text-left text-xs " +
                    (isActive
                      ? "bg-slate-100 font-medium dark:bg-slate-800"
                      : "hover:bg-slate-50 dark:hover:bg-slate-800")
                  }
                >
                  <span>{opt.label}</span>
                  {isActive && <Check className="h-3 w-3 text-emerald-500" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
