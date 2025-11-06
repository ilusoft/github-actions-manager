import { memo, useCallback, useRef, useState, type DragEvent } from "react";
import { type UseQueryResult } from "@tanstack/react-query";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { RepositoryDeploymentGrid } from "@/components/repository-deployment-grid";
import { RepositoryBranchTree } from "@/components/repository-branch-tree";
import { filterWorkflowByRunName } from "@/components/workflow-details-dialog";
import { GithubApiError } from "@/lib/github/client";
import type { RepositoryBranchRequestOptions } from "@/lib/github/branches";
import type { RepositoryWorkflowSummary } from "@/hooks/githubQueries";
import type { RepositoryViewMode } from "@/types/repository-dashboard";

const STATUS_CLASSES: Record<WorkflowStatus, string> = {
  never_run: "bg-muted text-muted-foreground",
  running: "bg-amber-500/20 text-amber-700 dark:text-amber-400",
  success: "bg-emerald-500/20 text-emerald-700 dark:text-emerald-400",
  failed: "bg-destructive/20 text-destructive",
  unknown: "bg-muted text-muted-foreground",
};

const WORKFLOW_GRID_CLASSES =
  "grid w-full gap-6 grid-cols-[repeat(auto-fit,minmax(250px,1fr))]";

type WorkflowStatus =
  | "never_run"
  | "running"
  | "success"
  | "failed"
  | "unknown";

interface RepositoryDashboardViewContentProps {
  viewMode: RepositoryViewMode;
  organization: string;
  repositories: string[];
  workflowQueries: UseQueryResult<RepositoryWorkflowSummary[], GithubApiError>[];
  runNameFilter: string;
  onOrderChange: (nextOrder: string[], options?: { commit?: boolean }) => void;
  selectedRepositories: Set<string>;
  onRepositorySelectionChange: (repository: string, checked: boolean) => void;
  branchOptions?: RepositoryBranchRequestOptions;
  branchNameFilter: string;
  selectedBranches: ReadonlyMap<string, Set<string>>;
  onBranchSelectionChange: (
    repository: string,
    branch: string,
    checked: boolean
  ) => void;
  onWorkflowSelect: (workflow: RepositoryWorkflowSummary) => void;
}

const RepositoryDashboardViewContentComponent = ({
  viewMode,
  organization,
  repositories,
  workflowQueries,
  runNameFilter,
  onOrderChange,
  selectedRepositories,
  onRepositorySelectionChange,
  branchOptions,
  branchNameFilter,
  selectedBranches,
  onBranchSelectionChange,
  onWorkflowSelect,
}: RepositoryDashboardViewContentProps) => {
  const [draggingRepository, setDraggingRepository] = useState<string | null>(
    null
  );
  const draggingRef = useRef<string | null>(null);
  const hasPendingReorderRef = useRef(false);

  const handleDragStart = useCallback(
    (repository: string) => (event: DragEvent<HTMLDivElement>) => {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", repository);
      draggingRef.current = repository;
      setDraggingRepository(repository);
    },
    []
  );

  const handleDragEnter = useCallback(
    (targetRepository: string) => (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      const active = draggingRef.current;
      if (!active || active === targetRepository) {
        return;
      }

      const activeIndex = repositories.indexOf(active);
      const targetIndex = repositories.indexOf(targetRepository);
      if (activeIndex === -1 || targetIndex === -1) {
        return;
      }

      const next = [...repositories];
      next.splice(activeIndex, 1);
      next.splice(targetIndex, 0, active);

      let changed = false;
      for (let index = 0; index < next.length; index += 1) {
        if (next[index] !== repositories[index]) {
          changed = true;
          break;
        }
      }

      if (!changed) {
        return;
      }

      hasPendingReorderRef.current = true;
      onOrderChange(next);
    },
    [onOrderChange, repositories]
  );

  const handleDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
  }, []);

  const handleDragEnd = useCallback(() => {
    draggingRef.current = null;
    setDraggingRepository(null);

    if (hasPendingReorderRef.current) {
      hasPendingReorderRef.current = false;
      onOrderChange(repositories, { commit: true });
    }
  }, [onOrderChange, repositories]);

  if (viewMode === "deployments") {
    return (
      <RepositoryDeploymentGrid
        organization={organization}
        repositories={repositories}
        selectedRepositories={selectedRepositories}
        onRepositorySelectionChange={onRepositorySelectionChange}
      />
    );
  }

  if (viewMode === "branches") {
    return (
      <RepositoryBranchTree
        organization={organization}
        repositories={repositories}
        branchOptions={branchOptions}
        nameFilter={branchNameFilter}
        selectedBranches={selectedBranches}
        onBranchSelectionChange={onBranchSelectionChange}
      />
    );
  }

  return (
    <div className={WORKFLOW_GRID_CLASSES}>
      {repositories.map((repository, index) => {
        const query = workflowQueries[index];

        return (
          <Card
            key={repository}
            className={cn(
              "flex h-full cursor-grab flex-col select-none transition-opacity",
              draggingRepository === repository ? "opacity-80" : ""
            )}
            draggable={repositories.length > 1}
            onDragStart={handleDragStart(repository)}
            onDragEnter={handleDragEnter(repository)}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
          >
            <CardHeader className="flex flex-row items-start justify-between gap-3">
              <CardTitle className="truncate" title={repository}>
                <a
                  href={`https://github.com/${organization}/${repository}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary hover:underline"
                >
                  {repository}
                </a>
              </CardTitle>
              <Checkbox
                checked={selectedRepositories.has(repository)}
                onCheckedChange={(checked) =>
                  onRepositorySelectionChange(repository, checked === true)
                }
                aria-label={`Select repository ${repository}`}
              />
            </CardHeader>
            <CardContent className="flex-1">
              {renderWorkflowQueryState(
                query,
                repository,
                runNameFilter,
                onWorkflowSelect
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};

const renderWorkflowQueryState = (
  query: UseQueryResult<RepositoryWorkflowSummary[], GithubApiError> | undefined,
  repository: string,
  runNameFilter: string,
  onSelectWorkflow: (workflow: RepositoryWorkflowSummary) => void
) => {
  if (!query || query.isLoading) {
    return <p className="text-sm text-muted-foreground">Loading workflows…</p>;
  }

  if (query.isError) {
    return (
      <p className="text-sm text-destructive">
        Unable to load workflows for {repository}. Try again later.
      </p>
    );
  }

  const workflows = (query.data ?? [])
    .map((workflow) => filterWorkflowByRunName(workflow, runNameFilter))
    .filter(
      (workflow): workflow is RepositoryWorkflowSummary => workflow !== null
    );

  if (workflows.length === 0) {
    return <p className="text-sm text-muted-foreground">No workflows found.</p>;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {workflows.map((workflow) => (
        <WorkflowPill
          key={workflow.id}
          workflow={workflow}
          onSelect={onSelectWorkflow}
        />
      ))}
    </div>
  );
};

interface WorkflowPillProps {
  workflow: RepositoryWorkflowSummary;
  onSelect: (workflow: RepositoryWorkflowSummary) => void;
}

const WorkflowPill = ({ workflow, onSelect }: WorkflowPillProps) => {
  const status = getWorkflowStatus(workflow);

  return (
    <button
      type="button"
      onClick={() => onSelect(workflow)}
      className={cn(
        "inline-flex max-w-full truncate rounded-full px-3 py-1 text-xs font-medium transition-colors hover:opacity-90",
        STATUS_CLASSES[status]
      )}
    >
      <span className="truncate">{workflow.name}</span>
    </button>
  );
};

const getWorkflowStatus = (
  workflow: RepositoryWorkflowSummary
): WorkflowStatus => {
  const latestRun = workflow.latestRun;

  if (!latestRun) {
    return "never_run";
  }

  const status = latestRun.status?.toLowerCase();
  const conclusion = latestRun.conclusion?.toLowerCase() ?? "";

  if (status === "in_progress" || status === "queued" || status === "waiting") {
    return "running";
  }

  if (conclusion === "success") {
    return "success";
  }

  if (
    ["failure", "timed_out", "cancelled", "action_required"].includes(
      conclusion
    )
  ) {
    return "failed";
  }

  return "unknown";
};

export const RepositoryDashboardViewContent = memo(
  RepositoryDashboardViewContentComponent
);
