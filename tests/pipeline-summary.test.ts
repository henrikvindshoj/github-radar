import assert from "node:assert/strict";
import test from "node:test";
import type { WorkflowRun } from "../src/lib/githubActions.ts";
import {
  defaultPipelineFilters,
  hasPendingProd,
  latestDeploymentFailing,
  matchesPipelineFilters,
  matchesPipelineStateFilters,
} from "../src/lib/pipelineFilters.ts";
import { summarizePipeline, runsUpToFirstProd, splitPipelineHistory } from "../src/lib/pipelineStatus.ts";

function run(id: number, status: string, conclusion: string | null = null): WorkflowRun {
  return {
    id, status, conclusion, name: "Deploy", display_title: `Deploy ${id}`,
    run_number: id, event: "push", html_url: "", head_branch: "main",
    head_sha: "abcdef1234", created_at: "", run_started_at: null,
    updated_at: "", actor: { login: "owner", avatar_url: "" }, head_commit: null,
  };
}

test("five waiting runs describe one awaiting pipeline", () => {
  const runs = [5, 4, 3, 2, 1].map((id) => run(id, "waiting"));
  assert.deepEqual(summarizePipeline(runs, "PROD"), {
    state: "awaiting", label: "1 awaiting PROD",
  });
  assert.equal(hasPendingProd(runs), true);
});

test("latest success supersedes stale waiting history", () => {
  const runs = [run(3, "completed", "success"), run(2, "waiting")];
  assert.deepEqual(summarizePipeline(runs, "PROD"), {
    state: "in_prod", label: "Up to date in PROD",
  });
  assert.equal(hasPendingProd(runs), false);
  assert.equal(matchesPipelineStateFilters(runs, { ...defaultPipelineFilters, pendingProdOnly: true }), false);
  assert.equal(matchesPipelineStateFilters(runs, { ...defaultPipelineFilters, hideUpToDate: true }), false);
  assert.deepEqual(runsUpToFirstProd(runs), [runs[0]]);
});

test("running, failure and cancellation have distinct summaries", () => {
  for (const [latest, state, label, pending] of [
    [run(3, "in_progress"), "running", "Running", true],
    [run(3, "completed", "failure"), "failed", "Failed", false],
    [run(3, "completed", "cancelled"), "neutral", "No deployment", false],
    [run(3, "unknown"), "neutral", "No deployment", false],
  ] as const) {
    const runs = [latest, run(2, "waiting")];
    assert.deepEqual(summarizePipeline(runs, "PROD"), { state, label });
    assert.equal(hasPendingProd(runs), pending);
    assert.equal(matchesPipelineStateFilters(runs, { ...defaultPipelineFilters, hideUpToDate: true }), true);
    assert.equal(matchesPipelineStateFilters(runs, { ...defaultPipelineFilters, pendingProdOnly: true }), pending);
    assert.equal(latestDeploymentFailing(runs), state === "failed");
  }
});

test("display filtering older runs never changes pipeline state", () => {
  const runs = [run(4, "completed", "failure"), run(3, "waiting"), run(2, "completed", "success"), run(1, "waiting")];
  const filters = { ...defaultPipelineFilters, search: "Deploy 3", failingOnly: true };
  assert.equal(matchesPipelineStateFilters(runs, filters), true);
  const matching = runsUpToFirstProd(runs).filter((item) => matchesPipelineFilters(item, filters, "owner"));
  assert.deepEqual(matching.map((item) => item.id), [3]);
  assert.deepEqual(summarizePipeline(runs, "PROD"), { state: "failed", label: "Failed" });
  assert.equal(matchesPipelineStateFilters([run(5, "waiting"), ...runs], filters), false);
});

test("empty pipelines do not claim a successful deployment", () => {
  assert.deepEqual(summarizePipeline([], "PROD"), { state: null, label: "No runs" });
  assert.equal(hasPendingProd([]), false);
  assert.equal(latestDeploymentFailing([]), false);
});

test("empty, single and two-run histories keep distinct visible endpoints", () => {
  const newest = run(2, "waiting");
  const oldest = run(1, "completed", "success");
  assert.deepEqual(splitPipelineHistory([]), { newest: undefined, middle: [], oldest: undefined });
  assert.deepEqual(splitPipelineHistory([newest]), { newest, middle: [], oldest: undefined });
  assert.deepEqual(splitPipelineHistory([newest, oldest]), { newest, middle: [], oldest });
});

test("pipeline history shows the latest successful deployment below chronological intermediate runs", () => {
  const runs = [run(5, "waiting"), run(4, "in_progress"), run(3, "completed", "failure"),
    run(2, "completed", "success"), run(1, "completed", "success")];
  const { newest, middle, oldest } = splitPipelineHistory(runsUpToFirstProd(runs));
  assert.equal(newest?.id, 5);
  assert.deepEqual(middle.map((item) => item.id), [4, 3]);
  assert.equal(oldest?.id, 2);
});

test("history without a successful deployment retains the oldest fetched run", () => {
  const runs = [run(3, "waiting"), run(2, "completed", "failure"), run(1, "waiting")];
  const { newest, middle, oldest } = splitPipelineHistory(runsUpToFirstProd(runs));
  assert.equal(newest?.id, 3);
  assert.deepEqual(middle.map((item) => item.id), [2]);
  assert.equal(oldest?.id, 1);
});

test("history endpoints use the retained filtered window without reviving excluded runs", () => {
  const runs = [run(5, "waiting"), run(4, "waiting"), run(3, "waiting"),
    run(2, "completed", "success"), run(1, "waiting")];
  runs[0].actor.login = "other";
  runs[3].actor.login = "other";
  const filters = { ...defaultPipelineFilters, onlyMine: true };
  const retained = runsUpToFirstProd(runs).filter((item) => matchesPipelineFilters(item, filters, "owner"));
  const { newest, middle, oldest } = splitPipelineHistory(retained);
  assert.equal(newest?.id, 4);
  assert.deepEqual(middle, []);
  assert.equal(oldest?.id, 3);
});
