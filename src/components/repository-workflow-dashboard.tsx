import { useCallback, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { RepositoryDashboardToolbar } from "@/components/repository-dashboard-toolbar";
import { PullRequestFiltersCard } from "@/components/pull-request-filters-card";
import { RepositoryDashboardPullRequestView } from "@/components/repository-dashboard-pull-request-view";
import { RepositoryDashboardRepositoryView } from "@/components/repository-dashboard-repository-view";
import {
  type WorkflowFilters,
  type RepositoryViewMode,
  type BranchViewSettings,
  type PullRequestViewSettings,
} from "@/types/repository-dashboard";

const areArraysEqual = (left: string[], right: string[]) => {
  if (left === right) {
    return true;
  }

  if (left.length !== right.length) {
    return false;
  }

  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }

  return true;
};

type RepositoryWorkflowDashboardProps = {
  organization?: string;
  repositories: string[];
  onReorder?: (orderedRepositories: string[]) => void;
};

const DASHBOARD_VIEW_STORAGE_KEY = "repository-workflow-dashboard:view-mode";

const isRepositoryViewMode = (
  value: string | null
): value is RepositoryViewMode =>
  value === "workflows" ||
  value === "deployments" ||
  value === "branches" ||
  value === "pullRequests";

export function RepositoryWorkflowDashboard({
  organization,
  repositories,
  onReorder,
}: RepositoryWorkflowDashboardProps) {
  const [order, setOrder] = useState(repositories);
  const [viewMode, setViewMode] = useState<RepositoryViewMode>(() => {
    if (typeof window === "undefined") {
      return "workflows";
    }

    const stored = window.localStorage.getItem(DASHBOARD_VIEW_STORAGE_KEY);
    return isRepositoryViewMode(stored) ? stored : "workflows";
  });
  const queryClient = useQueryClient();
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date>(
    () => new Date()
  );
  const lastRefreshedLabel = useMemo(
    () => lastRefreshedAt.toLocaleString(),
    [lastRefreshedAt]
  );
  const [filters, setFilters] = useState<WorkflowFilters>({
    excludeNoRuns: false,
    branch: "",
    runName: "",
    startDate: undefined,
    endDate: undefined,
  });
  const [debouncedFilters, setDebouncedFilters] = useState<WorkflowFilters>(
    () => ({ ...filters })
  );
  const [branchSettings, setBranchSettings] = useState<BranchViewSettings>(
    () => ({
      visibility: "all",
      perPage: 10,
      limit: 10,
      name: "",
    })
  );
  const [pullRequestSettings, setPullRequestSettings] =
    useState<PullRequestViewSettings>(() => ({
      state: "open",
      perPage: 10,
      base: "",
      author: "",
    }));

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setDebouncedFilters(filters);
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [filters]);

  useEffect(() => {
    setOrder((previous) =>
      areArraysEqual(previous, repositories) ? previous : repositories
    );
  }, [repositories]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(DASHBOARD_VIEW_STORAGE_KEY, viewMode);
  }, [viewMode]);

  const enabledRepositories = useMemo(() => order.filter(Boolean), [order]);
  const runNameFilter = debouncedFilters.runName;

  const handleOrderChange = useCallback(
    (nextOrder: string[], options?: { commit?: boolean }) => {
      if (options?.commit) {
        setOrder(nextOrder);
        if (onReorder && !areArraysEqual(nextOrder, repositories)) {
          onReorder(nextOrder);
        }
        return;
      }

      setOrder(nextOrder);
    },
    [onReorder, repositories]
  );

  const pullRequestQueryOptions = useMemo(() => {
    const base = pullRequestSettings.base.trim();
    const author = pullRequestSettings.author.trim();

    return {
      perPage: pullRequestSettings.perPage,
      state: pullRequestSettings.state,
      base: base || undefined,
      author: author || undefined,
    };
  }, [pullRequestSettings]);
  const pullRequestPerPage = pullRequestQueryOptions.perPage;
  const pullRequestState = pullRequestQueryOptions.state;
  const pullRequestBase = pullRequestQueryOptions.base ?? "";
  const pullRequestAuthor = pullRequestQueryOptions.author ?? "";

  const refreshDashboard = useCallback(() => {
    if (!organization) {
      return;
    }

    const refreshForRepository = (repo: string) => {
      switch (viewMode) {
        case "workflows":
          queryClient.invalidateQueries({
            queryKey: [
              "github",
              "org",
              organization,
              "repo",
              repo,
              "workflows",
            ],
          });
          break;
        case "deployments":
          queryClient.invalidateQueries({
            queryKey: [
              "github",
              "org",
              organization,
              "repo",
              repo,
              "deployments",
              "environments",
            ],
          });
          break;
        case "branches":
          queryClient.invalidateQueries({
            queryKey: [
              "github",
              "org",
              organization,
              "repo",
              repo,
              "branches",
            ],
          });
          break;
        case "pullRequests":
          queryClient.invalidateQueries({
            queryKey: [
              "github",
              "org",
              organization,
              "repo",
              repo,
              "pulls",
              pullRequestPerPage,
              pullRequestState,
              pullRequestBase,
              pullRequestAuthor,
              1,
            ],
          });
          break;
        default:
          break;
      }
    };

    enabledRepositories.forEach(refreshForRepository);
    setLastRefreshedAt(new Date());
  }, [
    organization,
    enabledRepositories,
    viewMode,
    queryClient,
    pullRequestPerPage,
    pullRequestState,
    pullRequestBase,
    pullRequestAuthor,
  ]);

  if (!organization || enabledRepositories.length === 0) {
    return null;
  }

  const headerTitle =
    viewMode === "workflows"
      ? "Repository workflows"
      : viewMode === "deployments"
      ? "Deployment overview"
      : viewMode === "branches"
      ? "Branches overview"
      : "Pull request overview";
  const headerDescription =
    viewMode === "workflows"
      ? "Review workflow health across the selected repositories."
      : viewMode === "deployments"
      ? "Compare latest deployments per environment across the selected repositories."
      : viewMode === "branches"
      ? "Inspect branch activity and latest commits across the selected repositories."
      : "Track pull request activity, status, and authors across the selected repositories.";

  const toolbar = (
    <RepositoryDashboardToolbar
      viewMode={viewMode}
      lastRefreshedLabel={lastRefreshedLabel}
      onViewModeChange={setViewMode}
      onRefresh={refreshDashboard}
      autoRefreshAriaLabel="Toggle auto refresh"
    />
  );

  if (viewMode === "pullRequests") {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold">{headerTitle}</h3>
            <p className="text-sm text-muted-foreground">{headerDescription}</p>
          </div>
          {toolbar}
        </div>
        <PullRequestFiltersCard
          settings={pullRequestSettings}
          onChange={setPullRequestSettings}
        />
        <RepositoryDashboardPullRequestView
          organization={organization}
          repositories={enabledRepositories}
          options={pullRequestQueryOptions}
        />
      </div>
    );
  }

  return (
    <RepositoryDashboardRepositoryView
      organization={organization}
      viewMode={viewMode}
      repositories={enabledRepositories}
      branchSettings={branchSettings}
      filters={filters}
      debouncedFilters={debouncedFilters}
      runNameFilter={runNameFilter}
      headerTitle={headerTitle}
      headerDescription={headerDescription}
      toolbar={toolbar}
      onFiltersChange={setFilters}
      onBranchSettingsChange={setBranchSettings}
      onOrderChange={handleOrderChange}
    />
  );
}
