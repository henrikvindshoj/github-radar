# GitHub Radar

A GoCD-inspired dashboard for personal use. Two views, switchable from the header:

- **Pull requests** — open PRs across a fixed list of repos, grouped by repo, with per-PR status (CI checks, review decision, mergeability).
- **Pipelines** — recent GitHub Actions workflow runs across repos, so you can see at a glance which changes are deployed to PROD and which are still **awaiting deployment** or **running**.

Fully static React + TypeScript SPA. Talks directly to the GitHub GraphQL + REST APIs from the browser using a personal access token stored in `localStorage`. The monitored repos/pipelines are configured per browser and also stored in `localStorage`, so different users can run their own setup independently. No backend.

## Setup

```bash
npm install
npm run dev
```

Open the printed URL, paste a fine-grained GitHub PAT into the first-run dialog, and you're in.

### Required PAT scopes

Use a **fine-grained PAT** scoped to only the repos in your configuration. Repository permissions:

- `Contents: Read`
- `Pull requests: Read`
- `Actions: Read` (for the Pipelines view)
- `Metadata: Read` (implicit)

Create one at [github.com/settings/personal-access-tokens/new](https://github.com/settings/personal-access-tokens/new).

> The token lives in this browser's `localStorage`. That makes it readable by any XSS on this origin. Personal use only.

## Configuring repos

Open the **Config** button in the header to edit the JSON directly in the app. It is validated by Zod ([`src/config/schema.ts`](src/config/schema.ts)) and saved to this browser's `localStorage`, so each user keeps their own setup. "Reset to default" restores the bundled config.

The bundled default lives in [`src/config/repos.json`](src/config/repos.json) and is used as the seed whenever a browser has no saved config:

```json
{
  "teams": {},
  "groups": [
    {
      "name": "examples",
      "repos": [
        { "owner": "vercel", "name": "next.js" },
        { "owner": "facebook", "name": "react" }
      ]
    }
  ]
}
```

## Configuring pipelines

Pipeline tracking is configured in the **same** config (Config editor / [`src/config/repos.json`](src/config/repos.json) default). The workflow name is set **per repo** (workflow names differ across repos, so the name is repeated on each entry — that's expected). Shared settings like `branch`, `runsToShow`, and `prodEnvironment` live in a top-level `pipelineDefaults` block and can still be overridden per repo:

```json
{
  "pipelineDefaults": {
    "branch": "main",
    "runsToShow": 10,
    "prodEnvironment": "PROD"
  },
  "groups": [
    {
      "name": "core",
      "repos": [
        { "owner": "your-org", "name": "service-a", "pipeline": { "workflow": "Build and publish main" } },
        {
          "owner": "your-org",
          "name": "service-b",
          "pipeline": { "workflow": "Deploy", "branch": "release" }
        },
        {
          "owner": "your-org",
          "name": "service-c",
          "pipeline": { "enabled": false }
        }
      ]
    }
  ]
}
```

Per-repo `pipeline` fields:

| Field | Default | Meaning |
| --- | --- | --- |
| `workflow` | _(required per repo)_ | Workflow display name or file name to match (e.g. `Build and publish main` or `build-and-publish.yml`) |
| `branch` | `main` (from `pipelineDefaults`) | Branch whose runs to track |
| `runsToShow` | `10` (from `pipelineDefaults`) | Upper bound of recent runs to fetch (see truncation note below) |
| `prodEnvironment` | `PROD` (from `pipelineDefaults`) | Display label for the production target |
| `enabled` | `true` | Set to `false` to hide this repo from the Pipelines view |

A repo appears on the Pipelines view only if it has a `workflow` set and is not disabled. You can still put a `workflow` in `pipelineDefaults` as a fallback if most repos share the same name.

### Monitoring multiple pipelines from one repo

Use a `pipelines` array instead of a single `pipeline` to track several workflows from the same repo (each renders as its own section):

```json
{
  "owner": "your-org",
  "name": "multi-service",
  "pipelines": [
    { "workflow": "service-one", "branch": "master" },
    { "workflow": "service-two", "branch": "master" }
  ]
}
```

Each array entry takes the same fields as `pipeline` and inherits any unset field from `pipelineDefaults`. Entries are de-duplicated by `workflow` + `branch`.

### Pipeline status semantics

Status is derived from each workflow run's `status` / `conclusion`:

| Color | State | Meaning |
| --- | --- | --- |
| green | In PROD | Run completed successfully (deployed) |
| orange | Awaiting deployment | Waiting on a deployment approval / environment protection rule |
| yellow | Running | Queued or in progress |
| red | Failed | Failed, timed out, or startup failure |
| gray | No deployment | Cancelled / skipped / stale |

The per-repo header shows how many runs are still awaiting PROD, or "Up to date" when everything has shipped.

The list is truncated to everything **up to and including the first run that reached PROD** — older runs are already shipped and hidden. `runsToShow` is only the upper bound fetched from GitHub; if PROD isn't reached within that many runs, all fetched runs are shown.

## Scripts

- `npm run dev` -- Vite dev server
- `npm run build` -- typecheck + production build to `dist/`
- `npm run preview` -- serve the production build
- `npm run typecheck` -- TS only, no emit

## Architecture

- Single-page React app, no router
- TanStack Query for fetching, caching, and 60s polling (paused on hidden tab)
- One GraphQL query per repo, fired in parallel; per-repo errors are isolated
- Status derivation lives in [`src/lib/status.ts`](src/lib/status.ts) and drives the colored status bar on each card

## Status semantics

| Color | Meaning |
| --- | --- |
| green | Checks passing AND review approved |
| yellow | Checks running / awaiting review |
| red | Any required check failing |
| orange | Changes requested by reviewer |
| gray | Draft, or no signals available |
