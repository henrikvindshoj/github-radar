# Codex reviews through GitHub Actions

The workflow in `.github/workflows/codex-review.yml` runs Codex when a
non-draft pull request is opened, updated, reopened, or marked ready for review.
It posts findings as a PR conversation comment and updates that comment on
subsequent runs. This is a custom Actions review, not the Codex GitHub
integration's automatic review.

## Enable

1. Create an OpenAI API key at https://platform.openai.com/api-keys with access
   to the Responses API and funded API billing.
2. In this repository, open **Settings > Secrets and variables > Actions**.
   Add a repository secret named `OPENAI_API_KEY_PR_REVIEW` containing the API key.
   Do not commit or paste the key into a PR.
3. Under **Settings > Secrets and variables > Actions > Variables**, add a
   repository variable named `CODEX_EXTERNAL_REVIEW_OPT_IN` with value `true`.
   This explicitly enables sending PR diffs to OpenAI for review. Without it,
   the review job is skipped.
4. Merge the workflow PR. Ensure GitHub Actions is enabled and repository or
   organization policy allows the actions used in the workflow.
5. Open a non-draft PR, push a commit to an existing PR, or close and reopen
   the existing smoke-test PR #27.
6. Check **Actions > Codex PR review**. A successful run should publish a
   **Codex review** comment identifying the reviewed commit, including
   "No actionable findings." when appropriate.

API usage is billed to the API project associated with the key, separately
from ChatGPT subscriptions. Configure a project budget and usage alerts.

## Scope and permissions

- Fork PRs and drafts are skipped. The Codex action also requires the triggering
  user to have repository write access by default; bot bypasses are not enabled.
- The review job has `contents: read`, uses a read-only Codex permission
  profile under a dedicated `codex-review` user without sudo access, and does not install or run project dependencies.
- Before Codex runs, the workflow generates a diff with zero lines of surrounding
  context and removes the checkout. Codex receives only that diff, so reviews may
  miss issues that require surrounding code to establish.
- Before invoking Codex, a mandatory pattern scan rejects diffs containing common
  OpenAI/GitHub/AWS credentials, private keys, bearer tokens, and credential
  assignments. Matching text is never logged. This scan is heuristic and does
  not detect every secret or other confidential data.
- Codex returns structured JSON with at most 10 findings. A separate publishing
  job rejects malformed or oversized output, validates finding fields, redacts
  common credential patterns, and renders bounded plain text without links,
  mentions, HTML, or Markdown from the model. Published findings contain only
  validated severity, a restricted file path, and a positive line number with
  fixed template text. Each location must map to an added line in the PR's
  current diff; locations without available patch data are rejected. Model-written explanations are not published.
- Feedback is posted by a separate job with `pull-requests: write`. Validation
  runs on a fresh runner, rather than executing a sanitizer after Codex in the
  same job. Model output is still untrusted; these checks limit formatting and
  common disclosure patterns, not the accuracy of the review.
- Actions are pinned to commit SHAs. The Codex CLI/model use the action's
  defaults; update action pins periodically.
- New commits cancel older runs. The posting job also checks that the PR head
  still matches before publishing.
- Findings are advisory comments; the workflow does not approve, block, or
  merge pull requests.

## Troubleshooting

A missing-key error means the repository secret must be added. API authentication,
quota, or model-access errors appear in the review job logs. If posting fails with
a permissions error, check repository and organization Actions policies. If a
review is skipped, check draft status, whether the head is a fork, and the
triggering user's repository access.
