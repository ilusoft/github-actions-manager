import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, ExternalLink, Loader2 } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { useRepositoryPullRequests } from "@/hooks/githubQueries";
import { type RepositoryPullRequestRequestOptions } from "@/lib/github/pull-requests";
import type { PullRequestSelectionEntry } from "@/hooks/use-pull-request-selection";

interface RepositoryPullRequestTreeProps {
  organization: string;
  repositories: string[];
  options?: RepositoryPullRequestRequestOptions;
  selectedPullRequestIds?: ReadonlyMap<string, Set<number>>;
  onPullRequestSelectionChange?: (
    repository: string,
    pullRequest: PullRequestSelectionEntry,
    checked: boolean
  ) => void;
}

const formatDate = (value?: string) => {
  if (!value) {
    return "Unknown";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) {
    return "Unknown";
  }

  return parsed.toLocaleString();
};

const getStatusBadge = (
  state: "open" | "closed",
  merged: boolean,
  draft: boolean
): { label: string; className: string } => {
  if (merged) {
    return {
      label: "Merged",
      className: "bg-violet-500/20 text-violet-700 dark:text-violet-300",
    };
  }

  if (draft) {
    return {
      label: "Draft",
      className: "bg-muted text-muted-foreground",
    };
  }

  if (state === "closed") {
    return {
      label: "Closed",
      className: "bg-destructive/15 text-destructive",
    };
  }

  return {
    label: "Open",
    className: "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300",
  };
};

interface RepositoryPullRequestSectionProps {
  organization: string;
  repository: string;
  isExpanded: boolean;
  onToggle: (repository: string) => void;
  options?: RepositoryPullRequestRequestOptions;
  selectedPullRequestIds?: ReadonlyMap<string, Set<number>>;
  onPullRequestSelectionChange?: (
    repository: string,
    pullRequest: PullRequestSelectionEntry,
    checked: boolean
  ) => void;
}

function RepositoryPullRequestSection({
  organization,
  repository,
  isExpanded,
  onToggle,
  options,
  selectedPullRequestIds,
  onPullRequestSelectionChange,
}: RepositoryPullRequestSectionProps) {
  const query = useRepositoryPullRequests(organization, repository, options);
  const pullRequests = useMemo(() => query.data ?? [], [query.data]);
  const selectedIds = selectedPullRequestIds?.get(repository);

  return (
    <Card className="border-border/80">
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <button
          type="button"
          onClick={() => onToggle(repository)}
          className="flex items-center gap-2 text-left"
          aria-expanded={isExpanded}
          aria-controls={`pulls-${repository}`}
        >
          {isExpanded ? (
            <ChevronDown className="h-4 w-4" aria-hidden="true" />
          ) : (
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          )}
          <CardTitle className="text-base font-semibold">
            <span className="truncate" title={repository}>
              {repository}
            </span>
          </CardTitle>
        </button>
        <a
          href={`https://github.com/${organization}/${repository}/pulls`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
        >
          View on GitHub
          <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
        </a>
      </CardHeader>
      {isExpanded ? (
        <CardContent id={`pulls-${repository}`} className="space-y-4">
          {query.isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              Loading pull requests…
            </div>
          ) : null}

          {query.isError ? (
            <p className="text-sm text-destructive">
              Failed to load pull requests: {query.error?.message ?? "Unknown error"}
            </p>
          ) : null}

          {!query.isLoading && !query.isError && pullRequests.length === 0 ? (
            <p className="text-sm text-muted-foreground">No pull requests found for this repository.</p>
          ) : null}

          {!query.isLoading && !query.isError && pullRequests.length > 0 ? (
            <ul className="space-y-3">
              {pullRequests.map((pr) => {
                const status = getStatusBadge(pr.state, pr.merged, pr.draft);
                const isSelectable = pr.state === "open" && !pr.draft;
                const isChecked = selectedIds?.has(pr.number) ?? false;
                const handleSelectionChange = (checked: boolean | "indeterminate") => {
                  if (!onPullRequestSelectionChange || !isSelectable) {
                    return;
                  }

                  onPullRequestSelectionChange(
                    repository,
                    {
                      repository,
                      number: pr.number,
                      title: pr.title,
                      url: pr.url,
                      headSha: pr.headSha,
                    },
                    checked === true
                  );
                };

                return (
                  <li
                    key={pr.number}
                    className="rounded-md border border-border/70 bg-muted/30 p-3"
                  >
                    <div className="flex items-start gap-3">
                      <Checkbox
                        checked={isChecked}
                        disabled={!isSelectable}
                        onCheckedChange={handleSelectionChange}
                        aria-label={`Select pull request #${pr.number} from ${repository}`}
                      />
                      <div className="flex w-full flex-col gap-2">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <a
                            href={pr.url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-sm font-semibold text-primary hover:underline"
                          >
                            #{pr.number} {pr.title}
                          </a>
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${status.className}`}
                          >
                            {status.label}
                          </span>
                        </div>
                        <div className="space-y-1 text-xs text-muted-foreground">
                          <p>
                            Created {formatDate(pr.createdAt)}
                            {pr.author ? ` by ${pr.author}` : ""}
                          </p>
                          <p>
                            Base: <span className="text-foreground">{pr.baseBranch ?? "unknown"}</span>
                            {pr.headBranch ? (
                              <>
                                {" "}• Head: <span className="text-foreground">{pr.headBranch}</span>
                              </>
                            ) : null}
                          </p>
                          {pr.description ? (
                            <p className="line-clamp-3 text-foreground">
                              {pr.description}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </CardContent>
      ) : null}
    </Card>
  );
}

export function RepositoryPullRequestTree({
  organization,
  repositories,
  options,
  selectedPullRequestIds,
  onPullRequestSelectionChange,
}: RepositoryPullRequestTreeProps) {
  const normalizedRepositories = useMemo(
    () => repositories.filter(Boolean),
    [repositories]
  );

  const previousRepositoriesRef = useRef<string[]>(normalizedRepositories);
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(normalizedRepositories)
  );

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

  useEffect(() => {
    const previous = previousRepositoriesRef.current;
    setExpanded((current) => {
      const next = new Set<string>();
      normalizedRepositories.forEach((repository) => {
        if (current.has(repository) || !previous.includes(repository)) {
          next.add(repository);
        }
      });
      return next;
    });
    previousRepositoriesRef.current = normalizedRepositories;
  }, [normalizedRepositories]);

  if (!organization || normalizedRepositories.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4">
      {normalizedRepositories.map((repository) => (
        <RepositoryPullRequestSection
          key={repository}
          organization={organization}
          repository={repository}
          isExpanded={expanded.has(repository)}
          onToggle={toggleRepository}
          options={options}
          selectedPullRequestIds={selectedPullRequestIds}
          onPullRequestSelectionChange={onPullRequestSelectionChange}
        />
      ))}
    </div>
  );
}
