# GitHub Radar

A GoCD-inspired dashboard for personal use: see open pull requests across a fixed list of GitHub repositories at a glance, grouped by repo, with per-PR status (CI checks, review decision, mergeability).

Fully static React + TypeScript SPA. Talks directly to the GitHub GraphQL API from the browser using a personal access token stored in `localStorage`. No backend.

## Setup

```bash
npm install
npm run dev
```

Open the printed URL, paste a fine-grained GitHub PAT into the first-run dialog, and you're in.

### Required PAT scopes

Use a **fine-grained PAT** scoped to only the repos in `src/config/repos.json`. Repository permissions:

- `Contents: Read`
- `Pull requests: Read`
- `Metadata: Read` (implicit)

Create one at [github.com/settings/personal-access-tokens/new](https://github.com/settings/personal-access-tokens/new).

> The token lives in this browser's `localStorage`. That makes it readable by any XSS on this origin. Personal use only.

## Configuring repos

Edit [`src/config/repos.json`](src/config/repos.json):

```json
[
  { "owner": "vercel", "name": "next.js" },
  { "owner": "facebook", "name": "react" }
]
```

The list is validated by Zod at startup ([`src/config/schema.ts`](src/config/schema.ts)).

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
