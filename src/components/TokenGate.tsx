import { useState, type FormEvent } from "react";
import { KeyRound, ExternalLink, AlertTriangle, Loader2 } from "lucide-react";
import { setToken, setViewer } from "../lib/token";
import { fetchViewer } from "../lib/github";

interface TokenGateProps {
  initialToken?: string | null;
  onClose?: () => void;
  mode: "first-run" | "settings";
}

export function TokenGate({ initialToken, onClose, mode }: TokenGateProps) {
  const [value, setValue] = useState(initialToken ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const trimmed = value.trim();
    if (!trimmed) {
      setError("Please paste a personal access token.");
      return;
    }
    setBusy(true);
    try {
      const viewer = await fetchViewer(trimmed);
      setToken(trimmed);
      setViewer(viewer.login);
      onClose?.();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(`Token validation failed: ${message}`);
    } finally {
      setBusy(false);
    }
  };

  const handleClear = () => {
    setToken(null);
    setValue("");
    onClose?.();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur-sm p-4">
      <div className="card w-full max-w-lg p-6">
        <div className="flex items-center gap-2 mb-1">
          <KeyRound className="h-5 w-5 text-slate-500" />
          <h2 className="text-lg font-semibold">
            {mode === "first-run" ? "Connect your GitHub token" : "Update GitHub token"}
          </h2>
        </div>
        <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
          GitHub Radar talks directly to the GitHub GraphQL API from your browser
          using a personal access token. The token is stored only in this browser's{" "}
          <code className="font-mono text-xs">localStorage</code>.
        </p>

        <div className="rounded-md bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 p-3 mb-4 flex gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5 text-amber-600 flex-shrink-0" />
          <p className="text-xs text-amber-800 dark:text-amber-200">
            Use a <strong>fine-grained PAT</strong> with read-only access:
            <span className="block mt-1">
              Repository permissions &rarr; <code className="font-mono">Contents: Read</code>,{" "}
              <code className="font-mono">Pull requests: Read</code>,{" "}
              <code className="font-mono">Metadata: Read</code>.
            </span>
            Anything stored in localStorage is XSS-readable. Personal use only.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <label className="block text-sm font-medium">
            Personal access token
            <input
              type="password"
              autoFocus
              autoComplete="off"
              spellCheck={false}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="github_pat_..."
              className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-mono shadow-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500 dark:border-slate-700 dark:bg-slate-800"
            />
          </label>

          {error && (
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          )}

          <div className="flex items-center justify-between pt-2">
            <a
              href="https://github.com/settings/personal-access-tokens/new"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
            >
              Create a new fine-grained PAT
              <ExternalLink className="h-3 w-3" />
            </a>
            <div className="flex gap-2">
              {mode === "settings" && (
                <>
                  <button
                    type="button"
                    onClick={onClose}
                    className="rounded-md px-3 py-1.5 text-sm font-medium hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleClear}
                    className="rounded-md px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
                  >
                    Clear token
                  </button>
                </>
              )}
              <button
                type="submit"
                disabled={busy}
                className="inline-flex items-center gap-2 rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-slate-800 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                {busy ? "Validating" : "Save token"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
