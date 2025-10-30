import { fetchGithubJson } from "@/lib/github/client";

export type PullRequestStateFilter = "open" | "closed" | "all";

interface GithubPullRequestUser {
  login?: string;
}

interface GithubPullRequestBranchRef {
  ref?: string;
  sha?: string;
}

interface GithubPullRequest {
  number: number;
  title?: string;
  html_url?: string;
  created_at?: string;
  state?: "open" | "closed";
  draft?: boolean;
  merged_at?: string | null;
  base?: GithubPullRequestBranchRef;
  head?: GithubPullRequestBranchRef;
  user?: GithubPullRequestUser | null;
  body?: string | null;
}

export interface RepositoryPullRequestRequestOptions {
  perPage?: number;
  state?: PullRequestStateFilter;
  base?: string;
  page?: number;
  author?: string;
  signal?: AbortSignal;
}

export interface RepositoryPullRequestSummary {
  number: number;
  title: string;
  url: string;
  createdAt?: string;
  state: "open" | "closed";
  merged: boolean;
  draft: boolean;
  baseBranch?: string;
  headBranch?: string;
  headSha?: string;
  author?: string;
  description?: string;
}

const normalizeBody = (value?: string | null) => {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

export const fetchRepositoryPullRequests = async (
  organization: string,
  repository: string,
  options?: RepositoryPullRequestRequestOptions
): Promise<RepositoryPullRequestSummary[]> => {
  const encodedOrg = encodeURIComponent(organization);
  const encodedRepo = encodeURIComponent(repository);

  const normalizedPerPage = Math.min(Math.max(options?.perPage ?? 10, 1), 100);
  const params = new URLSearchParams({
    per_page: normalizedPerPage.toString(),
    page: Math.max(options?.page ?? 1, 1).toString(),
    state: options?.state ?? "open",
  });

  if (options?.base) {
    params.set("base", options.base);
  }

  const pulls = await fetchGithubJson<GithubPullRequest[]>({
    path: `/repos/${encodedOrg}/${encodedRepo}/pulls?${params.toString()}`,
    signal: options?.signal,
  });

  if (!pulls?.length) {
    return [];
  }

  const authorFilter = options?.author?.trim().toLowerCase();

  const summaries = pulls
    .filter((pull) => {
      if (!authorFilter) {
        return true;
      }

      const login = pull.user?.login?.toLowerCase();
      return login ? login.includes(authorFilter) : false;
    })
    .map((pull) => {
      const merged = Boolean(pull.merged_at);
      const draft = Boolean(pull.draft);

      return {
        number: pull.number,
        title: pull.title ?? `PR #${pull.number}`,
        url:
          pull.html_url ??
          `https://github.com/${organization}/${repository}/pull/${pull.number}`,
        createdAt: pull.created_at,
        state: pull.state ?? "open",
        merged,
        draft,
        baseBranch: pull.base?.ref,
        headBranch: pull.head?.ref,
        headSha: pull.head?.sha,
        author: pull.user?.login,
        description: normalizeBody(pull.body),
      } satisfies RepositoryPullRequestSummary;
    });

  return summaries;
};

interface CreatePullRequestRequestBody {
  title: string;
  head: string;
  base: string;
  body?: string;
  draft?: boolean;
}

export interface CreatePullRequestResponse {
  html_url: string;
  number: number;
  title: string;
  state: string;
}

export const createPullRequest = async (
  organization: string,
  repository: string,
  title: string,
  head: string,
  base: string,
  body?: string,
  draft?: boolean,
  signal?: AbortSignal
): Promise<CreatePullRequestResponse> => {
  const encodedOrg = encodeURIComponent(organization);
  const encodedRepo = encodeURIComponent(repository);

  const payload: CreatePullRequestRequestBody = {
    title,
    head,
    base,
    body,
    draft,
  };

  return fetchGithubJson<CreatePullRequestResponse>({
    path: `/repos/${encodedOrg}/${encodedRepo}/pulls`,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    signal,
  });
};
