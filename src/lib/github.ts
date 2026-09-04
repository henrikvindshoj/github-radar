import { getToken } from "./token";

const GRAPHQL_ENDPOINT = "https://api.github.com/graphql";

export class GitHubApiError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = "GitHubApiError";
  }
}

interface GraphQLResponse<T> {
  data?: T;
  errors?: Array<{ message: string; type?: string }>;
}

async function graphql<T>(
  query: string,
  variables: Record<string, unknown>,
  token?: string,
): Promise<T> {
  const effectiveToken = token ?? getToken();
  if (!effectiveToken) {
    throw new GitHubApiError("Missing GitHub token", 401);
  }
  const res = await fetch(GRAPHQL_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${effectiveToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) {
    let body = "";
    try {
      body = await res.text();
    } catch {
      // ignore
    }
    throw new GitHubApiError(
      `GitHub API ${res.status} ${res.statusText}${body ? `: ${body.slice(0, 200)}` : ""}`,
      res.status,
    );
  }
  const json = (await res.json()) as GraphQLResponse<T>;
  if (json.errors && json.errors.length > 0) {
    throw new GitHubApiError(
      json.errors.map((e) => e.message).join("; "),
    );
  }
  if (!json.data) {
    throw new GitHubApiError("Empty GraphQL response");
  }
  return json.data;
}

export interface Viewer {
  login: string;
  avatarUrl: string;
}

const VIEWER_QUERY = /* GraphQL */ `
  query Viewer {
    viewer {
      login
      avatarUrl
    }
  }
`;

export async function fetchViewer(token: string): Promise<Viewer> {
  const data = await graphql<{ viewer: Viewer }>(VIEWER_QUERY, {}, token);
  return data.viewer;
}

export type CheckState =
  | "SUCCESS"
  | "FAILURE"
  | "ERROR"
  | "PENDING"
  | "EXPECTED";

export type MergeableState = "MERGEABLE" | "CONFLICTING" | "UNKNOWN";

export type ReviewDecision =
  | "APPROVED"
  | "CHANGES_REQUESTED"
  | "REVIEW_REQUIRED"
  | null;

export interface PullRequestNode {
  id: string;
  number: number;
  title: string;
  url: string;
  isDraft: boolean;
  createdAt: string;
  updatedAt: string;
  author: { login: string; avatarUrl: string } | null;
  headRefName: string;
  baseRefName: string;
  mergeable: MergeableState;
  reviewDecision: ReviewDecision;
  additions: number;
  deletions: number;
  commits: {
    nodes: Array<{
      commit: {
        statusCheckRollup: { state: CheckState } | null;
      };
    }>;
  };
  comments: { totalCount: number };
}

export interface RepoPullRequests {
  nameWithOwner: string;
  url: string;
  pullRequests: { nodes: PullRequestNode[] };
}

const REPO_PRS_QUERY = /* GraphQL */ `
  query RepoPRs($owner: String!, $name: String!) {
    repository(owner: $owner, name: $name) {
      nameWithOwner
      url
      pullRequests(
        states: OPEN
        first: 25
        orderBy: { field: UPDATED_AT, direction: DESC }
      ) {
        nodes {
          id
          number
          title
          url
          isDraft
          createdAt
          updatedAt
          author {
            login
            avatarUrl
          }
          headRefName
          baseRefName
          mergeable
          reviewDecision
          additions
          deletions
          commits(last: 1) {
            nodes {
              commit {
                statusCheckRollup {
                  state
                }
              }
            }
          }
          comments {
            totalCount
          }
        }
      }
    }
  }
`;

export async function fetchRepoPullRequests(
  owner: string,
  name: string,
): Promise<RepoPullRequests> {
  const data = await graphql<{ repository: RepoPullRequests | null }>(
    REPO_PRS_QUERY,
    { owner, name },
  );
  if (!data.repository) {
    throw new GitHubApiError(`Repository not found: ${owner}/${name}`, 404);
  }
  return data.repository;
}

const TEAM_REPO_PRS_QUERY = /* GraphQL */ `
  query TeamRepoPRs($q: String!, $first: Int!) {
    search(query: $q, type: ISSUE, first: $first) {
      nodes {
        __typename
        ... on PullRequest {
          id
          number
          title
          url
          isDraft
          createdAt
          updatedAt
          author {
            login
            avatarUrl
          }
          headRefName
          baseRefName
          mergeable
          reviewDecision
          additions
          deletions
          commits(last: 1) {
            nodes {
              commit {
                statusCheckRollup {
                  state
                }
              }
            }
          }
          comments {
            totalCount
          }
        }
      }
    }
  }
`;

const TEAM_SEARCH_PAGE_SIZE = 50;

export async function fetchTeamRepoPullRequests(
  owner: string,
  name: string,
  members: readonly string[],
): Promise<RepoPullRequests> {
  const repoSummary: Pick<RepoPullRequests, "nameWithOwner" | "url"> = {
    nameWithOwner: `${owner}/${name}`,
    url: `https://github.com/${owner}/${name}`,
  };
  if (members.length === 0) {
    return { ...repoSummary, pullRequests: { nodes: [] } };
  }
  const q = [
    `repo:${owner}/${name}`,
    "is:pr",
    "is:open",
    "sort:updated-desc",
    ...members.map((m) => `author:${m}`),
  ].join(" ");
  type SearchNode = (PullRequestNode & { __typename: "PullRequest" }) | { __typename: string };
  const data = await graphql<{ search: { nodes: SearchNode[] } }>(
    TEAM_REPO_PRS_QUERY,
    { q, first: TEAM_SEARCH_PAGE_SIZE },
  );
  const nodes = data.search.nodes.filter(
    (n): n is PullRequestNode & { __typename: "PullRequest" } =>
      n.__typename === "PullRequest",
  );
  return {
    ...repoSummary,
    pullRequests: { nodes },
  };
}

export type ReviewState =
  | "APPROVED"
  | "CHANGES_REQUESTED"
  | "COMMENTED"
  | "DISMISSED"
  | "PENDING";

export interface ReviewNode {
  state: ReviewState;
  submittedAt: string | null;
  author: { login: string; avatarUrl: string } | null;
}

export interface ReviewActivityPullRequest {
  number: number;
  title: string;
  url: string;
  author: { login: string; avatarUrl: string } | null;
  reviews: { nodes: ReviewNode[] } | null;
}

export interface RepoReviewActivity {
  nameWithOwner: string;
  pullRequests: ReviewActivityPullRequest[];
  /** True when the repo had more matching PRs than we were willing to page through. */
  truncated: boolean;
}

const REVIEW_ACTIVITY_QUERY = /* GraphQL */ `
  query ReviewActivity($q: String!, $first: Int!, $after: String) {
    search(query: $q, type: ISSUE, first: $first, after: $after) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        __typename
        ... on PullRequest {
          number
          title
          url
          author {
            login
            avatarUrl
          }
          reviews(first: 100) {
            nodes {
              state
              submittedAt
              author {
                login
                avatarUrl
              }
            }
          }
        }
      }
    }
  }
`;

const REVIEW_SEARCH_PAGE_SIZE = 50;
const REVIEW_SEARCH_MAX_PAGES = 2;

/**
 * Every pull request in a repo touched since `sinceIso`, with its reviews.
 * Uses search (not `repository.pullRequests`) so merged and closed PRs are
 * included -- most reviewed PRs are no longer open.
 */
export async function fetchRepoReviewActivity(
  owner: string,
  name: string,
  sinceIso: string,
): Promise<RepoReviewActivity> {
  const q = [
    `repo:${owner}/${name}`,
    "is:pr",
    `updated:>=${sinceIso}`,
    "sort:updated-desc",
  ].join(" ");

  type SearchNode =
    | (ReviewActivityPullRequest & { __typename: "PullRequest" })
    | { __typename: string };

  const pullRequests: ReviewActivityPullRequest[] = [];
  let after: string | null = null;
  let truncated = false;

  for (let page = 0; page < REVIEW_SEARCH_MAX_PAGES; page++) {
    const data: {
      search: {
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
        nodes: SearchNode[];
      };
    } = await graphql(REVIEW_ACTIVITY_QUERY, {
      q,
      first: REVIEW_SEARCH_PAGE_SIZE,
      after,
    });
    for (const node of data.search.nodes) {
      if (node.__typename === "PullRequest") {
        pullRequests.push(node as ReviewActivityPullRequest);
      }
    }
    if (!data.search.pageInfo.hasNextPage) break;
    after = data.search.pageInfo.endCursor;
    if (page === REVIEW_SEARCH_MAX_PAGES - 1) truncated = true;
  }

  return { nameWithOwner: `${owner}/${name}`, pullRequests, truncated };
}
