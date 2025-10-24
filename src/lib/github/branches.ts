import { fetchGithubJson, GithubApiError } from "@/lib/github/client";

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
