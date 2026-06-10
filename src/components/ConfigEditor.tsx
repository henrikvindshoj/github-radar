import { useState, type FormEvent } from "react";
import { SlidersHorizontal, AlertTriangle, RotateCcw } from "lucide-react";
import {
  getConfigText,
  isUsingDefaultConfig,
  resetConfig,
  saveConfigText,
} from "../config/configStore";
import { defaultConfig } from "../config/schema";

interface ConfigEditorProps {
  onClose: () => void;
}

export function ConfigEditor({ onClose }: ConfigEditorProps) {
  const [value, setValue] = useState(() => getConfigText());
  const [error, setError] = useState<string | null>(null);
  const [usingDefault, setUsingDefault] = useState(() => isUsingDefaultConfig());

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const result = saveConfigText(value);
    if (!result.ok) {
      setError(result.error ?? "Could not save configuration.");
      return;
    }
    onClose();
  };

  const handleReset = () => {
    resetConfig();
    setValue(JSON.stringify(defaultConfig, null, 2));
    setUsingDefault(true);
    setError(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur-sm p-4">
      <div className="card w-full max-w-3xl p-6 max-h-[90vh] flex flex-col">
        <div className="flex items-center gap-2 mb-1">
          <SlidersHorizontal className="h-5 w-5 text-slate-500" />
          <h2 className="text-lg font-semibold">Repository configuration</h2>
        </div>
        <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
          The groups, repos, teams, and pipelines GitHub Radar monitors. This is
          stored in this browser's{" "}
          <code className="font-mono text-xs">localStorage</code> and applies
          only to you.{" "}
          {usingDefault && (
            <span className="text-slate-500 dark:text-slate-500">
              (Currently using the bundled default.)
            </span>
          )}
        </p>

        <div className="rounded-md bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 p-3 mb-4 flex gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5 text-amber-600 flex-shrink-0" />
          <p className="text-xs text-amber-800 dark:text-amber-200">
            Edit the JSON below. Each repo needs an{" "}
            <code className="font-mono">owner</code> and{" "}
            <code className="font-mono">name</code>; add a{" "}
            <code className="font-mono">pipeline</code> /{" "}
            <code className="font-mono">pipelines</code> to track GitHub Actions.
            The token's PAT must have access to the listed repositories.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 space-y-3">
          <textarea
            autoFocus
            spellCheck={false}
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setUsingDefault(false);
            }}
            className="block w-full flex-1 min-h-[40vh] resize-y rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-mono leading-relaxed shadow-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500 dark:border-slate-700 dark:bg-slate-800"
          />

          {error && (
            <p className="text-sm text-red-600 dark:text-red-400 whitespace-pre-wrap">
              {error}
            </p>
          )}

          <div className="flex items-center justify-between pt-1">
            <button
              type="button"
              onClick={handleReset}
              className="inline-flex items-center gap-1 text-xs text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset to default
            </button>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-md px-3 py-1.5 text-sm font-medium hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="inline-flex items-center gap-2 rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-slate-800 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
              >
                Save configuration
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
