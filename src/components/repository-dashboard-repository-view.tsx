import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import { useQueryClient } from "@tanstack/react-query";

import { RepositoryDashboardViewContent } from "@/components/repository-dashboard-view-content";
import { WorkflowDetailsDialog } from "@/components/workflow-details-dialog";
import {
  BulkWorkflowRunDialog,
  type BulkWorkflowOption,
} from "@/components/bulk-workflow-run-dialog";
import {
  RepositoryDashboardBulkActionsFooter,
  type RepositoryBulkAction,
} from "@/components/repository-dashboard-bulk-actions-footer";
import { BulkPrDialog } from "@/components/bulk-pr-dialog";
import { BulkBranchDialog } from "@/components/bulk-branch-dialog";
import {
  BulkBranchDeleteDialog,
  type BranchDeletionTarget,
  type BulkBranchDeleteResult,
} from "@/components/bulk-branch-delete-dialog";
import { RepositoryDashboardBranchFooter } from "@/components/repository-dashboard-branch-footer";
import { WorkflowFiltersCard } from "@/components/workflow-filters-card";
import { BranchSettingsCard } from "@/components/branch-settings-card";
import { StaleBranchSearchDialog } from "@/components/stale-branch-search-dialog";
import {
  type BranchViewSettings,
  type RepositoryViewMode,
  type WorkflowFilters,
} from "@/types/repository-dashboard";
import { useRepositorySelection } from "@/hooks/use-repository-selection";
import { useBranchSelection } from "@/hooks/use-branch-selection";
import { useWorkflowDashboardData } from "@/hooks/use-workflow-dashboard-data";
import type { RepositoryWorkflowSummary } from "@/hooks/githubQueries";

interface RepositoryDashboardRepositoryViewProps {
  organization: string;
  viewMode: RepositoryViewMode;
  repositories: string[];
  branchSettings: BranchViewSettings;
  filters: WorkflowFilters;
  debouncedFilters: WorkflowFilters;
  runNameFilter: string;
  headerTitle: string;
  headerDescription: string;
  toolbar: ReactNode;
  onFiltersChange: Dispatch<SetStateAction<WorkflowFilters>>;
  onBranchSettingsChange: Dispatch<SetStateAction<BranchViewSettings>>;
  onWorkflowSelect?: (workflow: RepositoryWorkflowSummary | null) => void;
  onOrderChange: (nextOrder: string[], options?: { commit?: boolean }) => void;
}

const RepositoryDashboardRepositoryViewComponent = ({
  organization,
  viewMode,
  repositories,
  branchSettings,
  filters,
  debouncedFilters,
  runNameFilter,
  headerTitle,
  headerDescription,
  toolbar,
  onFiltersChange,
  onBranchSettingsChange,
  onWorkflowSelect,
  onOrderChange,
}: RepositoryDashboardRepositoryViewProps) => {
  const queryClient = useQueryClient();
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
  const [bulkWorkflowState, setBulkWorkflowState] = useState<{
    workflows: BulkWorkflowOption[];
    error: string | null;
  }>({ workflows: [], error: null });
  const [isBulkBranchDialogOpen, setIsBulkBranchDialogOpen] = useState(false);
  const [isBulkBranchDeleteDialogOpen, setIsBulkBranchDeleteDialogOpen] =
    useState(false);
  const [isBulkPrDialogOpen, setIsBulkPrDialogOpen] = useState(false);
  const [isBulkWorkflowDialogOpen, setIsBulkWorkflowDialogOpen] =
    useState(false);
  const [isStaleBranchSearchDialogOpen, setIsStaleBranchSearchDialogOpen] =
    useState(false);
  const [activeWorkflow, setActiveWorkflow] =
    useState<RepositoryWorkflowSummary | null>(null);

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

  const {
    queries: workflowQueries,
    isAnyLoading: isAnyWorkflowLoading,
    summariesByRepository: workflowSummariesByRepo,
  } = useWorkflowDashboardData({
    organization,
    repositories,
    filters: debouncedFilters,
    viewMode,
  });

  useEffect(() => {
    ensureSelectionWithinRepositories(repositories);
  }, [ensureSelectionWithinRepositories, repositories]);

  useEffect(() => {
    if (viewMode !== "branches") {
      clearSelectedBranches();
    }
  }, [viewMode, clearSelectedBranches]);

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
        const { workflows, error } = createBulkWorkflowOptions(
          selected,
          workflowSummariesByRepo,
        );

        setBulkWorkflowState({ workflows, error });
        setIsBulkWorkflowDialogOpen(true);
        return;
      }
    },
    [selectedRepositories, workflowSummariesByRepo],
  );

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
        result.deleted.map((entry: BranchDeletionTarget) => entry.repository),
      );

      reposToRefresh.forEach((repo) => {
        queryClient.invalidateQueries({
          queryKey: ["github", "org", organization, "repo", repo, "branches"],
        });
      });
    },
    [organization, queryClient, handleBranchSelectionChange],
  );

  const handleWorkflowSelect = useCallback(
    (workflow: RepositoryWorkflowSummary) => {
      setActiveWorkflow(workflow);
      onWorkflowSelect?.(workflow);
    },
    [onWorkflowSelect],
  );

  const handleWorkflowDialogClose = useCallback(() => {
    setActiveWorkflow(null);
    onWorkflowSelect?.(null);
  }, [onWorkflowSelect]);

  // Handler for stale branch search completion
  const handleStaleBranchSearchComplete = useCallback(
    (_result: {
      branches: Array<{
        repository: string;
        branchName: string;
        branchUrl?: string;
        author?: string;
        lastCommitDate?: string;
        lastCommitSha?: string;
        baseBranch?: string;
        aheadBy?: number;
        behindBy?: number;
      }>;
    }) => {
      // Deletion is now handled within the stale branch search dialog
      // No need to auto-select branches or store found branches in settings
    },
    [],
  );

  return (
    <>
      <WorkflowDetailsDialog
        workflow={activeWorkflow}
        runNameFilter={runNameFilter}
        onOpenChange={(open) => {
          if (!open) {
            handleWorkflowDialogClose();
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
        organization={organization}
        repositories={selectedRepositoriesArray}
        workflows={bulkWorkflowState.workflows}
        open={isBulkWorkflowDialogOpen}
        onOpenChange={setIsBulkWorkflowDialogOpen}
        isLoadingWorkflows={isAnyWorkflowLoading}
        loadError={bulkWorkflowState.error}
      />
      <StaleBranchSearchDialog
        organization={organization}
        repositories={repositories}
        open={isStaleBranchSearchDialogOpen}
        onOpenChange={setIsStaleBranchSearchDialogOpen}
        onSearchComplete={handleStaleBranchSearchComplete}
      />
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold">{headerTitle}</h3>
            <p className="text-sm text-muted-foreground">{headerDescription}</p>
          </div>
          {toolbar}
        </div>
        {viewMode === "workflows" ? (
          <WorkflowFiltersCard filters={filters} onChange={onFiltersChange} />
        ) : null}
        {viewMode === "branches" ? (
          <BranchSettingsCard
            settings={branchSettings}
            onChange={onBranchSettingsChange}
            onSearchStaleBranches={() => setIsStaleBranchSearchDialogOpen(true)}
          />
        ) : null}
        <RepositoryDashboardViewContent
          viewMode={viewMode}
          organization={organization}
          repositories={repositories}
          workflowQueries={workflowQueries}
          runNameFilter={runNameFilter}
          onOrderChange={onOrderChange}
          selectedRepositories={selectedRepositories}
          onRepositorySelectionChange={handleRepositorySelectionChange}
          branchOptions={branchQueryOptions}
          branchNameFilter={branchNameFilter}
          selectedBranches={selectedBranchesMap}
          onBranchSelectionChange={handleBranchSelectionChange}
          onWorkflowSelect={handleWorkflowSelect}
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
    </>
  );
};

function createBulkWorkflowOptions(
  selected: string[],
  summariesByRepository: Map<string, RepositoryWorkflowSummary[]>,
): { workflows: BulkWorkflowOption[]; error: string | null } {
  const options: BulkWorkflowOption[] = [];

  let hasMissingData = false;

  selected.forEach((repo) => {
    const workflows = summariesByRepository.get(repo);

    if (!workflows) {
      hasMissingData = true;
      return;
    }

    workflows.forEach((workflow) => {
      options.push({
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

  const sorted = options.sort((a, b) => a.name.localeCompare(b.name));

  return {
    workflows: sorted,
    error: hasMissingData
      ? "Workflows are still loading for some repositories. Please wait and try again."
      : sorted.length === 0
        ? "No workflows were found in the selected repositories."
        : null,
  };
}

export const RepositoryDashboardRepositoryView = memo(
  RepositoryDashboardRepositoryViewComponent,
);
