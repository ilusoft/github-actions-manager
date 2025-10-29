import { fetchGithubJson, GithubApiError } from "@/lib/github/client";

interface GithubBranchCommitAuthor {
  login?: string;
  name?: string;
  email?: string;
  date?: string;
}

interface GithubBranchCommit {
  sha: string;
  url?: string;
  html_url?: string;
  author?: GithubBranchCommitAuthor | null;
  committer?: GithubBranchCommitAuthor | null;
  commit?: {
    author?: GithubBranchCommitAuthor | null;
    committer?: GithubBranchCommitAuthor | null;
    message?: string;
  };
}

export const deleteBranchRef = async (
  organization: string,
  repository: string,
  branch: string,
  signal?: AbortSignal
): Promise<void> => {
  const encodedBranch = encodeURIComponent(branch);

  try {
    await fetchGithubJson<void>({
      path: `/repos/${organization}/${repository}/git/refs/heads/${encodedBranch}`,
      method: "DELETE",
      signal,
    });
  } catch (error) {
    if (error instanceof GithubApiError && error.status === 404) {
      throw new GithubApiError(
        `Branch "${branch}" not found in ${repository}.`,
        404
      );
    }

    throw error;
  }
};

interface GithubBranch {
  name: string;
  commit: GithubBranchCommit;
}

interface GithubBranchRef {
  ref: string;
  object?: {
    type: string;
    sha?: string;
  } | null;
}

export interface RepositoryBranchSummary {
  name: string;
  url: string;
  latestCommitSha: string;
  latestCommitUrl?: string;
  latestCommitAuthor?: string;
  latestCommitDate?: string;
  latestCommitMessage?: string;
}

export interface RepositoryBranchRequestOptions {
  perPage?: number;
  limit?: number;
  protected?: boolean;
  signal?: AbortSignal;
}

export interface RepositoryBranchDetail {
  author?: string;
  authoredDate?: string;
  commitMessage?: string;
}

const firstLine = (value?: string) => {
  if (!value) {
    return undefined;
  }

  const [line] = value.split("\n");
  return line.trim();
};

interface GithubRefObject {
  object: {
    sha: string;
  };
}

export const fetchBranchRef = async (
  organization: string,
  repository: string,
  branch: string,
  signal?: AbortSignal
): Promise<string> => {
  const encodedBranch = encodeURIComponent(branch);

  try {
    const response = await fetchGithubJson<GithubRefObject>({
      path: `/repos/${organization}/${repository}/git/ref/heads/${encodedBranch}`,
      signal,
    });

    return response.object.sha;
  } catch (error) {
    if (error instanceof GithubApiError && error.status === 404) {
      throw new GithubApiError(
        `Base branch "${branch}" not found in ${repository}.`,
        404
      );
    }

    throw error;
  }
};

interface CreateRefRequestBody {
  ref: string;
  sha: string;
}

interface CreateRefResponse {
  ref: string;
  object: {
    sha: string;
  };
}

export const createBranchRef = async (
  organization: string,
  repository: string,
  branch: string,
  sha: string,
  signal?: AbortSignal
): Promise<CreateRefResponse> => {
  const body: CreateRefRequestBody = {
    ref: `refs/heads/${branch}`,
    sha,
  };

  return fetchGithubJson<CreateRefResponse>({
    path: `/repos/${organization}/${repository}/git/refs`,
    method: "POST",
    signal,
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
};

export const fetchRepositoryBranches = async (
  organization: string,
  repository: string,
  options?: RepositoryBranchRequestOptions
): Promise<RepositoryBranchSummary[]> => {
  const encodedOrg = encodeURIComponent(organization);
  const encodedRepo = encodeURIComponent(repository);

  const normalizedPerPage = Math.min(Math.max(options?.perPage ?? 10, 1), 100);
  const normalizedLimit = Math.min(
    Math.max(options?.limit ?? normalizedPerPage, 1),
    100
  );

  const query = new URLSearchParams({
    per_page: normalizedPerPage.toString(),
  });

  if (typeof options?.protected === "boolean") {
    query.set("protected", options.protected ? "true" : "false");
  }

  const branches = await fetchGithubJson<GithubBranch[]>({
    path: `/repos/${encodedOrg}/${encodedRepo}/branches?${query.toString()}`,
    signal: options?.signal,
  });

  if (!branches?.length) {
    return [];
  }

  const deletedBranches = new Set<string>();
  try {
    const refs = await fetchGithubJson<GithubBranchRef[]>({
      path: `/repos/${encodedOrg}/${encodedRepo}/git/matching-refs/heads/`,
      signal: options?.signal,
    });

    refs.forEach((ref) => {
      const refName = ref.ref?.replace(/^refs\/heads\//, "");
      if (!refName) {
        return;
      }

      const type = ref.object?.type;
      if (!type || type === "commit") {
        return;
      }

      deletedBranches.add(refName);
    });
  } catch (error) {
    if (error instanceof GithubApiError && error.status >= 500) {
      // GitHub occasionally returns 500 for matching-refs; fall back to branches list.
    } else {
      throw error;
    }
  }

  const summaries = branches
    .filter((branch) => {
      if (deletedBranches.has(branch.name)) {
        return false;
      }

      return Boolean(branch.commit?.sha);
    })
    .map((branch) => {
      const commit = branch.commit ?? ({} as GithubBranchCommit);
      const commitDetails = commit.commit ?? {};

      const rawAuthor =
        commit.author || commitDetails.author || commitDetails.committer || commit.committer;
      const authorName = rawAuthor?.login || rawAuthor?.name;

      const rawDate =
        commitDetails.author?.date || commitDetails.committer?.date || rawAuthor?.date;

      return {
        name: branch.name,
        url: `https://github.com/${organization}/${repository}/tree/${encodeURIComponent(
          branch.name
        )}`,
        latestCommitSha: commit.sha ?? "",
        latestCommitUrl: commit.html_url || commit.url,
        latestCommitAuthor: authorName ?? undefined,
        latestCommitDate: rawDate,
        latestCommitMessage: firstLine(commitDetails.message),
      } satisfies RepositoryBranchSummary;
    });

  const sorted = summaries.sort((left, right) => {
    const leftTime = left.latestCommitDate ? new Date(left.latestCommitDate).valueOf() : 0;
    const rightTime = right.latestCommitDate ? new Date(right.latestCommitDate).valueOf() : 0;
    return rightTime - leftTime;
  });

  return sorted.slice(0, normalizedLimit);
};

export const fetchRepositoryBranchDetails = async (
  organization: string,
  repository: string,
  branch: string,
  signal?: AbortSignal
): Promise<RepositoryBranchDetail> => {
  const encodedOrg = encodeURIComponent(organization);
  const encodedRepo = encodeURIComponent(repository);
  const encodedBranch = encodeURIComponent(branch);

  const branchResponse = await fetchGithubJson<GithubBranch>({
    path: `/repos/${encodedOrg}/${encodedRepo}/branches/${encodedBranch}`,
    signal,
  });

  const commit = branchResponse.commit ?? ({} as GithubBranchCommit);
  const commitDetails = commit.commit ?? {};

  const authorName =
    commitDetails.author?.name ||
    commit.author?.login ||
    commitDetails.committer?.name ||
    commit.committer?.login;

  const authoredDate =
    commitDetails.author?.date ||
    commitDetails.committer?.date ||
    commit.author?.date ||
    commit.committer?.date;

  return {
    author: authorName ?? undefined,
    authoredDate,
    commitMessage: commitDetails.message ?? undefined,
  } satisfies RepositoryBranchDetail;
};
