import { fetchGithubJson } from "@/lib/github/client";

interface CreatePullRequestRequestBody {
  title: string;
  head: string;
  base: string;
  body?: string;
  draft?: boolean;
}

interface CreatePullRequestResponse {
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
  signal?: AbortSignal
): Promise<CreatePullRequestResponse> => {
  const path = `/repos/${organization}/${repository}/pulls`;
  const payload: CreatePullRequestRequestBody = {
    title,
    head,
    base,
    body,
  };

  return fetchGithubJson<CreatePullRequestResponse>({
    path,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    signal,
  });
};
