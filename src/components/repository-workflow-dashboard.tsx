import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import { useQueryClient } from "@tanstack/react-query";

import { BulkBranchDialog } from "@/components/bulk-branch-dialog";
import {
  BulkBranchDeleteDialog,
  type BranchDeletionTarget,
  type BulkBranchDeleteResult,
} from "@/components/bulk-branch-delete-dialog";
import { BulkPrDialog } from "@/components/bulk-pr-dialog";
import {
  BulkWorkflowRunDialog,
  type BulkWorkflowOption,
} from "@/components/bulk-workflow-run-dialog";
import { WorkflowDetailsDialog } from "@/components/workflow-details-dialog";
import { RepositoryDashboardToolbar } from "@/components/repository-dashboard-toolbar";
import {
  RepositoryDashboardPullRequestFooter,
} from "@/components/repository-dashboard-pull-request-footer";
import type { PullRequestBulkAction } from "@/components/repository-dashboard-pull-request-footer";
import { WorkflowFiltersCard } from "@/components/workflow-filters-card";
import { BranchSettingsCard } from "@/components/branch-settings-card";
import { PullRequestFiltersCard } from "@/components/pull-request-filters-card";
import { RepositoryDashboardViewContent } from "@/components/repository-dashboard-view-content";
import { RepositoryDashboardBulkActionsFooter } from "@/components/repository-dashboard-bulk-actions-footer";
import type { RepositoryBulkAction } from "@/components/repository-dashboard-bulk-actions-footer";
import { RepositoryDashboardBranchFooter } from "@/components/repository-dashboard-branch-footer";
import {
  type WorkflowFilters,
  type RepositoryViewMode,
  type BranchViewSettings,
  type PullRequestViewSettings,
} from "@/types/repository-dashboard";
import {
  useWorkflowDashboardData,
} from "@/hooks/use-workflow-dashboard-data";
import { type RepositoryWorkflowSummary } from "@/hooks/githubQueries";
import { useBranchSelection } from "@/hooks/use-branch-selection";
import { useRepositorySelection } from "@/hooks/use-repository-selection";
import { usePullRequestSelection } from "@/hooks/use-pull-request-selection";
import { BulkPullRequestMergeDialog } from "@/components/bulk-pull-request-merge-dialog";
import {
  BulkPRReviewDialog,
  type ReviewProgressEntry,
} from "@/components/bulk-pr-review-dialog";

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
  const [dragging, setDragging] = useState<string | null>(null);
  const draggingRef = useRef<string | null>(null);
  const queryClient = useQueryClient();
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date>(
    () => new Date()
  );
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(false);
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
  const {
    selectedRepositories,
    selectedRepositoriesArray,
    handleRepositorySelectionChange,
    clearSelection: clearSelectedRepositories,
  } = useRepositorySelection();
  const {
    selectedBranches: selectedBranchesMap,
    selectedEntries: selectedBranchEntries,
    selectedCount: selectedBranchCount,
    handleBranchSelectionChange,
    clearSelectedBranches,
    ensureSelectionWithinRepositories,
  } = useBranchSelection();
  const {
    selectedEntries: selectedPullRequestEntries,
    selectedCount: selectedPullRequestCount,
    selectedIdsByRepository: selectedPullRequestIds,
    handlePullRequestSelectionChange,
    clearSelectedPullRequests,
    ensureSelectionWithinRepositories: ensurePullRequestSelectionWithinRepositories,
  } = usePullRequestSelection();
  const [isBulkBranchDialogOpen, setIsBulkBranchDialogOpen] = useState(false);
  const [isBulkBranchDeleteDialogOpen, setIsBulkBranchDeleteDialogOpen] =
    useState(false);
  const [isBulkPrDialogOpen, setIsBulkPrDialogOpen] = useState(false);
  const [isBulkWorkflowDialogOpen, setIsBulkWorkflowDialogOpen] =
    useState(false);
  const [isBulkPrMergeDialogOpen, setIsBulkPrMergeDialogOpen] =
    useState(false);
  const [isBulkPrReviewDialogOpen, setIsBulkPrReviewDialogOpen] =
    useState(false);
  const [bulkWorkflowOptions, setBulkWorkflowOptions] = useState<
    BulkWorkflowOption[]
  >([]);
  const [bulkWorkflowError, setBulkWorkflowError] = useState<string | null>(
    null
  );
  const [activeWorkflow, setActiveWorkflow] = useState<
    RepositoryWorkflowSummary | null
  >(null);
  
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

  const {
    queries: workflowQueries,
    isAnyLoading: isAnyWorkflowLoading,
    summariesByRepository: workflowSummariesByRepo,
  } = useWorkflowDashboardData({
    organization,
    repositories: enabledRepositories,
    filters: debouncedFilters,
    viewMode,
  });

  const handleBulkActionSelect = useCallback(
    (action: RepositoryBulkAction) => {
      if (selectedRepositories.size === 0) {
        return;
      }

      if (action === "create-branch") {
        setIsBulkBranchDialogOpen(true);
        return;
      }

      if (action === "create-pr") {
        setIsBulkPrDialogOpen(true);
        return;
      }

      if (action === "run-workflow") {
        const selected = Array.from(selectedRepositories);

        const missingData = selected.some(
          (repo) => !workflowSummariesByRepo.has(repo)
        );
        if (missingData) {
          setBulkWorkflowOptions([]);
          setBulkWorkflowError(
            "Workflows are still loading for some repositories. Please wait and try again."
          );
          setIsBulkWorkflowDialogOpen(true);
          return;
        }

        const allWorkflows: BulkWorkflowOption[] = [];

        selected.forEach((repo) => {
          const workflows = workflowSummariesByRepo.get(repo) ?? [];
          workflows.forEach((workflow: RepositoryWorkflowSummary) => {
            allWorkflows.push({
              name: `${repo} - ${workflow.name}`,
              repositories: [
                {
                  repository: repo,
                  workflowId: workflow.id,
                  workflowPath: workflow.path,
                  workflowHtmlUrl: workflow.htmlUrl,
                },
              ],
            });
          });
        });

        const sortedWorkflows = allWorkflows.sort((a, b) => 
          a.name.localeCompare(b.name)
        );

        setBulkWorkflowOptions(sortedWorkflows);
        setBulkWorkflowError(
          sortedWorkflows.length === 0
            ? "No workflows were found in the selected repositories."
            : null
        );
        setIsBulkWorkflowDialogOpen(true);
      }
    },
    [selectedRepositories, workflowSummariesByRepo]
  );

  const handleDragStart = useCallback(
    (repository: string) => (event: React.DragEvent<HTMLDivElement>) => {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", repository);
      draggingRef.current = repository;
      setDragging(repository);
    },
    []
  );

  const handleDragEnter = useCallback(
    (targetRepository: string) => (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      const active = draggingRef.current;
      if (!active || active === targetRepository) {
        return;
      }

      setOrder((previous) => {
        const activeIndex = previous.indexOf(active);
        const targetIndex = previous.indexOf(targetRepository);

        if (activeIndex === -1 || targetIndex === -1) {
          return previous;
        }

        const next = [...previous];
        next.splice(activeIndex, 1);
        next.splice(targetIndex, 0, active);

        return areArraysEqual(previous, next) ? previous : next;
      });
    },
    []
  );

  const handleDragOver = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
    },
    []
  );

  const handleDragEnd = useCallback(() => {
    draggingRef.current = null;
    setDragging(null);

    if (!onReorder) {
      return;
    }

    if (!areArraysEqual(order, repositories)) {
      onReorder(order);
    }
  }, [onReorder, order, repositories]);

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

  const branchQueryOptions = useMemo(() => {
    const protectedFilter =
      branchSettings.visibility === "protected"
        ? true
        : branchSettings.visibility === "unprotected"
        ? false
        : undefined;

    return {
      perPage: branchSettings.perPage,
      limit: branchSettings.limit,
      protected: protectedFilter,
    };
  }, [branchSettings]);

  const branchNameFilter = branchSettings.name.trim();
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
  useEffect(() => {
    if (viewMode !== "branches") {
      clearSelectedBranches();
    }
  }, [viewMode, clearSelectedBranches]);

  useEffect(() => {
    if (viewMode !== "pullRequests") {
      clearSelectedPullRequests();
      setIsBulkPrMergeDialogOpen(false);
    }
  }, [viewMode, clearSelectedPullRequests]);

  useEffect(() => {
    ensureSelectionWithinRepositories(enabledRepositories);
    ensurePullRequestSelectionWithinRepositories(enabledRepositories);
  }, [
    enabledRepositories,
    ensureSelectionWithinRepositories,
    ensurePullRequestSelectionWithinRepositories,
  ]);

  const handleBranchDeleteResult = useCallback(
    (result: BulkBranchDeleteResult) => {
      if (result.deleted.length === 0) {
        return;
      }

      result.deleted.forEach(({ repository, branch }) => {
        handleBranchSelectionChange(repository, branch, false);
      });

      if (!organization) {
        return;
      }

      const reposToRefresh = new Set(
        result.deleted.map((entry: BranchDeletionTarget) => entry.repository)
      );

      reposToRefresh.forEach((repo) => {
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
      });
    },
    [organization, queryClient, handleBranchSelectionChange]
  );

  const clampPageSize = useCallback((value: number) => {
    return Math.min(Math.max(value, 1), 100);
  }, []);

  const handleBranchNumericChange = useCallback(
    (field: "perPage" | "limit") => (event: ChangeEvent<HTMLInputElement>) => {
      const raw = Number.parseInt(event.target.value, 10);
      if (Number.isNaN(raw)) {
        return;
      }

      setBranchSettings((previous) => ({
        ...previous,
        [field]: clampPageSize(raw),
      }));
    },
    [clampPageSize]
  );

  const handlePullRequestPerPageChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const raw = Number.parseInt(event.target.value, 10);
      if (Number.isNaN(raw)) {
        return;
      }

      setPullRequestSettings((previous) => ({
        ...previous,
        perPage: clampPageSize(raw),
      }));
    },
    [clampPageSize]
  );

  const handleRefresh = useCallback(() => {
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

  useEffect(() => {
    if (!autoRefreshEnabled) {
      return undefined;
    }

    handleRefresh();

    const intervalId = window.setInterval(() => {
      handleRefresh();
    }, 60_000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [autoRefreshEnabled, handleRefresh]);

  const handlePullRequestMergeCompleted = useCallback(() => {
    if (!organization) {
      return;
    }

    const repositoriesToRefresh = new Set(
      selectedPullRequestEntries.map((entry) => entry.repository)
    );

    repositoriesToRefresh.forEach((repo) => {
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
    });

    clearSelectedPullRequests();
    setIsBulkPrMergeDialogOpen(false);
  }, [
    organization,
    pullRequestAuthor,
    pullRequestBase,
    pullRequestPerPage,
    pullRequestState,
    queryClient,
    selectedPullRequestEntries,
    clearSelectedPullRequests,
  ]);

  const handlePullRequestReviewCompleted = useCallback(
    (results: ReviewProgressEntry[]) => {
      if (!organization) {
        return;
      }

      const repositoriesToRefresh = new Set(
        results
          .filter((entry) => entry.status !== "idle")
          .map((entry) => entry.repository)
      );

      repositoriesToRefresh.forEach((repo) => {
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
      });

      clearSelectedPullRequests();
      setIsBulkPrReviewDialogOpen(false);
    },
    [
      organization,
      pullRequestAuthor,
      pullRequestBase,
      pullRequestPerPage,
      pullRequestState,
      queryClient,
      clearSelectedPullRequests,
    ]
  );

  const handlePullRequestBulkAction = useCallback(
    (action: PullRequestBulkAction) => {
      if (!organization || selectedPullRequestEntries.length === 0) {
        return;
      }

      if (action === "merge") {
        setIsBulkPrMergeDialogOpen(true);
        return;
      }

      if (action === "review") {
        setIsBulkPrReviewDialogOpen(true);
      }
    },
    [organization, selectedPullRequestEntries.length]
  );

  if (!organization || enabledRepositories.length === 0) {
    return null;
  }

  return (
    <>
      <BulkPullRequestMergeDialog
        organization={organization ?? ""}
        pullRequests={selectedPullRequestEntries}
        open={isBulkPrMergeDialogOpen}
        onOpenChange={setIsBulkPrMergeDialogOpen}
        onCompleted={handlePullRequestMergeCompleted}
      />
      <BulkPRReviewDialog
        organization={organization ?? ""}
        selectedPullRequests={selectedPullRequestEntries}
        open={isBulkPrReviewDialogOpen}
        onOpenChange={setIsBulkPrReviewDialogOpen}
        onCompleted={handlePullRequestReviewCompleted}
      />
      <WorkflowDetailsDialog
        workflow={activeWorkflow}
        runNameFilter={runNameFilter}
        onOpenChange={(open) => {
          if (!open) {
            setActiveWorkflow(null);
          }
        }}
      />
      <BulkBranchDialog
        organization={organization}
        repositories={selectedRepositoriesArray}
        open={isBulkBranchDialogOpen}
        onOpenChange={setIsBulkBranchDialogOpen}
      />
      <BulkBranchDeleteDialog
        organization={organization}
        branches={selectedBranchEntries}
        open={isBulkBranchDeleteDialogOpen}
        onOpenChange={setIsBulkBranchDeleteDialogOpen}
        onCompleted={handleBranchDeleteResult}
      />
      <BulkPrDialog
        organization={organization}
        repositories={selectedRepositoriesArray}
        open={isBulkPrDialogOpen}
        onOpenChange={setIsBulkPrDialogOpen}
      />
      <BulkWorkflowRunDialog
        organization={organization ?? ""}
        repositories={selectedRepositoriesArray}
        workflows={bulkWorkflowOptions}
        open={isBulkWorkflowDialogOpen}
        onOpenChange={setIsBulkWorkflowDialogOpen}
        isLoadingWorkflows={isAnyWorkflowLoading}
        loadError={bulkWorkflowError}
      />
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold">{headerTitle}</h3>
            <p className="text-sm text-muted-foreground">{headerDescription}</p>
          </div>
          <RepositoryDashboardToolbar
            viewMode={viewMode}
            lastRefreshedLabel={lastRefreshedLabel}
            onViewModeChange={setViewMode}
            autoRefreshEnabled={autoRefreshEnabled}
            onAutoRefreshToggle={setAutoRefreshEnabled}
            autoRefreshAriaLabel="Toggle auto refresh"
          />
        </div>
        {viewMode === "workflows" ? (
          <WorkflowFiltersCard filters={filters} onChange={setFilters} />
        ) : null}
        {viewMode === "branches" ? (
          <BranchSettingsCard
            settings={branchSettings}
            onChange={setBranchSettings}
            onNumericChange={handleBranchNumericChange}
          />
        ) : null}
        {viewMode === "pullRequests" ? (
          <PullRequestFiltersCard
            settings={pullRequestSettings}
            onChange={setPullRequestSettings}
            onPerPageChange={handlePullRequestPerPageChange}
          />
        ) : null}
        <RepositoryDashboardViewContent
          viewMode={viewMode}
          organization={organization}
          repositories={enabledRepositories}
          workflowQueries={workflowQueries}
          runNameFilter={runNameFilter}
          draggingRepository={dragging}
          onDragStart={handleDragStart}
          onDragEnter={handleDragEnter}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
          selectedRepositories={selectedRepositories}
          onRepositorySelectionChange={handleRepositorySelectionChange}
          branchOptions={branchQueryOptions}
          branchNameFilter={branchNameFilter}
          selectedBranches={selectedBranchesMap}
          onBranchSelectionChange={handleBranchSelectionChange}
          pullRequestOptions={pullRequestQueryOptions}
          onWorkflowSelect={setActiveWorkflow}
          selectedPullRequestIds={selectedPullRequestIds}
          onPullRequestSelectionChange={handlePullRequestSelectionChange}
        />
      </div>
      {viewMode !== "branches" && viewMode !== "pullRequests" ? (
        <RepositoryDashboardBulkActionsFooter
          count={selectedRepositories.size}
          onSelectAction={handleBulkActionSelect}
          onClearSelection={clearSelectedRepositories}
        />
      ) : null}
      {viewMode === "branches" ? (
        <RepositoryDashboardBranchFooter
          count={selectedBranchCount}
          onClearSelection={clearSelectedBranches}
          onDeleteSelected={() => setIsBulkBranchDeleteDialogOpen(true)}
        />
      ) : null}
      {viewMode === "pullRequests" ? (
        <RepositoryDashboardPullRequestFooter
          count={selectedPullRequestCount}
          onSelectAction={handlePullRequestBulkAction}
          onClearSelection={clearSelectedPullRequests}
          disabled={!organization || selectedPullRequestCount === 0}
        />
      ) : null}
      <BulkBranchDialog
        organization={organization ?? ""}
        repositories={selectedRepositoriesArray}
        open={isBulkBranchDialogOpen}
        onOpenChange={setIsBulkBranchDialogOpen}
      />
    </>
  );
}
