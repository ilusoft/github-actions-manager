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
  mergeable?: boolean | null;
  mergeable_state?: string | null;
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
  mergeable?: boolean;
  mergeableState?: string;
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
  options?: RepositoryPullRequestRequestOptions,
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

  const detailMap = new Map<number, GithubPullRequest>();
  const openPulls = pulls.filter((pull) => pull.state !== "closed");

  if (openPulls.length > 0) {
    await Promise.all(
      openPulls.map(async (pull) => {
        try {
          const detail = await fetchGithubJson<GithubPullRequest>({
            path: `/repos/${encodedOrg}/${encodedRepo}/pulls/${pull.number}`,
            signal: options?.signal,
          });
          if (detail) {
            detailMap.set(pull.number, detail);
          }
        } catch (error) {
          if (error instanceof DOMException && error.name === "AbortError") {
            throw error;
          }
          // Ignore other errors when fetching mergeability info.
        }
      }),
    );
  }

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
      const detail = detailMap.get(pull.number) ?? pull;
      const rawMergeable = detail.mergeable;
      const mergeable =
        typeof rawMergeable === "boolean" ? rawMergeable : undefined;
      const mergeableState = detail.mergeable_state ?? undefined;

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
        mergeable,
        mergeableState,
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
  signal?: AbortSignal,
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

export type PullRequestReviewEvent = "APPROVE" | "REQUEST_CHANGES" | "COMMENT";

interface SubmitPullRequestReviewOptions {
  organization: string;
  repository: string;
  pullNumber: number;
  event: PullRequestReviewEvent;
  body?: string;
  signal?: AbortSignal;
}

interface PullRequestReviewResponse {
  id: number;
  state?: string;
  html_url?: string;
}

export const submitPullRequestReview = async ({
  organization,
  repository,
  pullNumber,
  event,
  body,
  signal,
}: SubmitPullRequestReviewOptions): Promise<PullRequestReviewResponse | void> => {
  const encodedOrg = encodeURIComponent(organization);
  const encodedRepo = encodeURIComponent(repository);

  const payload: { event: PullRequestReviewEvent; body?: string } = { event };
  const trimmedBody = body?.trim();
  if (trimmedBody) {
    payload.body = trimmedBody;
  }

  return fetchGithubJson<PullRequestReviewResponse | void>({
    path: `/repos/${encodedOrg}/${encodedRepo}/pulls/${pullNumber}/reviews`,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    signal,
  });
};

// Close Pull Request
interface ClosePullRequestOptions {
  organization: string;
  repository: string;
  pullNumber: number;
  signal?: AbortSignal;
}

interface PullRequestCloseResponse {
  number: number;
  state: string;
  title: string;
  html_url: string;
}

export const closePullRequest = async ({
  organization,
  repository,
  pullNumber,
  signal,
}: ClosePullRequestOptions): Promise<PullRequestCloseResponse> => {
  const encodedOrg = encodeURIComponent(organization);
  const encodedRepo = encodeURIComponent(repository);

  const payload = {
    state: "closed" as const,
  };

  return fetchGithubJson<PullRequestCloseResponse>({
    path: `/repos/${encodedOrg}/${encodedRepo}/pulls/${pullNumber}`,
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    signal,
  });
};
