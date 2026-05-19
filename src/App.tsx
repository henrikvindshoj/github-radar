import { useCallback, useState } from "react";
import { Header } from "./components/Header";
import { Dashboard } from "./components/Dashboard";
import { FilterBar } from "./components/FilterBar";
import { TokenGate } from "./components/TokenGate";
import { useToken, useViewer } from "./lib/token";
import { defaultFilters, type Filters } from "./lib/filters";

export function App() {
  const token = useToken();
  const viewer = useViewer();
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [summary, setSummary] = useState({ isFetching: false, lastUpdated: 0 });
  const [refreshSignal, setRefreshSignal] = useState(0);

  const handleSummary = useCallback(
    (s: { isFetching: boolean; lastUpdated: number }) => {
      setSummary((prev) =>
        prev.isFetching === s.isFetching && prev.lastUpdated === s.lastUpdated
          ? prev
          : s,
      );
    },
    [],
  );

  const handleRefresh = () => setRefreshSignal((n) => n + 1);

  const showFirstRunGate = !token;
  const showSettingsGate = settingsOpen;

  return (
    <div className="min-h-screen flex flex-col">
      <Header
        viewer={viewer}
        isFetching={summary.isFetching}
        lastUpdated={summary.lastUpdated}
        onRefresh={handleRefresh}
        onOpenSettings={() => setSettingsOpen(true)}
      />
      <main className="mx-auto w-full max-w-screen-2xl flex-1 px-4 py-6 space-y-6">
        <FilterBar
          filters={filters}
          onChange={setFilters}
          viewerKnown={Boolean(viewer)}
        />
        {token ? (
          <Dashboard
            filters={filters}
            viewer={viewer}
            onSummaryChange={handleSummary}
            refreshSignal={refreshSignal}
          />
        ) : (
          <div className="text-center py-20 text-sm text-slate-500 dark:text-slate-400">
            Connect a GitHub personal access token to load pull requests.
          </div>
        )}
      </main>

      {showFirstRunGate && <TokenGate mode="first-run" />}
      {showSettingsGate && token && (
        <TokenGate
          mode="settings"
          initialToken={token}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  );
}
