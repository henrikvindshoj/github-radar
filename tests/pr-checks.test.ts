import test from "node:test";
import assert from "node:assert/strict";
import { fetchPrChecks } from "../src/lib/prChecks.ts";
import { createGitHubTransport } from "../src/lib/githubRequest.ts";

const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const run = (id: number, conclusion: string | null = "success", status = "completed") => ({ id, name: `Check ${id}`, conclusion, status, html_url: `https://github.com/o/r/runs/${id}` });
const status = (id: number, state = "success") => ({ id, context: `Status ${id}`, state, target_url: `https://ci.example.com/${id}` });

test("details include named check conclusions and distinct latest commit statuses", async () => {
  let clock = 0;
  const request = createGitHubTransport({ now: () => clock, wait: async ms => { clock += ms; }, fetch: async input => {
    return String(input).includes("check-runs?") ? response({ total_count: 12, check_runs: [
      run(1), run(2, "failure"), run(3, "timed_out"), run(4, "action_required"),
      run(5, "cancelled"), run(6, "skipped"), run(7, "neutral"), run(8, "stale"),
      run(9, null, "queued"), run(10, null, "in_progress"), run(11, null, "waiting"), run(12, null, "requested"),
    ] }) : response({ total_count: 4, statuses: [status(1), status(2, "failure"), status(3, "error"), status(4, "pending")] });
  } });
  const result = await fetchPrChecks("o", "r", "a".repeat(40), "token", undefined, request);
  assert.deepEqual(result.errors, []);
  assert.equal(result.checks.length, 16);
  assert.equal(new Set(result.checks.map(check => check.id)).size, 16);
  assert.deepEqual(result.checks.slice(0, 12).map(check => [check.outcome, check.label]), [
    ["success", "Passed"], ["failure", "Failed"], ["failure", "Timed out"], ["failure", "Action required"],
    ["neutral", "Cancelled"], ["neutral", "Skipped"], ["neutral", "Neutral"], ["neutral", "Stale"],
    ["pending", "Queued"], ["pending", "In progress"], ["pending", "Waiting"], ["pending", "Requested"],
  ]);
  assert.deepEqual(result.checks.slice(12).map(check => [check.outcome, check.label]), [["success", "Passed"], ["failure", "Failed"], ["failure", "Error"], ["pending", "Pending"]]);
  assert.equal(result.checks[0].name, "Check 1");
  assert.equal(result.checks[12].url, "https://ci.example.com/1");
});

test("details paginate both endpoints on the fixed API host, deduplicate IDs and capture credentials", async () => {
  let clock = 0;
  const calls: string[] = [];
  const controller = new AbortController();
  const request = createGitHubTransport({ now: () => clock, wait: async ms => { clock += ms; }, fetch: async (input, init) => {
    const url = new URL(String(input)); calls.push(String(input));
    assert.equal(url.origin, "https://api.github.com");
    assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer captured-token");
    assert.equal(init?.signal, controller.signal);
    assert.equal(url.searchParams.get("per_page"), "100");
    const page = Number(url.searchParams.get("page"));
    const count = page === 1 ? 100 : 2;
    if (url.pathname.endsWith("check-runs")) {
      assert.equal(url.searchParams.get("filter"), "latest");
      return response({ total_count: 102, check_runs: Array.from({ length: count }, (_, n) => run(page === 1 ? n : 99 + n)), url: "https://evil.example/next" });
    }
    return response({ total_count: 102, statuses: Array.from({ length: count }, (_, n) => status(page === 1 ? n : 99 + n)) });
  } });
  const result = await fetchPrChecks("o", "r", "b".repeat(40), "captured-token", controller.signal, request);
  assert.equal(calls.length, 4);
  assert.deepEqual(result.errors, []);
  assert.equal(result.checks.length, 202);
});

test("permission failures and failed later pages retain useful partial results with explicit errors", async () => {
  let clock = 0;
  const request = createGitHubTransport({ now: () => clock, wait: async ms => { clock += ms; }, fetch: async input => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("status")) return response({ message: "not authorized" }, 403);
    return url.searchParams.get("page") === "1" ? response({ total_count: 101, check_runs: Array.from({ length: 100 }, (_, n) => run(n)) }) : response({ message: "provider body" }, 502);
  } });
  const result = await fetchPrChecks("o", "r", "c".repeat(40), "token", undefined, request);
  assert.equal(result.checks.length, 100);
  assert.deepEqual(result.errors.map(error => error.source), ["Check runs", "Commit statuses"]);
  assert.match(result.errors[0].message, /502/);
  assert.match(result.errors[1].message, /403/);
  assert.ok(result.errors.every(error => !error.message.includes("provider body")));
});

test("malformed provider data is not presented as empty or passing, unsafe links are omitted", async () => {
  let clock = 0;
  const request = createGitHubTransport({ now: () => clock, wait: async ms => { clock += ms; }, fetch: async input => String(input).includes("check-runs?")
    ? response({ total_count: 1, check_runs: [run(1, "unknown_conclusion")] })
    : response({ total_count: 1, statuses: [{ ...status(1), target_url: "javascript:alert(1)" }] }),
  });
  const result = await fetchPrChecks("o", "r", "d".repeat(40), "token", undefined, request);
  assert.equal(result.errors.length, 1);
  assert.equal(result.checks.length, 1);
  assert.equal(result.checks[0].url, undefined);
  const incomplete = await fetchPrChecks("o", "r", "e".repeat(40), "token", undefined,
    async <T>() => ({ total_count: 1, check_runs: [], statuses: [] }) as T);
  assert.equal(incomplete.errors.length, 2);
  const invalid = await fetchPrChecks("o", "r", "f".repeat(40), "token", undefined,
    async <T>() => ({ total_count: -1, check_runs: [], statuses: [] }) as T);
  assert.equal(invalid.errors.length, 2);
});

test("abort cancels all detail work rather than returning a partial or empty success", async () => {
  const controller = new AbortController();
  let calls = 0;
  const request = async <T>() => {
    calls++; controller.abort();
    return { total_count: 1, check_runs: [run(1)] } as T;
  };
  await assert.rejects(fetchPrChecks("o", "r", "a".repeat(40), "token", controller.signal, request), { name: "AbortError" });
  assert.equal(calls, 1);
  await assert.rejects(fetchPrChecks("o", "r", "a".repeat(40), "token", controller.signal, request), { name: "AbortError" });
  assert.equal(calls, 1);
  const error = new DOMException("Cancelled", "AbortError");
  await assert.rejects(fetchPrChecks("o", "r", "a".repeat(40), "token", undefined, async () => { throw error; }), { name: "AbortError" });
});
