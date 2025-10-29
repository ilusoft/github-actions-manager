import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import {
  useQueries,
  useQueryClient,
  type UseQueryResult,
} from "@tanstack/react-query";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  fetchRepositoryWorkflows,
  type RepositoryWorkflowSummary,
} from "@/hooks/githubQueries";
import { GithubApiError } from "@/lib/github/client";
import { RefreshCwIcon } from "lucide-react";
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
import {
  WorkflowDetailsDialog,
  filterWorkflowByRunName,
} from "@/components/workflow-details-dialog";
import { RepositoryDeploymentGrid } from "@/components/repository-deployment-grid";
import { RepositoryBranchTree } from "@/components/repository-branch-tree";

const STATUS_CLASSES: Record<WorkflowStatus, string> = {
  never_run: "bg-muted text-muted-foreground",
  running: "bg-amber-500/20 text-amber-700 dark:text-amber-400",
  success: "bg-emerald-500/20 text-emerald-700 dark:text-emerald-400",
  failed: "bg-destructive/20 text-destructive",
  unknown: "bg-muted text-muted-foreground",
};

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

type WorkflowStatus =
  | "never_run"
  | "running"
  | "success"
  | "failed"
  | "unknown";

type RepositoryWorkflowDashboardProps = {
  organization?: string;
  repositories: string[];
  onReorder?: (orderedRepositories: string[]) => void;
};

type WorkflowFilters = {
  excludeNoRuns: boolean;
  branch: string;
  runName: string;
  startDate?: string;
  endDate?: string;
};

type BranchViewSettings = {
  visibility: "all" | "protected" | "unprotected";
  perPage: number;
  limit: number;
  name: string;
};

export function RepositoryWorkflowDashboard({
  organization,
  repositories,
  onReorder,
}: RepositoryWorkflowDashboardProps) {
  const [order, setOrder] = useState(repositories);
  const [viewMode, setViewMode] = useState<
    "workflows" | "deployments" | "branches"
  >("workflows");
  const [dragging, setDragging] = useState<string | null>(null);
  const draggingRef = useRef<string | null>(null);
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
  const [selectedRepositories, setSelectedRepositories] = useState<Set<string>>(
    () => new Set()
  );
  const [selectedBranchesMap, setSelectedBranchesMap] = useState<
    Map<string, Set<string>>
  >(() => new Map());
  const [isBulkBranchDialogOpen, setIsBulkBranchDialogOpen] = useState(false);
  const [isBulkBranchDeleteDialogOpen, setIsBulkBranchDeleteDialogOpen] =
    useState(false);
  const [isBulkPrDialogOpen, setIsBulkPrDialogOpen] = useState(false);
  const [isBulkWorkflowDialogOpen, setIsBulkWorkflowDialogOpen] =
    useState(false);
  const [bulkWorkflowOptions, setBulkWorkflowOptions] = useState<
    BulkWorkflowOption[]
  >([]);
  const [bulkWorkflowError, setBulkWorkflowError] = useState<string | null>(
    null
  );
  const [activeWorkflow, setActiveWorkflow] =
    useState<RepositoryWorkflowSummary | null>(null);
  const handleWorkflowDialogChange = useCallback((open: boolean) => {
    if (!open) {
      setBulkWorkflowOptions([]);
      setBulkWorkflowError(null);
    }

    setIsBulkWorkflowDialogOpen(open);
  }, []);

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

  const enabledRepositories = useMemo(() => order.filter(Boolean), [order]);
  const serverFilterOptions = useMemo(
    () => ({
      branch: debouncedFilters.branch.trim() || undefined,
      startDate: debouncedFilters.startDate,
      endDate: debouncedFilters.endDate,
      excludeNoRuns: debouncedFilters.excludeNoRuns,
    }),
    [
      debouncedFilters.branch,
      debouncedFilters.startDate,
      debouncedFilters.endDate,
      debouncedFilters.excludeNoRuns,
    ]
  );
  const runNameFilter = debouncedFilters.runName;
  const selectedRepositoriesArray = useMemo(
    () => Array.from(selectedRepositories),
    [selectedRepositories]
  );
  const selectedBranchCount = useMemo(() => {
    let count = 0;
    selectedBranchesMap.forEach((branches) => {
      count += branches.size;
    });
    return count;
  }, [selectedBranchesMap]);
  const selectedBranchEntries = useMemo<BranchDeletionTarget[]>(() => {
    const entries: BranchDeletionTarget[] = [];
    selectedBranchesMap.forEach((branches, repository) => {
      branches.forEach((branch) => {
        entries.push({ repository, branch });
      });
    });
    return entries.sort((a, b) => {
      if (a.repository === b.repository) {
        return a.branch.localeCompare(b.branch);
      }
      return a.repository.localeCompare(b.repository);
    });
  }, [selectedBranchesMap]);

  const workflowQueries = useQueries({
    queries: enabledRepositories.map((repository) => ({
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
      enabled: Boolean(organization),
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
      staleTime: 1000 * 60 * 2,
    })),
  }) as UseQueryResult<RepositoryWorkflowSummary[], GithubApiError>[];

  const isAnyWorkflowLoading = useMemo(
    () => workflowQueries.some((query) => query.isLoading || query.isFetching),
    [workflowQueries]
  );

  const workflowSummariesByRepo = useMemo(() => {
    const result = new Map<string, RepositoryWorkflowSummary[]>();
    enabledRepositories.forEach((repository, index) => {
      const query = workflowQueries[index];
      if (query?.data) {
        result.set(repository, query.data);
      }
    });
    return result;
  }, [enabledRepositories, workflowQueries]);

  const handleBulkActionSelect = useCallback(
    (action: string) => {
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

        const workflowCounts = new Map<
          string,
          {
            name: string;
            repos: number;
            details: BulkWorkflowOption["repositories"];
          }
        >();

        selected.forEach((repo) => {
          const workflows = workflowSummariesByRepo.get(repo) ?? [];
          workflows.forEach((workflow: RepositoryWorkflowSummary) => {
            const key = `${workflow.name}__${workflow.path}`;
            const current = workflowCounts.get(key);
            if (current) {
              current.repos += 1;
              current.details.push({
                repository: repo,
                workflowId: workflow.id,
                workflowPath: workflow.path,
                workflowHtmlUrl: workflow.htmlUrl,
              });
            } else {
              workflowCounts.set(key, {
                name: workflow.name,
                repos: 1,
                details: [
                  {
                    repository: repo,
                    workflowId: workflow.id,
                    workflowPath: workflow.path,
                    workflowHtmlUrl: workflow.htmlUrl,
                  },
                ],
              });
            }
          });
        });

        const intersecting: BulkWorkflowOption[] = Array.from(
          workflowCounts.entries()
        )
          .filter(([, value]) => value.repos === selected.length)
          .map(([, value]) => ({
            name: value.name,
            repositories: value.details,
          }))
          .sort((a, b) => a.name.localeCompare(b.name));

        setBulkWorkflowOptions(intersecting);
        setBulkWorkflowError(
          intersecting.length === 0
            ? "No common workflows were found across the selected repositories."
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

  const handleRepositorySelectionChange = useCallback(
    (repository: string, checked: boolean) => {
      setSelectedRepositories((previous) => {
        const next = new Set(previous);
        if (checked) {
          next.add(repository);
        } else {
          next.delete(repository);
        }
        return next;
      });
    },
    []
  );

  const handleBranchSelectionChange = useCallback(
    (repository: string, branch: string, checked: boolean) => {
      setSelectedBranchesMap((previous) => {
        const current = previous.get(repository);
        const hasBranch = current?.has(branch) ?? false;

        if (checked) {
          if (hasBranch) {
            return previous;
          }

          const next = new Map(previous);
          const nextSet = new Set(current ?? []);
          nextSet.add(branch);
          next.set(repository, nextSet);
          return next;
        }

        if (!hasBranch) {
          return previous;
        }

        const next = new Map(previous);
        const nextSet = new Set(current);
        nextSet.delete(branch);

        if (nextSet.size > 0) {
          next.set(repository, nextSet);
        } else {
          next.delete(repository);
        }

        return next;
      });
    },
    []
  );

  const clearSelectedBranches = useCallback(() => {
    setSelectedBranchesMap((previous) =>
      previous.size === 0 ? previous : new Map()
    );
  }, []);

  const headerTitle =
    viewMode === "workflows"
      ? "Repository workflows"
      : viewMode === "deployments"
      ? "Deployment overview"
      : "Branches overview";
  const headerDescription =
    viewMode === "workflows"
      ? "Review workflow health across the selected repositories."
      : viewMode === "deployments"
      ? "Compare latest deployments per environment across the selected repositories."
      : "Inspect branch activity and latest commits across the selected repositories.";

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
  const showWorkflowFilters = viewMode === "workflows";
  const showBranchFilters = viewMode === "branches";

  useEffect(() => {
    if (viewMode !== "branches") {
      setSelectedBranchesMap((previous) =>
        previous.size === 0 ? previous : new Map()
      );
    }
  }, [viewMode]);

  useEffect(() => {
    setSelectedBranchesMap((previous) => {
      if (previous.size === 0) {
        return previous;
      }

      const allowed = new Set(enabledRepositories);
      let changed = false;
      const next = new Map<string, Set<string>>();

      previous.forEach((branches, repository) => {
        if (!allowed.has(repository)) {
          changed = true;
          return;
        }

        next.set(repository, branches);
      });

      return changed ? next : previous;
    });
  }, [enabledRepositories]);

  const handleBranchDeleteResult = useCallback(
    (result: BulkBranchDeleteResult) => {
      if (result.deleted.length > 0) {
        setSelectedBranchesMap((previous) => {
          const next = new Map(previous);
          let changed = false;

          result.deleted.forEach(
            ({ repository, branch }: BranchDeletionTarget) => {
              const current = next.get(repository);
              if (!current?.has(branch)) {
                return;
              }

              changed = true;
              const nextSet = new Set(current);
              nextSet.delete(branch);

              if (nextSet.size > 0) {
                next.set(repository, nextSet);
              } else {
                next.delete(repository);
              }
            }
          );

          return changed ? next : previous;
        });

        if (organization) {
          const reposToRefresh = Array.from(
            new Set(
              result.deleted.map(
                (entry: BranchDeletionTarget) => entry.repository
              )
            )
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
        }
      }
    },
    [organization, queryClient]
  );

  const clampBranchCount = useCallback((value: number) => {
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
        [field]: clampBranchCount(raw),
      }));
    },
    [clampBranchCount]
  );

  if (!organization || enabledRepositories.length === 0) {
    return null;
  }

  return (
    <>
      <WorkflowDetailsDialog
        workflow={activeWorkflow}
        runNameFilter={runNameFilter}
        onOpenChange={(open) => {
          if (!open) setActiveWorkflow(null);
        }}
      />
      <BulkBranchDialog
        organization={organization}
        repositories={selectedRepositoriesArray}
        open={isBulkBranchDialogOpen}
        onOpenChange={(open) => setIsBulkBranchDialogOpen(open)}
      />
      <BulkBranchDeleteDialog
        organization={organization}
        branches={selectedBranchEntries}
        open={isBulkBranchDeleteDialogOpen}
        onOpenChange={(open: boolean) => {
          if (!open && selectedBranchCount === 0) {
            setIsBulkBranchDeleteDialogOpen(false);
            return;
          }

          if (!open && isBulkBranchDeleteDialogOpen) {
            setIsBulkBranchDeleteDialogOpen(false);
            return;
          }

          setIsBulkBranchDeleteDialogOpen(open);
        }}
        onCompleted={(result: BulkBranchDeleteResult) => {
          handleBranchDeleteResult(result);
          setIsBulkBranchDeleteDialogOpen(false);
        }}
      />
      <BulkPrDialog
        organization={organization}
        repositories={selectedRepositoriesArray}
        open={isBulkPrDialogOpen}
        onOpenChange={(open) => setIsBulkPrDialogOpen(open)}
      />
      <BulkWorkflowRunDialog
        organization={organization}
        repositories={selectedRepositoriesArray}
        workflows={bulkWorkflowOptions}
        open={isBulkWorkflowDialogOpen}
        onOpenChange={handleWorkflowDialogChange}
        isLoadingWorkflows={isAnyWorkflowLoading}
        loadError={bulkWorkflowError ?? undefined}
        repositoryWorkflows={Object.fromEntries(workflowSummariesByRepo)}
      />
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold">{headerTitle}</h3>
            <p className="text-sm text-muted-foreground">{headerDescription}</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 rounded-md border bg-muted/40 p-1">
              <Button
                type="button"
                size="sm"
                variant={viewMode === "workflows" ? "default" : "ghost"}
                onClick={() => setViewMode("workflows")}
              >
                Workflows
              </Button>
              <Button
                type="button"
                size="sm"
                variant={viewMode === "deployments" ? "default" : "ghost"}
                onClick={() => setViewMode("deployments")}
              >
                Deployments
              </Button>
              <Button
                type="button"
                size="sm"
                variant={viewMode === "branches" ? "default" : "ghost"}
                onClick={() => setViewMode("branches")}
              >
                Branches
              </Button>
            </div>
            <span className="text-xs text-muted-foreground">
              Last refreshed: {lastRefreshedLabel}
            </span>
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => {
                if (!organization) {
                  return;
                }

                enabledRepositories.forEach((repo) => {
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

                setLastRefreshedAt(new Date());
              }}
              aria-label="Refresh workflow data"
            >
              <RefreshCwIcon className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </div>
        {showWorkflowFilters ? (
          <Card className="border-dashed">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Filters</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="filter-exclude-no-runs"
                  checked={filters.excludeNoRuns}
                  onCheckedChange={(checked) =>
                    setFilters((prev) => ({
                      ...prev,
                      excludeNoRuns: Boolean(checked),
                    }))
                  }
                />
                <Label htmlFor="filter-exclude-no-runs" className="text-sm">
                  Hide workflows with no runs
                </Label>
              </div>
              <div className="space-y-1">
                <Label
                  htmlFor="filter-branch"
                  className="text-xs uppercase text-muted-foreground"
                >
                  Branch
                </Label>
                <Input
                  id="filter-branch"
                  placeholder="e.g. main"
                  value={filters.branch}
                  onChange={(event) =>
                    setFilters((prev) => ({
                      ...prev,
                      branch: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label
                  htmlFor="filter-run-name"
                  className="text-xs uppercase text-muted-foreground"
                >
                  Run name contains
                </Label>
                <Input
                  id="filter-run-name"
                  placeholder="e.g. deploy"
                  value={filters.runName}
                  onChange={(event) =>
                    setFilters((prev) => ({
                      ...prev,
                      runName: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label
                    htmlFor="filter-start-date"
                    className="text-xs uppercase text-muted-foreground"
                  >
                    Start date
                  </Label>
                  <Input
                    id="filter-start-date"
                    type="datetime-local"
                    value={filters.startDate ?? ""}
                    onChange={(event) =>
                      setFilters((prev) => ({
                        ...prev,
                        startDate: event.target.value || undefined,
                      }))
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label
                    htmlFor="filter-end-date"
                    className="text-xs uppercase text-muted-foreground"
                  >
                    End date
                  </Label>
                  <Input
                    id="filter-end-date"
                    type="datetime-local"
                    value={filters.endDate ?? ""}
                    onChange={(event) =>
                      setFilters((prev) => ({
                        ...prev,
                        endDate: event.target.value || undefined,
                      }))
                    }
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        ) : null}
        {showBranchFilters ? (
          <Card className="border-dashed">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Branch settings</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
              <div className="space-y-1">
                <Label
                  htmlFor="branch-visibility"
                  className="text-xs uppercase text-muted-foreground"
                >
                  Visibility
                </Label>
                <Select
                  value={branchSettings.visibility}
                  onValueChange={(value: "all" | "protected" | "unprotected") =>
                    setBranchSettings((previous) => ({
                      ...previous,
                      visibility: value,
                    }))
                  }
                >
                  <SelectTrigger id="branch-visibility">
                    <SelectValue placeholder="Select visibility" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All branches</SelectItem>
                    <SelectItem value="protected">Protected only</SelectItem>
                    <SelectItem value="unprotected">
                      Unprotected only
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label
                  htmlFor="branch-per-page"
                  className="text-xs uppercase text-muted-foreground"
                >
                  Branches per request
                </Label>
                <Input
                  id="branch-per-page"
                  type="number"
                  min={1}
                  max={100}
                  value={branchSettings.perPage}
                  onChange={handleBranchNumericChange("perPage")}
                />
                <p className="text-[10px] text-muted-foreground">
                  Controls the GitHub API page size (max 100).
                </p>
              </div>
              <div className="space-y-1">
                <Label
                  htmlFor="branch-limit"
                  className="text-xs uppercase text-muted-foreground"
                >
                  Maximum branches displayed
                </Label>
                <Input
                  id="branch-limit"
                  type="number"
                  min={1}
                  max={100}
                  value={branchSettings.limit}
                  onChange={handleBranchNumericChange("limit")}
                />
                <p className="text-[10px] text-muted-foreground">
                  Caps the number of branches shown per repository.
                </p>
              </div>
              <div className="space-y-1">
                <Label
                  htmlFor="branch-name-filter"
                  className="text-xs uppercase text-muted-foreground"
                >
                  Branch name contains
                </Label>
                <Input
                  id="branch-name-filter"
                  placeholder="e.g. release"
                  value={branchSettings.name}
                  onChange={(event) =>
                    setBranchSettings((previous) => ({
                      ...previous,
                      name: event.target.value,
                    }))
                  }
                />
              </div>
            </CardContent>
          </Card>
        ) : null}
        {viewMode === "workflows" ? (
          <div className="grid w-full gap-6 grid-cols-[repeat(auto-fit,minmax(250px,1fr))]">
            {enabledRepositories.map((repository, index) => {
              const query = workflowQueries[index];

              return (
                <Card
                  key={repository}
                  className={cn(
                    "flex h-full cursor-grab flex-col select-none transition-opacity",
                    dragging === repository ? "opacity-80" : ""
                  )}
                  draggable={enabledRepositories.length > 1}
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
                        handleRepositorySelectionChange(
                          repository,
                          checked === true
                        )
                      }
                      aria-label={`Select repository ${repository}`}
                    />
                  </CardHeader>
                  <CardContent className="flex-1">
                    {renderQueryState(
                      query,
                      repository,
                      runNameFilter,
                      (workflow) => setActiveWorkflow(workflow)
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : viewMode === "deployments" ? (
          <RepositoryDeploymentGrid
            organization={organization}
            repositories={enabledRepositories}
            selectedRepositories={selectedRepositories}
            onRepositorySelectionChange={handleRepositorySelectionChange}
          />
        ) : (
          <RepositoryBranchTree
            organization={organization}
            repositories={enabledRepositories}
            branchOptions={branchQueryOptions}
            nameFilter={branchNameFilter}
            selectedBranches={selectedBranchesMap}
            onBranchSelectionChange={handleBranchSelectionChange}
          />
        )}
      </div>
      {viewMode !== "branches" && selectedRepositories.size > 0 ? (
        <div className="fixed inset-x-0 bottom-4 z-40 px-4">
          <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 rounded-lg border bg-background/95 p-4 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-background/75">
            <div className="text-sm text-muted-foreground">
              {selectedRepositories.size} repositories selected
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="secondary">
                  Bulk actions
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onSelect={(event) => {
                    event.preventDefault();
                    handleBulkActionSelect("create-branch");
                  }}
                >
                  Create branch
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={(event) => {
                    event.preventDefault();
                    handleBulkActionSelect("create-pr");
                  }}
                >
                  Create pull request
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={(event) => {
                    event.preventDefault();
                    handleBulkActionSelect("run-workflow");
                  }}
                >
                  Run workflow
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      ) : null}
      {viewMode === "branches" && selectedBranchCount > 0 ? (
        <div className="fixed inset-x-0 bottom-4 z-40 px-4">
          <div className="mx-auto flex max-w-4xl flex-col gap-3 rounded-lg border bg-background/95 p-4 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-background/75 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-muted-foreground">
              {selectedBranchCount} branch
              {selectedBranchCount === 1 ? "" : "es"} selected
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={clearSelectedBranches}
              >
                Clear selection
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={() => setIsBulkBranchDeleteDialogOpen(true)}
              >
                Delete branches
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

const renderQueryState = (
  query: UseQueryResult<RepositoryWorkflowSummary[], GithubApiError>,
  repository: string,
  runNameFilter: string,
  onSelectWorkflow: (workflow: RepositoryWorkflowSummary) => void
) => {
  if (query.isLoading) {
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
      {workflows.map((workflow: RepositoryWorkflowSummary) => (
        <WorkflowPill
          key={workflow.id}
          workflow={workflow}
          onSelect={onSelectWorkflow}
        />
      ))}
    </div>
  );
};

type WorkflowPillProps = {
  workflow: RepositoryWorkflowSummary;
  onSelect: (workflow: RepositoryWorkflowSummary) => void;
};

function WorkflowPill({ workflow, onSelect }: WorkflowPillProps) {
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
}

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
