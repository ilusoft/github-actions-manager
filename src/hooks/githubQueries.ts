import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import { fetchGithubJson, GithubApiError } from "@/lib/github/client";
import { WORKFLOW_RUNS_PAGE_SIZE } from "@/lib/constants";
import {
  fetchRepositoryBranches,
  type RepositoryBranchRequestOptions,
  type RepositoryBranchSummary,
} from "@/lib/github/branches";

interface GithubOrganization {
  login: string;
}

interface GithubRepository {
  name: string;
  full_name: string;
  archived: boolean;
  disabled: boolean;
}

interface GithubWorkflow {
  id: number;
  name: string;
  state: string;
  path: string;
  html_url: string;
}

export interface GithubWorkflowRunHeadCommit {
  message?: string;
  author?: {
    name?: string;
    email?: string;
  };
}

export interface GithubWorkflowRun {
  id: number;
  name?: string;
  display_title?: string;
  status: string;
  conclusion: string | null;
  event?: string;
  workflow_id?: number;
  run_number?: number;
  html_url?: string;
  head_branch?: string;
  head_sha?: string;
  head_commit?: GithubWorkflowRunHeadCommit | null;
  created_at: string;
  updated_at: string;
  run_started_at: string | null;
}

export type WorkflowRunFilters = {
  branch?: string;
  startDate?: string;
  endDate?: string;
  runName?: string;
  excludeNoRuns?: boolean;
};

type WorkflowRunQueryOptions = Pick<WorkflowRunFilters, "branch" | "startDate" | "endDate">;

const normalizeIsoDate = (value?: string) => {
  if (!value) {
    return undefined;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) {
    return undefined;
  }

  return parsed.toISOString();
};

const buildCreatedQuery = (options?: WorkflowRunQueryOptions) => {
  if (!options) {
    return undefined;
  }

  const startIso = normalizeIsoDate(options.startDate);
  const endIso = normalizeIsoDate(options.endDate);

  if (!startIso && !endIso) {
    return undefined;
  }

  if (startIso && endIso) {
    return `${startIso}..${endIso}`;
  }

  if (startIso) {
    return `${startIso}..`;
  }

  return `..${endIso}`;
};

const sortRunsByUpdated = (runs: GithubWorkflowRun[]) =>
  runs
    .slice()
    .sort((a, b) => {
      const aTime = a.updated_at ? new Date(a.updated_at).valueOf() : 0;
      const bTime = b.updated_at ? new Date(b.updated_at).valueOf() : 0;
      return bTime - aTime;
    });

export const fetchWorkflowRuns = async (
  organization: string,
  repository: string,
  workflowId: number,
  perPage = WORKFLOW_RUNS_PAGE_SIZE,
  page = 1,
  options?: WorkflowRunQueryOptions
): Promise<{ runs: GithubWorkflowRun[]; hasMore: boolean }> => {
  const encodedOrg = encodeURIComponent(organization);
  const encodedRepo = encodeURIComponent(repository);

  const params = new URLSearchParams({
    per_page: perPage.toString(),
    page: page.toString(),
  });

  if (options?.branch) {
    params.set("branch", options.branch);
  }

  const createdQuery = buildCreatedQuery(options);
  if (createdQuery) {
    params.set("created", createdQuery);
  }

  const runsResponse = await fetchGithubJson<GithubWorkflowRunsResponse>({
    path: `/repos/${encodedOrg}/${encodedRepo}/actions/workflows/${workflowId}/runs?${params.toString()}`,
  });

  const runs = runsResponse.workflow_runs ?? [];
  const hasMore = runs.length === perPage;

  return { runs, hasMore };
};

export const collectWorkflowRuns = async (
  organization: string,
  repository: string,
  workflowId: number,
  filters?: WorkflowRunFilters,
  perPage = WORKFLOW_RUNS_PAGE_SIZE
): Promise<GithubWorkflowRun[]> => {
  const queryOptions: WorkflowRunQueryOptions = {
    branch: filters?.branch?.trim() || undefined,
    startDate: filters?.startDate,
    endDate: filters?.endDate,
  };

  const runNameQuery = filters?.runName?.trim().toLowerCase() || undefined;

  const { runs } = await fetchWorkflowRuns(
    organization,
    repository,
    workflowId,
    perPage,
    1,
    queryOptions
  );

  const filteredRuns = runNameQuery
    ? runs.filter((run) =>
        (run.display_title || run.name || "")
          .toLowerCase()
          .includes(runNameQuery)
      )
    : runs;

  return sortRunsByUpdated(filteredRuns);
};

interface GithubWorkflowsResponse {
  workflows: GithubWorkflow[];
}

interface GithubWorkflowRunsResponse {
  workflow_runs: GithubWorkflowRun[];
}

export type RepositoryWorkflowSummary = {
  id: number;
  name: string;
  state: string;
  path: string;
  htmlUrl: string;
  latestRun: GithubWorkflowRun | null;
  runs: GithubWorkflowRun[];
};

const organizationsKey = ["github", "viewer", "organizations"];

export const fetchRepositoryWorkflows = async (
  organization: string,
  repository: string,
  filters?: WorkflowRunFilters
): Promise<RepositoryWorkflowSummary[]> => {
  const encodedOrg = encodeURIComponent(organization);
  const encodedRepo = encodeURIComponent(repository);

  const workflowsResponse = await fetchGithubJson<GithubWorkflowsResponse>({
    path: `/repos/${encodedOrg}/${encodedRepo}/actions/workflows?per_page=100`,
  });

  const workflows = workflowsResponse.workflows ?? [];

  const summaries = await Promise.all(
    workflows.map(async (workflow) => {
      try {
        const runs = await collectWorkflowRuns(
          organization,
          repository,
          workflow.id,
          filters
        );

        const hasRunCriteria = Boolean(
          filters?.branch?.trim() ||
            filters?.runName?.trim() ||
            filters?.startDate ||
            filters?.endDate
        );

        if ((filters?.excludeNoRuns || hasRunCriteria) && runs.length === 0) {
          return null;
        }

        const summary: RepositoryWorkflowSummary = {
          id: workflow.id,
          name: workflow.name,
          state: workflow.state,
          path: workflow.path,
          htmlUrl: workflow.html_url,
          latestRun: runs[0] ?? null,
          runs,
        };

        return summary;
      } catch (error) {
        if (error instanceof GithubApiError) {
          if (error.status === 401 || error.status === 403) {
            throw error;
          }
        }

        if (filters?.excludeNoRuns) {
          return null;
        }

        const fallback: RepositoryWorkflowSummary = {
          id: workflow.id,
          name: workflow.name,
          state: workflow.state,
          path: workflow.path,
          htmlUrl: workflow.html_url,
          latestRun: null,
          runs: [],
        };

        return fallback;
      }
    })
  );

  const filteredSummaries = summaries.filter(
    (summary): summary is RepositoryWorkflowSummary => summary !== null
  );

  return filteredSummaries.sort((a, b) => a.name.localeCompare(b.name));
};

export const useViewerOrganizations = (): UseQueryResult<
  string[],
  GithubApiError
> =>
  useQuery({
    queryKey: organizationsKey,
    queryFn: () =>
      fetchGithubJson<GithubOrganization[]>({ path: "/user/orgs?per_page=100" }),
    select: (data) => data.map((org) => org.login).sort((a, b) => a.localeCompare(b)),
    staleTime: 1000 * 60 * 5,
  });

export const useRepositoryWorkflows = (
  organization?: string,
  repository?: string,
  filters?: WorkflowRunFilters
): UseQueryResult<RepositoryWorkflowSummary[], GithubApiError> =>
  useQuery({
    queryKey: [
      "github",
      "org",
      organization,
      "repo",
      repository,
      "workflows",
      filters?.branch ?? "",
      filters?.runName ?? "",
      filters?.startDate ?? "",
      filters?.endDate ?? "",
      filters?.excludeNoRuns ?? false,
    ],
    enabled: Boolean(organization && repository),
    queryFn: () =>
      fetchRepositoryWorkflows(
        organization as string,
        repository as string,
        filters
      ),
    staleTime: 1000 * 60 * 2,
  });

export const useWorkflowRuns = (
  organization?: string,
  repository?: string,
  workflowId?: number,
  enabled = false,
  perPage = WORKFLOW_RUNS_PAGE_SIZE,
  page = 1
): UseQueryResult<{ runs: GithubWorkflowRun[]; hasMore: boolean }, GithubApiError> =>
  useQuery({
    queryKey: [
      "github",
      "org",
      organization,
      "repo",
      repository,
      "workflows",
      workflowId,
      "runs",
      perPage,
      page,
    ],
    enabled: Boolean(enabled && organization && repository && workflowId),
    queryFn: () =>
      fetchWorkflowRuns(
        organization as string,
        repository as string,
        workflowId as number,
        perPage,
        page
      ),
    staleTime: 1000 * 30,
  });

export const useRepositoryBranches = (
  organization?: string,
  repository?: string,
  options?: RepositoryBranchRequestOptions
): UseQueryResult<RepositoryBranchSummary[], GithubApiError> =>
  useQuery({
    queryKey: [
      "github",
      "org",
      organization,
      "repo",
      repository,
      "branches",
      options?.perPage ?? 10,
      options?.limit ?? options?.perPage ?? 10,
      typeof options?.protected === "boolean" ? options.protected : "all",
    ],
    enabled: Boolean(organization && repository),
    queryFn: () =>
      fetchRepositoryBranches(
        organization as string,
        repository as string,
        options
      ),
    staleTime: 1000 * 60,
  });

export const useOrganizationRepositories = (
  organization?: string
): UseQueryResult<GithubRepository[], GithubApiError> =>
  useQuery({
    queryKey: ["github", "org", organization, "repos"],
    enabled: Boolean(organization),
    queryFn: () =>
      fetchGithubJson<GithubRepository[]>({
        path: `/orgs/${organization}/repos?per_page=100`,
      }),
    select: (data) => data.filter((repo) => !repo.archived && !repo.disabled),
    staleTime: 1000 * 60 * 5,
  });
