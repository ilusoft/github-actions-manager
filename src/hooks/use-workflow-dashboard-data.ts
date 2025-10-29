import { useMemo } from "react";
import { useQueries, type UseQueryResult } from "@tanstack/react-query";

import type { RepositoryWorkflowSummary } from "@/hooks/githubQueries";
import { fetchRepositoryWorkflows } from "@/hooks/githubQueries";
import { GithubApiError } from "@/lib/github/client";
import type { WorkflowFilters } from "@/types/repository-dashboard";
import type { RepositoryViewMode } from "@/types/repository-dashboard";

interface UseWorkflowDashboardDataParams {
  organization?: string;
  repositories: string[];
  filters: WorkflowFilters;
  viewMode: RepositoryViewMode;
}

interface UseWorkflowDashboardDataResult {
  queries: UseQueryResult<RepositoryWorkflowSummary[], GithubApiError>[];
  isAnyLoading: boolean;
  summariesByRepository: Map<string, RepositoryWorkflowSummary[]>;
  serverFilterOptions: ServerFilterOptions;
}

export interface ServerFilterOptions {
  branch?: string;
  startDate?: string;
  endDate?: string;
  excludeNoRuns: boolean;
}

const STALE_TIME_MS = 1000 * 60 * 2;

export function useWorkflowDashboardData({
  organization,
  repositories,
  filters,
  viewMode,
}: UseWorkflowDashboardDataParams): UseWorkflowDashboardDataResult {
  const serverFilterOptions = useMemo<ServerFilterOptions>(
    () => ({
      branch: filters.branch.trim() || undefined,
      startDate: filters.startDate,
      endDate: filters.endDate,
      excludeNoRuns: filters.excludeNoRuns,
    }),
    [filters.branch, filters.startDate, filters.endDate, filters.excludeNoRuns]
  );

  const queries = useQueries({
    queries: repositories.map((repository) => ({
      queryKey: [
        "github",
        "org",
        organization,
        "repo",
        repository,
        "workflows",
        serverFilterOptions.branch ?? "",
        serverFilterOptions.startDate ?? "",
        serverFilterOptions.endDate ?? "",
        serverFilterOptions.excludeNoRuns ?? false,
      ],
      enabled: Boolean(organization && viewMode === "workflows"),
      queryFn: () => {
        if (!organization) {
          throw new GithubApiError("Missing organization", 400);
        }

        return fetchRepositoryWorkflows(
          organization,
          repository,
          serverFilterOptions
        );
      },
      staleTime: STALE_TIME_MS,
    })),
  });

  const typedQueries = queries as UseQueryResult<
    RepositoryWorkflowSummary[],
    GithubApiError
  >[];

  const isAnyLoading = useMemo(
    () => typedQueries.some((query) => query.isLoading || query.isFetching),
    [typedQueries]
  );

  const summariesByRepository = useMemo(() => {
    const map = new Map<string, RepositoryWorkflowSummary[]>();
    repositories.forEach((repository, index) => {
      const query = typedQueries[index];
      if (query?.data) {
        map.set(repository, query.data);
      }
    });
    return map;
  }, [repositories, typedQueries]);

  return {
    queries: typedQueries,
    isAnyLoading,
    summariesByRepository,
    serverFilterOptions,
  };
}
