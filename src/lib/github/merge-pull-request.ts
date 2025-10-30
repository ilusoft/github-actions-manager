import { fetchGithubJson } from "@/lib/github/client";

export type PullRequestMergeMethod = "merge" | "squash" | "rebase";

interface MergePullRequestRequestBody {
  commit_title: string;
  commit_message: string;
  merge_method: PullRequestMergeMethod;
  sha?: string;
}

export interface MergePullRequestSuccess {
  sha: string;
  merged: true;
  message: string;
  documentation_url?: string;
}

interface MergePullRequestFailure {
  message: string;
  documentation_url?: string;
}

export type MergePullRequestResponse = MergePullRequestSuccess | MergePullRequestFailure;

export const mergePullRequest = async (
  organization: string,
  repository: string,
  pullNumber: number,
  options: {
    commitTitle: string;
    commitMessage: string;
    method: PullRequestMergeMethod;
    sha?: string;
    signal?: AbortSignal;
  }
): Promise<MergePullRequestResponse> => {
  const encodedOrg = encodeURIComponent(organization);
  const encodedRepo = encodeURIComponent(repository);

  const payload: MergePullRequestRequestBody = {
    commit_title: options.commitTitle,
    commit_message: options.commitMessage,
    merge_method: options.method,
  };

  if (options.sha) {
    payload.sha = options.sha;
  }

  return fetchGithubJson<MergePullRequestResponse>({
    path: `/repos/${encodedOrg}/${encodedRepo}/pulls/${pullNumber}/merge`,
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    signal: options.signal,
  });
};
