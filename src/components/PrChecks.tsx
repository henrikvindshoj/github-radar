import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchPrChecks } from '../lib/prChecks';
import { useToken } from '../lib/token';
import { useAuthScope } from '../hooks/useRollingRefresh';

interface Props { owner: string; name: string; sha?: string; prUrl: string; label: string; children: ReactNode; }
const outcomeClasses = {
  success: 'text-emerald-700 dark:text-emerald-400',
  failure: 'text-red-700 dark:text-red-400',
  pending: 'text-amber-700 dark:text-amber-400',
  neutral: 'text-slate-500 dark:text-slate-400',
};

export function PrChecks({ owner, name, sha, prUrl, label, children }: Props) {
  const token = useToken(), auth = useAuthScope(token), client = useQueryClient();
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const anchor = useRef<HTMLButtonElement>(null), panel = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pinned = useRef(false);
  const id = useId();
  const key = ['pr-checks', auth, owner, name, sha ?? null];
  const query = useQuery({
    queryKey: key, enabled: open && Boolean(token && sha),
    queryFn: ({ signal }) => fetchPrChecks(owner, name, sha!, token!, signal),
    staleTime: 30_000, retry: false, refetchOnWindowFocus: false, refetchOnReconnect: false,
  });
  function cancelClose() { clearTimeout(closeTimer.current); }
  function reveal() {
    cancelClose();
    const rect = anchor.current?.getBoundingClientRect();
    if (!rect) return;
    setPosition({ left: Math.max(8, Math.min(rect.left, window.innerWidth - 328)),
      top: rect.bottom + 8 + 320 <= window.innerHeight ? rect.bottom + 8 : Math.max(8, rect.top - 328) });
    setOpen(true);
  }
  function close() { cancelClose(); pinned.current = false; setOpen(false); }
  function leave() {
    cancelClose();
    closeTimer.current = setTimeout(() => {
      if (!pinned.current && !anchor.current?.contains(document.activeElement) && !panel.current?.contains(document.activeElement)) setOpen(false);
    }, 150);
  }
  useEffect(() => {
    if (!open) return () => cancelClose();
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { anchor.current?.focus(); close(); } };
    const outside = (event: PointerEvent) => {
      if (!anchor.current?.contains(event.target as Node) && !panel.current?.contains(event.target as Node)) close();
    };
    // Scroll/resize invalidate the fixed anchor location; don't leave a detached panel behind.
    const moved = (event: Event) => { if (!(event.target instanceof Node) || !panel.current?.contains(event.target)) close(); };
    document.addEventListener('keydown', escape);
    document.addEventListener('pointerdown', outside);
    window.addEventListener('resize', moved);
    window.addEventListener('scroll', moved, true);
    return () => {
      document.removeEventListener('keydown', escape);
      document.removeEventListener('pointerdown', outside);
      window.removeEventListener('resize', moved);
      window.removeEventListener('scroll', moved, true);
      cancelClose();
      void client.cancelQueries({ queryKey: key, exact: true });
    };
  }, [open, auth, owner, name, sha, client]);

  return <>
    <button ref={anchor} type="button" className="flex items-center gap-1 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
      aria-label={label} aria-expanded={open} aria-haspopup="dialog" aria-controls={open ? id : undefined}
      onMouseEnter={reveal} onMouseLeave={leave} onFocus={reveal} onBlur={leave}
      onKeyDown={event => { if (event.key === 'ArrowDown') { event.preventDefault(); reveal(); requestAnimationFrame(() => panel.current?.querySelector<HTMLElement>('button, a')?.focus()); } }}
      onClick={event => { if (pinned.current) close(); else { pinned.current = true; reveal(); if (event.detail === 0) requestAnimationFrame(() => panel.current?.querySelector<HTMLElement>('button, a')?.focus()); } }}>
      {children}
    </button>
    {open && createPortal(<div ref={panel} id={id} role="dialog" aria-label="PR checks"
      onMouseEnter={cancelClose} onMouseLeave={leave} onFocus={cancelClose} onBlur={leave}
      style={position} className="fixed z-50 w-80 max-w-[calc(100vw-16px)] max-h-80 overflow-auto rounded-md border border-slate-200 bg-white p-3 text-xs shadow-lg dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
      <div className="mb-2 flex items-center justify-between gap-2"><strong>Checks</strong><button type="button" onClick={close} aria-label="Close check details" className="-my-1 flex h-6 w-6 items-center justify-center rounded hover:bg-slate-100 focus-visible:outline dark:hover:bg-slate-800">×</button></div>
      {!sha ? <p>Head commit unavailable. Refresh this repository.</p> : query.isPending ? <p role="status">Loading check details…</p> : null}
      {query.isError && <p role="alert">Could not load check details: {query.error.message}</p>}
      {query.data?.errors.map(error => <p key={error.source} role="alert" className="mb-2 text-red-700 dark:text-red-400">{error.source}: {error.message}</p>)}
      {query.data && query.data.checks.length === 0 && query.data.errors.length === 0 && <p>No checks reported for this commit.</p>}
      {query.data && <ul className="space-y-2">{query.data.checks.map(check => <li key={check.id} className="flex items-start justify-between gap-3">
        {check.url ? <a href={check.url} target="_blank" rel="noreferrer" className="min-w-0 break-words underline">{check.name}</a> : <span className="min-w-0 break-words">{check.name}</span>}
        <span className={`shrink-0 ${outcomeClasses[check.outcome]}`}>{check.label}</span>
      </li>)}</ul>}
      {(query.isError || Boolean(query.data?.errors.length)) && <button type="button" disabled={query.isFetching} onClick={() => void query.refetch()} className="mt-2 underline disabled:opacity-50">Retry</button>}
      <a href={`${prUrl}/checks`} target="_blank" rel="noreferrer" className="mt-3 block underline">View checks on GitHub</a>
    </div>, document.body)}
  </>;
}
