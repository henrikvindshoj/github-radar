import { useCallback, useState } from "react";
import { Header, type RadarView } from "./components/Header";
import { Dashboard } from "./components/Dashboard";
import { Pipelines } from "./components/Pipelines";
import { TopReviewers } from "./components/TopReviewers";
import { FilterBar } from "./components/FilterBar";
import { PipelineFilterBar } from "./components/PipelineFilterBar";
import { ReviewFilterBar } from "./components/ReviewFilterBar";
import { TokenGate } from "./components/TokenGate";
import { ConfigEditor } from "./components/ConfigEditor";
import { useToken, useViewer } from "./lib/token";
import { defaultFilters, type Filters } from "./lib/filters";
import {
  defaultPipelineFilters,
  type PipelineFilters,
} from "./lib/pipelineFilters";
import {
  useIncludeDependabot,
  useReviewTeams,
  useReviewWindow,
} from "./lib/reviewWindow";
import { useConfig } from "./config/configStore";

const VIEW_LABELS: Record<RadarView, string> = {
  prs: "pull requests",
  pipelines: "pipelines",
  reviews: "review rankings",
};

export function App() {
  const token = useToken();
  const viewer = useViewer();
  const [view, setView] = useState<RadarView>("prs");
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const [pipelineFilters, setPipelineFilters] = useState<PipelineFilters>(
    defaultPipelineFilters,
  );
  const reviewWindow = useReviewWindow();
  const includeDependabot = useIncludeDependabot();
  const reviewTeams = useReviewTeams();
  const { teams } = useConfig();
  // Teams can vanish from the config while still selected; drop those.
  const teamNames = teams.map((t) => t.name);
  const selectedTeams = reviewTeams.value.filter((n) => teamNames.includes(n));
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
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
        view={view}
        onViewChange={setView}
        viewer={viewer}
        isFetching={summary.isFetching}
        lastUpdated={summary.lastUpdated}
        onRefresh={handleRefresh}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenConfig={() => setConfigOpen(true)}
      />
      <main className="mx-auto w-full flex-1 px-4 py-6 space-y-6">
        {view === "prs" && (
          <FilterBar
            filters={filters}
            onChange={setFilters}
            viewerKnown={Boolean(viewer)}
          />
        )}
        {view === "pipelines" && (
          <PipelineFilterBar
            filters={pipelineFilters}
            onChange={setPipelineFilters}
            viewerKnown={Boolean(viewer)}
          />
        )}
        {view === "reviews" && (
          <ReviewFilterBar
            window={reviewWindow.value}
            onWindowChange={reviewWindow.set}
            includeDependabot={includeDependabot.value}
            onIncludeDependabotChange={includeDependabot.set}
            teams={teamNames}
            selectedTeams={selectedTeams}
            onSelectedTeamsChange={reviewTeams.set}
          />
        )}

        {token ? (
          <>
            {view === "prs" && (
              <Dashboard
                filters={filters}
                viewer={viewer}
                onSummaryChange={handleSummary}
                refreshSignal={refreshSignal}
              />
            )}
            {view === "pipelines" && (
              <Pipelines
                filters={pipelineFilters}
                viewer={viewer}
                onSummaryChange={handleSummary}
                refreshSignal={refreshSignal}
              />
            )}
            {view === "reviews" && (
              <TopReviewers
                window={reviewWindow.value}
                includeDependabot={includeDependabot.value}
                selectedTeams={selectedTeams}
                viewer={viewer}
                onSummaryChange={handleSummary}
                refreshSignal={refreshSignal}
              />
            )}
          </>
        ) : (
          <div className="text-center py-20 text-sm text-slate-500 dark:text-slate-400">
            Connect a GitHub personal access token to load {VIEW_LABELS[view]}.
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
      {configOpen && <ConfigEditor onClose={() => setConfigOpen(false)} />}
    </div>
  );
}
