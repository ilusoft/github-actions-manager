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
  signal?: AbortSignal,
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
        404,
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
  signal?: AbortSignal,
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
        404,
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
  signal?: AbortSignal,
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
  options?: RepositoryBranchRequestOptions,
): Promise<RepositoryBranchSummary[]> => {
  const encodedOrg = encodeURIComponent(organization);
  const encodedRepo = encodeURIComponent(repository);

  const normalizedPerPage = Math.min(Math.max(options?.perPage ?? 10, 1), 100);
  const normalizedLimit = Math.min(
    Math.max(options?.limit ?? normalizedPerPage, 1),
    100,
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

  // Fetch detailed information for each branch using fetchRepositoryBranchDetails
  const branchDetailsPromises = branches
    .filter((branch) => Boolean(branch.commit?.sha))
    .map(async (branch) => {
      try {
        const details = await fetchRepositoryBranchDetails(
          organization,
          repository,
          branch.name,
          options?.signal,
        );
        return { branch, details };
      } catch (error) {
        // If details fetch fails, return branch without details
        console.warn(
          `Failed to fetch details for branch ${branch.name}:`,
          error,
        );
        return { branch, details: null };
      }
    });

  const branchResults = await Promise.all(branchDetailsPromises);

  const summaries = branchResults
    .filter(({ branch }) => Boolean(branch.commit?.sha))
    .map(({ branch, details }) => {
      const commit = branch.commit ?? ({} as GithubBranchCommit);
      const commitDetails = commit.commit ?? {};

      // Use data from fetchRepositoryBranchDetails if available, otherwise fall back to branch data
      const rawAuthor =
        commit.author ||
        commitDetails.author ||
        commitDetails.committer ||
        commit.committer;
      const branchAuthorName = rawAuthor?.login || rawAuthor?.name;
      const authorName = details?.author ?? branchAuthorName;

      const branchRawDate =
        commitDetails.author?.date ||
        commitDetails.committer?.date ||
        rawAuthor?.date;
      const rawDate = details?.authoredDate ?? branchRawDate;

      const branchMessage = firstLine(commitDetails.message);
      const commitMessage = details?.commitMessage ?? branchMessage;

      return {
        name: branch.name,
        url: `https://github.com/${organization}/${repository}/tree/${encodeURIComponent(
          branch.name,
        )}`,
        latestCommitSha: commit.sha ?? "",
        latestCommitUrl: commit.html_url || commit.url,
        latestCommitAuthor: authorName ?? undefined,
        latestCommitDate: rawDate,
        latestCommitMessage: commitMessage,
      } satisfies RepositoryBranchSummary;
    });

  const sorted = summaries.sort((left, right) => {
    const leftTime = left.latestCommitDate
      ? new Date(left.latestCommitDate).valueOf()
      : 0;
    const rightTime = right.latestCommitDate
      ? new Date(right.latestCommitDate).valueOf()
      : 0;
    return rightTime - leftTime;
  });

  return sorted.slice(0, normalizedLimit);
};

export const fetchRepositoryBranchDetails = async (
  organization: string,
  repository: string,
  branch: string,
  signal?: AbortSignal,
): Promise<RepositoryBranchDetail> => {
  const encodedOrg = encodeURIComponent(organization);
  const encodedRepo = encodeURIComponent(repository);
  const encodedBranch = encodeURIComponent(branch);

  // DEBUG: Log API endpoint being called
  console.debug(
    "[fetchRepositoryBranchDetails] Calling /branches endpoint for:",
    { organization, repository, branch },
  );

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

// ============================================
// Stale Branch Detection Types & Functions
// ============================================

interface GithubCompareResponse {
  ahead_by: number;
  behind_by: number;
  total_commits: number;
  base_commit?: GithubBranchCommit;
  commits?: GithubBranchCommit[];
}

export interface StaleBranchInfo {
  repository: string;
  branchName: string;
  branchUrl: string;
  author?: string;
  lastCommitDate?: string;
  lastCommitSha: string;
  baseBranch: string;
  aheadBy: number;
  behindBy: number;
}

export interface StaleBranchSearchOptions {
  organization: string;
  repositories: string[];
  baseBranch: string; // e.g., "main", "master", "develop"
  authorFilter?: string; // undefined means ALL users
  daysOldThreshold: number; // branches older than this many days
  signal?: AbortSignal;
  onProgress?: (
    current: number,
    total: number,
    repository: string,
    foundCount?: number,
  ) => void;
  onBranchFound?: (branch: StaleBranchInfo) => void;
}

/**
 * Compare two branches to check if the head branch is ahead of or behind the base branch.
 * Returns the comparison result with ahead/behind counts.
 */
export const compareBranches = async (
  organization: string,
  repository: string,
  baseBranch: string,
  headBranch: string,
  signal?: AbortSignal,
): Promise<GithubCompareResponse> => {
  const encodedOrg = encodeURIComponent(organization);
  const encodedRepo = encodeURIComponent(repository);
  const encodedBase = encodeURIComponent(baseBranch);
  const encodedHead = encodeURIComponent(headBranch);

  return fetchGithubJson<GithubCompareResponse>({
    path: `/repos/${encodedOrg}/${encodedRepo}/compare/${encodedBase}...${encodedHead}`,
    signal,
  });
};

interface GithubCommit {
  sha: string;
  url?: string;
  html_url?: string;
  commit?: {
    author?: {
      name?: string;
      email?: string;
      date?: string;
    } | null;
    committer?: {
      name?: string;
      email?: string;
      date?: string;
    } | null;
    message?: string;
  } | null;
  author?: {
    login?: string;
    id?: number;
  } | null;
  committer?: {
    login?: string;
    id?: number;
  } | null;
}

/**
 * Fetch detailed commit information using the commits/{ref} endpoint.
 * This provides complete information about the commit including author name, email, and date.
 * We use this instead of branches/{branch} because the branches endpoint may not always
 * include the nested commit details.
 */
export const fetchBranchDetails = async (
  organization: string,
  repository: string,
  branch: string,
  signal?: AbortSignal,
): Promise<{
  author?: string;
  lastCommitDate?: string;
  lastCommitSha: string;
  lastCommitMessage?: string;
}> => {
  const encodedOrg = encodeURIComponent(organization);
  const encodedRepo = encodeURIComponent(repository);
  const encodedBranch = encodeURIComponent(branch);

  // DEBUG: Log API endpoint being called
  console.debug("[fetchBranchDetails] Calling /commits endpoint for:", {
    organization,
    repository,
    branch,
  });

  try {
    // Use the commits endpoint with branch name to get full commit details
    const commitResponse = await fetchGithubJson<GithubCommit>({
      path: `/repos/${encodedOrg}/${encodedRepo}/commits/${encodedBranch}`,
      signal,
    });

    const commit = commitResponse.commit ?? {};
    const commitAuthor = commit.author ?? {};
    const commitCommitter = commit.committer ?? {};

    // Get author from commit details (prefer author name over GitHub login)
    const authorName =
      commitAuthor.name ||
      commitResponse.author?.login ||
      commitCommitter.name ||
      commitResponse.committer?.login;

    // Get date from commit details (prefer author date over committer date)
    const authoredDate = commitAuthor.date || commitCommitter.date;

    return {
      author: authorName,
      lastCommitDate: authoredDate,
      lastCommitSha: commitResponse.sha ?? "",
      lastCommitMessage: commit.message,
    };
  } catch (error) {
    if (error instanceof GithubApiError && error.status === 404) {
      // Branch/commit not found, return empty
      return { lastCommitSha: "" };
    }
    throw error;
  }
};

/**
 * Search for stale branches across multiple repositories.
 * A branch is considered stale if:
 * 1. It is behind the base branch (already merged)
 * 2. The last commit is older than the specified threshold (daysOldThreshold)
 * 3. Optionally matches the author filter
 *
 * Uses serialized API calls with delays to prevent rate limiting.
 * Queries each branch individually using branches/{branch} endpoint for complete details.
 */
export const searchStaleBranches = async (
  options: StaleBranchSearchOptions,
): Promise<StaleBranchInfo[]> => {
  const {
    organization,
    repositories,
    baseBranch,
    authorFilter,
    daysOldThreshold,
    signal,
    onProgress,
    onBranchFound,
  } = options;

  const staleBranches: StaleBranchInfo[] = [];
  const now = new Date();
  const thresholdMs = daysOldThreshold * 24 * 60 * 60 * 1000;

  // Small delay between API calls to prevent rate limiting (100ms)
  const delay = (ms: number) =>
    new Promise((resolve) => setTimeout(resolve, ms));

  for (let i = 0; i < repositories.length; i++) {
    const repository = repositories[i];

    // Report progress
    onProgress?.(i + 1, repositories.length, repository, staleBranches.length);

    // Check if cancelled
    if (signal?.aborted) {
      break;
    }

    try {
      // First get the list of branch names from matching-refs to get all branch heads
      const refs = await fetchGithubJson<GithubBranchRef[]>({
        path: `/repos/${encodeURIComponent(organization)}/${encodeURIComponent(repository)}/git/matching-refs/heads/`,
        signal,
      });

      // Filter to get only actual branch heads (not other refs)
      const branchNames = refs
        .filter((ref) => {
          const type = ref.object?.type;
          return !type || type === "commit";
        })
        .map((ref) => ref.ref?.replace(/^refs\/heads\//, ""))
        .filter((name): name is string => !!name);

      for (const branchName of branchNames) {
        // Skip the base branch itself
        if (branchName === baseBranch) {
          continue;
        }

        // Check if cancelled
        if (signal?.aborted) {
          break;
        }

        try {
          // Fetch detailed branch info using branches/{branch} endpoint
          const branchDetails = await fetchBranchDetails(
            organization,
            repository,
            branchName,
            signal,
          );

          // Skip if no commit SHA
          if (!branchDetails.lastCommitSha) {
            continue;
          }

          // Parse last commit date
          const lastCommitDate = branchDetails.lastCommitDate
            ? new Date(branchDetails.lastCommitDate)
            : null;

          // Check if branch is older than threshold
          if (!lastCommitDate) {
            continue;
          }

          const ageInMs = now.getTime() - lastCommitDate.getTime();
          if (ageInMs < thresholdMs) {
            continue; // Branch is too recent
          }

          // Apply author filter if specified
          const branchAuthor = branchDetails.author;
          if (authorFilter && branchAuthor) {
            // Case-insensitive partial match
            if (
              !branchAuthor.toLowerCase().includes(authorFilter.toLowerCase())
            ) {
              continue;
            }
          }

          // Compare branch with base to check if it's been merged
          try {
            const compareResult = await compareBranches(
              organization,
              repository,
              baseBranch,
              branchName,
              signal,
            );

            // A branch is stale if it's behind the base (behind_by > 0 and ahead_by === 0)
            // This typically means it has been merged
            const isMerged =
              compareResult.ahead_by === 0 && compareResult.behind_by > 0;

            // Also consider branches that are equal (behind_by === 0 and ahead_by === 0)
            // as potentially merged since they match the base
            const isSameAsBase =
              compareResult.ahead_by === 0 && compareResult.behind_by === 0;

            if (isMerged || isSameAsBase) {
              const staleBranch: StaleBranchInfo = {
                repository,
                branchName,
                branchUrl: `https://github.com/${organization}/${repository}/tree/${encodeURIComponent(branchName)}`,
                author: branchAuthor,
                lastCommitDate: branchDetails.lastCommitDate,
                lastCommitSha: branchDetails.lastCommitSha,
                baseBranch,
                aheadBy: compareResult.ahead_by,
                behindBy: compareResult.behind_by,
              };
              staleBranches.push(staleBranch);
              onBranchFound?.(staleBranch);
              // Also update progress to trigger UI re-render with new count
              onProgress?.(
                i + 1,
                repositories.length,
                repository,
                staleBranches.length,
              );
            }
          } catch (error) {
            // If compare fails (e.g., base branch doesn't exist in this repo),
            // we might skip or still consider it based on date alone
            console.warn(
              `Could not compare branch ${branchName} with base ${baseBranch} in ${repository}:`,
              error,
            );
          }
        } catch (error) {
          console.warn(
            `Error fetching branch ${branchName} for ${repository}:`,
            error,
          );
        }

        // Add small delay between branch API calls
        await delay(100);
      }
    } catch (error) {
      console.warn(`Error fetching branches for ${repository}:`, error);
    }

    // Add delay between repositories
    await delay(150);
  }

  return staleBranches;
};
