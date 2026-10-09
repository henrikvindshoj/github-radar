import test from "node:test";
import assert from "node:assert/strict";
import { fetchPullRequestCounts, fetchPullRequestPage, fetchViewer, GitHubApiError } from "../src/lib/github.ts";
import { createGitHubTransport } from "../src/lib/githubRequest.ts";
import { fetchRepoPipeline } from "../src/lib/githubActions.ts";

const response = (body: unknown, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers });

test("shared transport serializes starts, honors secondary cooldown, and aborts queued work", async () => {
  let now = 0;
  const starts: number[] = [];
  let active = 0;
  let maxActive = 0;
  const request = createGitHubTransport({
    now: () => now,
    wait: async (ms) => { now += ms; },
    fetch: async () => {
      starts.push(now); maxActive = Math.max(maxActive, ++active);
      await Promise.resolve(); active--;
      return starts.length === 2 ? response({ message: "secondary rate limit" }, 403) : response({ ok: true });
    },
  });
  const results = await Promise.allSettled([request("https://api.github.com/a", {}, "token"), request("https://api.github.com/b", {}, "token"), request("https://api.github.com/c", {}, "token")]);
  assert.equal(maxActive, 1);
  assert.deepEqual(starts, [0, 1000, 61000]);
  const error = (results[1] as PromiseRejectedResult).reason;
  assert.ok(error instanceof GitHubApiError);
  assert.equal(error.retryable, true);
  assert.equal(error.cooldownUntil, 61000);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(request("https://api.github.com/d", {}, "token", controller.signal), { name: "AbortError" });
  assert.equal(starts.length, 3);
});

test("initial bursts have four slots and 250ms pacing; normal work excludes the burst", async () => {
  let now = 0;
  let active = 0;
  let maximum = 0;
  const starts: number[] = [];
  const replies: Array<(response: Response) => void> = [];
  const request = createGitHubTransport({
    now: () => now, wait: async (ms) => { now += ms; },
    fetch: async () => {
      starts.push(now); maximum = Math.max(maximum, ++active);
      const result = await new Promise<Response>(resolve => replies.push(resolve));
      active--; return result;
    },
  });
  const flush = async () => { for (let i = 0; i < 40; i++) await Promise.resolve(); };
  const initial = Array.from({ length: 5 }, () => request("url", {}, "token", undefined, true));
  const normal = request("url", {}, "token");
  const following = request("url", {}, "token", undefined, true);
  await flush();
  assert.deepEqual(starts, [0, 250, 500, 750]);
  assert.equal(maximum, 4);
  for (const reply of replies.slice(0, 3)) reply(response({ ok: true }));
  await flush(); assert.deepEqual(starts, [0, 250, 500, 750, 1000]);
  replies[3](response({ ok: true }));
  await flush(); assert.equal(starts.length, 5);
  replies[4](response({ ok: true }));
  await Promise.all(initial); await flush();
  assert.deepEqual(starts, [0, 250, 500, 750, 1000, 2000]);
  replies[5](response({ ok: true }));
  await normal; await flush();
  assert.deepEqual(starts, [0, 250, 500, 750, 1000, 2000, 2250]);
  replies[6](response({ ok: true })); await following;
});

test("transport exposes safe failures, reset/Retry-After cooldown and nonretryable auth", async () => {
  let now = 1000;
  let index = 0;
  const replies = [
    new Response("<html>secret upstream body</html>", { status: 502 }),
    response({ message: "Bad credentials" }, 401),
    response({ message: "API rate limit exceeded" }, 403, { "x-ratelimit-remaining": "0", "x-ratelimit-reset": "10", "retry-after": "4" }),
    response({ errors: [{ type: "RATE_LIMITED", message: "limit" }] }),
  ];
  const request = createGitHubTransport({ now: () => now, wait: async (ms) => { now += ms; }, fetch: async () => replies[index++] });
  await assert.rejects(request("url", {}, "token"), (e: GitHubApiError) => e.status === 502 && e.retryable && !e.message.includes("html") && !e.message.includes("secret"));
  await assert.rejects(request("url", {}, "token"), (e: GitHubApiError) => e.status === 401 && !e.retryable);
  await assert.rejects(request("url", {}, "token"), (e: GitHubApiError) => e.cooldownUntil === 10000 && e.retryable);
  await assert.rejects(request("url", {}, "token"), (e: GitHubApiError) => e.cooldownUntil === 70000 && e.retryable);
});

test("secondary limits ignore primary reset unless the primary budget is exhausted", async () => {
  let now = 1000;
  const starts: number[] = [];
  const request = createGitHubTransport({
    now: () => now,
    wait: async (milliseconds) => { now += milliseconds; },
    fetch: async () => {
      starts.push(now);
      return starts.length === 1
        ? response({ message: "secondary rate limit" }, 403, { "retry-after": "30", "x-ratelimit-remaining": "4000", "x-ratelimit-reset": "3601" })
        : response({ ok: true });
    },
  });
  await assert.rejects(request("url", {}, "token"), (error: GitHubApiError) => error.cooldownUntil === 61000 && error.retryable);
  await request("url", {}, "token");
  assert.deepEqual(starts, [1000, 61000]);
});

test("transport pauses nested HTTP work while hidden and releases aborted visibility waits", async () => {
  const events = new EventTarget();
  const fakeDocument = Object.assign(events, { hidden: true });
  Object.defineProperty(globalThis, "document", { value: fakeDocument, configurable: true });
  let starts = 0;
  const request = createGitHubTransport({ fetch: async () => { starts++; return response({ ok: true }); } });
  try {
    const controller = new AbortController();
    const pending = request("url", {}, "token", controller.signal);
    await Promise.resolve(); await Promise.resolve();
    assert.equal(starts, 0);
    controller.abort();
    await assert.rejects(pending, { name: "AbortError" });
    const resumed = request("url", {}, "token");
    await Promise.resolve(); await Promise.resolve();
    assert.equal(starts, 0);
    fakeDocument.hidden = false;
    events.dispatchEvent(new Event("visibilitychange"));
    await resumed;
    assert.equal(starts, 1);
  } finally { Reflect.deleteProperty(globalThis, "document"); }
});

test("public APIs batch lightweight counts and page beyond 100 with captured tokens", async () => {
  const original = globalThis.fetch;
  const calls: Array<{ query?: string; variables?: Record<string, unknown>; authorization: string | null; url: string }> = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    const authorization = new Headers(init?.headers).get("Authorization");
    const { query, variables } = init?.body ? JSON.parse(String(init.body)) : {};
    calls.push({ query, variables, authorization, url });
    if (query?.includes("PullRequestCounts")) {
      const data: Record<string, unknown> = {};
      for (const alias of query.matchAll(/(r\d+):\s*(repository|search)/g)) data[alias[1]] = alias[2] === "search" ? { issueCount: 1201 } : { pullRequests: { totalCount: 130 } };
      return response({ data });
    }
    if (query?.includes("RepoPRPage")) {
      const offset = variables.cursor ? Number(variables.cursor) : 0;
      return response({ data: { repository: { nameWithOwner: "o/r", url: "https://github.com/o/r", pullRequests: { nodes: Array.from({ length: Math.min(25, 130 - offset) }, (_, n) => ({ id: String(offset + n) })), totalCount: 130, pageInfo: { hasNextPage: offset + 25 < 130, endCursor: String(offset + 25) } } } } });
    }
    if (query?.includes("TeamPRPage")) return response({ data: { search: { issueCount: 1201, nodes: [{ __typename: "PullRequest", id: "team" }, { __typename: "Issue" }], pageInfo: { hasNextPage: true, endCursor: "team-next" } } } });
    if (query?.includes("Viewer")) return response({ data: { viewer: { login: "me", avatarUrl: "avatar" } } });
    if (url.includes("/runs?")) return response({ workflow_runs: [] });
    return response({ workflows: [{ id: 1, name: "Build", path: ".github/workflows/build.yml" }] });
  };
  try {
    const targets = Array.from({ length: 6 }, (_, n) => ({ owner: "o", name: `r${n}`, ...(n === 5 ? { members: ["alice"] } : {}) }));
    const counts = await fetchPullRequestCounts(targets, "captured");
    assert.equal(counts["o/r0"], 130); assert.equal(counts["o/r5"], 1201);
    assert.equal(calls.length, 2);
    assert.ok(calls.every(c => (c.query?.match(/\br\d+:/g)?.length ?? 0) <= 5));
    assert.ok(calls.every(c => !c.query?.includes("nodes")));
    const nodes: unknown[] = []; let cursor: string | null = null;
    do { const page = await fetchPullRequestPage("o", "r", cursor, undefined, "captured"); nodes.push(...page.nodes); cursor = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null; } while (cursor);
    assert.equal(nodes.length, 130);
    const team = await fetchPullRequestPage("o", "r", null, ["alice"], "captured");
    assert.equal(team.totalCount, 1201); assert.equal(team.nodes.length, 1);
    assert.equal(team.pageInfo.endCursor, "team-next");
    assert.ok(calls.filter(c => c.query?.includes("PRPage")).every(c => c.query?.includes("first: 25")));
    assert.equal((await fetchViewer("captured")).login, "me");
    await fetchRepoPipeline("o", "r", { workflow: "Build", branch: "main", runsToShow: 5 }, "captured");
    assert.ok(calls.every(c => c.authorization === "Bearer captured"));
    const aborted = new AbortController(); aborted.abort();
    const before = calls.length;
    await assert.rejects(fetchPullRequestPage("o", "r", null, undefined, "captured", aborted.signal), { name: "AbortError" });
    assert.equal(calls.length, before);
  } finally { globalThis.fetch = original; }
});
