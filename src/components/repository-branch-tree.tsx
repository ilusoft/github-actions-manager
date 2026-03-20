import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ChevronDown,
  ChevronRight,
  ExternalLink,
  InfoIcon,
  Loader2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { useRepositoryBranches } from "@/hooks/githubQueries";
import {
  fetchRepositoryBranchDetails,
  type RepositoryBranchDetail,
  type RepositoryBranchRequestOptions,
} from "@/lib/github/branches";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface RepositoryBranchTreeProps {
  organization: string;
  repositories: string[];
  branchOptions?: RepositoryBranchRequestOptions;
  nameFilter?: string;
  selectedBranches?: ReadonlyMap<string, Set<string>>;
  onBranchSelectionChange?: (
    repository: string,
    branch: string,
    checked: boolean,
  ) => void;
}

const formatCommitDate = (value?: string) => {
  if (!value) {
    return "Unknown";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) {
    return "Unknown";
  }

  return parsed.toLocaleString();
};

const extractFirstLine = (value?: string) => {
  if (!value) {
    return undefined;
  }

  const [line] = value.split("\n");
  return line.trim();
};

export function RepositoryBranchTree({
  organization,
  repositories,
  branchOptions,
  nameFilter,
  selectedBranches,
  onBranchSelectionChange,
}: RepositoryBranchTreeProps) {
  const normalizedRepositories = useMemo(
    () => repositories.filter(Boolean),
    [repositories],
  );
  const normalizedNameFilter = useMemo(
    () => nameFilter?.trim().toLowerCase() ?? "",
    [nameFilter],
  );

  const emptySelectionMapRef = useRef<Map<string, Set<string>> | null>(null);
  if (!emptySelectionMapRef.current) {
    emptySelectionMapRef.current = new Map<string, Set<string>>();
  }
  const selectionMap = selectedBranches ?? emptySelectionMapRef.current;

  const previousRepositoriesRef = useRef<string[]>(normalizedRepositories);
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(normalizedRepositories),
  );

  useEffect(() => {
    const previous = previousRepositoriesRef.current;
    setExpanded((current) => {
      const next = new Set<string>();
      normalizedRepositories.forEach((repository) => {
        if (current.has(repository)) {
          next.add(repository);
          return;
        }

        if (!previous.includes(repository)) {
          next.add(repository);
        }
      });
      return next;
    });
    previousRepositoriesRef.current = normalizedRepositories;
  }, [normalizedRepositories]);

  const toggleRepository = useCallback((repository: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(repository)) {
        next.delete(repository);
      } else {
        next.add(repository);
      }
      return next;
    });
  }, []);

  if (!organization || normalizedRepositories.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4">
      {normalizedRepositories.map((repository) => (
        <RepositoryBranchSection
          key={repository}
          organization={organization}
          repository={repository}
          isExpanded={expanded.has(repository)}
          onToggle={toggleRepository}
          options={branchOptions}
          nameFilter={normalizedNameFilter}
          selectedBranches={selectionMap}
          onBranchSelectionChange={onBranchSelectionChange}
        />
      ))}
    </div>
  );
}

interface RepositoryBranchSectionProps {
  organization: string;
  repository: string;
  isExpanded: boolean;
  onToggle: (repository: string) => void;
  options?: RepositoryBranchRequestOptions;
  nameFilter: string;
  selectedBranches: ReadonlyMap<string, Set<string>>;
  onBranchSelectionChange?: (
    repository: string,
    branch: string,
    checked: boolean,
  ) => void;
}

function RepositoryBranchSection({
  organization,
  repository,
  isExpanded,
  onToggle,
  options,
  nameFilter,
  selectedBranches,
  onBranchSelectionChange,
}: RepositoryBranchSectionProps) {
  const query = useRepositoryBranches(organization, repository, options);
  const branches = query.data ?? [];
  const filteredBranches = useMemo(() => {
    if (!nameFilter) {
      return branches;
    }

    return branches.filter((branch) =>
      branch.name.toLowerCase().includes(nameFilter),
    );
  }, [branches, nameFilter]);
  const branchCount = filteredBranches.length;
  const displayLimit = options?.limit ?? options?.perPage ?? 10;
  const queryClient = useQueryClient();
  const [branchDetails, setBranchDetails] = useState<
    Map<string, RepositoryBranchDetail>
  >(() => new Map());
  const [isDetailsLoading, setIsDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [detailsVisible, setDetailsVisible] = useState(false);

  useEffect(() => {
    setBranchDetails((previous) => {
      if (filteredBranches.length === 0) {
        return previous.size === 0 ? previous : new Map();
      }

      let changed = previous.size !== filteredBranches.length;
      const next = new Map<string, RepositoryBranchDetail>();

      filteredBranches.forEach((branch) => {
        const existing = previous.get(branch.name);
        if (existing) {
          next.set(branch.name, existing);
        } else {
          changed = true;
        }
      });

      if (!changed) {
        for (const [key, value] of next) {
          if (previous.get(key) !== value) {
            changed = true;
            break;
          }
        }
      }

      return changed ? next : previous;
    });
  }, [filteredBranches]);

  const handleLoadDetails = useCallback(async () => {
    if (filteredBranches.length === 0 || isDetailsLoading) {
      return;
    }

    setIsDetailsLoading(true);
    setDetailsError(null);

    try {
      const entries = await Promise.all(
        filteredBranches.map(async (branch) => {
          const detail = await queryClient.fetchQuery({
            queryKey: [
              "github",
              "org",
              organization,
              "repo",
              repository,
              "branch",
              branch.name,
              "details",
            ],
            queryFn: () =>
              fetchRepositoryBranchDetails(
                organization,
                repository,
                branch.name,
              ),
          });
          return [branch.name, detail] as const;
        }),
      );

      setBranchDetails(new Map(entries));
      setDetailsVisible(true);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to load branch details.";
      setDetailsError(message);
    } finally {
      setIsDetailsLoading(false);
    }
  }, [
    filteredBranches,
    isDetailsLoading,
    organization,
    queryClient,
    repository,
  ]);

  const toggleDetailsVisibility = useCallback(() => {
    setDetailsVisible((current) => !current);
  }, []);

  return (
    <Card className="border-dashed">
      <CardHeader className="flex flex-row items-center justify-between gap-3 py-4">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => onToggle(repository)}
            aria-label={`${isExpanded ? "Collapse" : "Expand"} ${repository}`}
          >
            {isExpanded ? (
              <ChevronDown className="h-4 w-4" aria-hidden="true" />
            ) : (
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            )}
          </Button>
          <CardTitle className="text-base font-semibold">
            <a
              href={`https://github.com/${organization}/${repository}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 text-primary hover:underline"
            >
              {repository}
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
          </CardTitle>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {query.isLoading
              ? "Loading branches…"
              : `${branchCount} branch${branchCount === 1 ? "" : "es"}`}
          </span>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={
                    branchDetails.size > 0
                      ? toggleDetailsVisibility
                      : handleLoadDetails
                  }
                  disabled={
                    query.isLoading || isDetailsLoading || branchCount === 0
                  }
                  aria-label={
                    branchDetails.size > 0
                      ? `${
                          detailsVisible ? "Hide" : "Show"
                        } branch details for ${repository}`
                      : `Load all branches details for ${repository}`
                  }
                >
                  {isDetailsLoading ? (
                    <Loader2
                      className="h-4 w-4 animate-spin"
                      aria-hidden="true"
                    />
                  ) : (
                    <InfoIcon className="h-4 w-4" aria-hidden="true" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>
                  {branchDetails.size > 0
                    ? `${
                        detailsVisible ? "Hide" : "Show"
                      } branch details for ${repository}`
                    : `Load all branches details for ${repository}`}
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </CardHeader>
      {isExpanded ? (
        <CardContent className="space-y-3 pb-6">
          {detailsError ? (
            <p className="text-xs text-destructive">{detailsError}</p>
          ) : null}
          {query.isError ? (
            <p className="text-sm text-destructive">
              Unable to load branches for {repository}.{" "}
              {query.error?.message ?? "Try again later."}
            </p>
          ) : null}
          {query.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading branches…</p>
          ) : null}
          {!query.isLoading &&
          !query.isError &&
          filteredBranches.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No branches found for this repository.
            </p>
          ) : null}
          {!query.isLoading && !query.isError && filteredBranches.length > 0 ? (
            <div className="space-y-3">
              <div className="border-l border-dashed border-border pl-4">
                {filteredBranches.map((branch) => {
                  const commitMessage = branch.latestCommitMessage;
                  const details = branchDetails.get(branch.name);
                  const showDetails = Boolean(detailsVisible && details);
                  const repoSelections = selectedBranches.get(repository);
                  const isSelected = repoSelections?.has(branch.name) ?? false;
                  const selectionEnabled = Boolean(onBranchSelectionChange);

                  return (
                    <div
                      key={branch.name}
                      className="relative ml-[-1px] border-l border-border/70 py-2 pl-4 first:pt-0 last:border-transparent"
                    >
                      <div className="absolute left-[-1px] top-[18px] h-[calc(100%-18px)] border-l border-border/50 last:hidden" />
                      <div className="flex gap-3 rounded-md border bg-muted/30 p-3">
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={(checked) =>
                            onBranchSelectionChange?.(
                              repository,
                              branch.name,
                              Boolean(checked),
                            )
                          }
                          aria-label={`Select branch ${branch.name} from ${repository}`}
                          className="mt-1"
                          disabled={!selectionEnabled}
                        />
                        <div className="flex flex-1 flex-col gap-2">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <a
                              href={branch.url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-sm font-semibold text-primary hover:underline"
                            >
                              {branch.name}
                            </a>
                            {branch.latestCommitDate ? (
                              <span className="text-xs text-muted-foreground">
                                Latest commit&nbsp;
                                {formatCommitDate(branch.latestCommitDate)}
                              </span>
                            ) : null}
                          </div>
                          {branch.latestCommitAuthor ? (
                            <div className="text-xs text-muted-foreground">
                              Author:{" "}
                              <span className="font-medium text-foreground">
                                {branch.latestCommitAuthor}
                              </span>
                            </div>
                          ) : null}
                          {commitMessage ? (
                            <p className="text-xs text-muted-foreground">
                              Comment:{" "}
                              <span className="font-medium text-foreground">
                                {commitMessage}
                              </span>
                            </p>
                          ) : null}
                          {showDetails && details?.commitMessage ? (
                            <div className="space-y-2 rounded border border-border/60 bg-background/60 p-2 text-xs">
                              <div>
                                <span className="text-muted-foreground">
                                  Initial message:
                                </span>{" "}
                                <span className="font-medium text-foreground">
                                  {extractFirstLine(details.commitMessage) ??
                                    details.commitMessage}
                                </span>
                              </div>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground">
                Showing up to {displayLimit} most recently updated branches per
                repository.
              </p>
            </div>
          ) : null}
        </CardContent>
      ) : null}
    </Card>
  );
}
