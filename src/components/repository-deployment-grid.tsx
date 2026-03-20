import { useCallback, useEffect, useMemo, useState } from "react";
import { useQueries, type UseQueryResult } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { GithubApiError } from "@/lib/github/client";
import {
  fetchRepositoryEnvironmentDeployments,
  type DeploymentStatusCategory,
  type EnvironmentDeploymentSummary,
} from "@/lib/github/deployments";

import { useDeploymentGridPreferences } from "@/hooks/useDeploymentGridPreferences";

const DEPLOYMENT_STATUS_CLASSES: Record<DeploymentStatusCategory, string> = {
  success:
    "border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  failed: "border-destructive/30 bg-destructive/15 text-destructive",
  in_progress:
    "border-amber-500/30 bg-amber-500/15 text-amber-700 dark:text-amber-300",
  unknown: "border-muted bg-muted text-muted-foreground",
};

interface RepositoryDeploymentGridProps {
  organization: string;
  repositories: string[];
  selectedRepositories: Set<string>;
  onRepositorySelectionChange: (repository: string, checked: boolean) => void;
}

interface EnvironmentGroup {
  key: string;
  displayName: string;
  repositories: Map<string, EnvironmentDeploymentSummary>;
}

export function RepositoryDeploymentGrid({
  organization,
  repositories,
  selectedRepositories,
  onRepositorySelectionChange,
}: RepositoryDeploymentGridProps) {
  const { preferences, updatePreferences, resetPreferences } =
    useDeploymentGridPreferences(organization);
  const [isCustomizeDialogOpen, setIsCustomizeDialogOpen] = useState(false);
  const [draftOrder, setDraftOrder] = useState<string[]>([]);
  const [draftHiddenKeys, setDraftHiddenKeys] = useState<string[]>([]);
  const [lastSyncedSignature, setLastSyncedSignature] = useState<string | null>(
    null,
  );

  const queries = useQueries({
    queries: repositories.map((repository) => ({
      queryKey: [
        "github",
        "org",
        organization,
        "repo",
        repository,
        "deployments",
        "environments",
      ],
      enabled: Boolean(organization),
      queryFn: () =>
        fetchRepositoryEnvironmentDeployments(organization, repository),
      staleTime: 1000 * 60, // 1 minute
    })),
  }) as UseQueryResult<EnvironmentDeploymentSummary[], GithubApiError>[];

  const isLoading = queries.some(
    (query) => query.isLoading || query.isFetching,
  );
  const firstError = queries.find((query) => query.isError);

  const dataByRepository = useMemo(() => {
    const map = new Map<string, EnvironmentDeploymentSummary[]>();
    repositories.forEach((repository, index) => {
      const query = queries[index];
      if (query?.data) {
        map.set(repository, query.data);
      }
    });
    return map;
  }, [queries, repositories]);

  const environmentGroups = useMemo(() => {
    const groups = new Map<string, EnvironmentGroup>();

    dataByRepository.forEach((summaries, repository) => {
      summaries.forEach((summary) => {
        const key = summary.environment.trim().toLowerCase();
        const existing = groups.get(key);

        if (existing) {
          existing.repositories.set(repository, summary);
          return;
        }

        groups.set(key, {
          key,
          displayName: summary.environment,
          repositories: new Map([[repository, summary]]),
        });
      });
    });

    return Array.from(groups.values()).sort((a, b) =>
      a.displayName.localeCompare(b.displayName),
    );
  }, [dataByRepository]);

  const environmentByKey = useMemo(() => {
    const map = new Map<string, EnvironmentGroup>();
    environmentGroups.forEach((group) => {
      map.set(group.key, group);
    });
    return map;
  }, [environmentGroups]);

  const allEnvironmentKeys = useMemo(
    () => environmentGroups.map((group) => group.key),
    [environmentGroups],
  );

  const orderedKeys = useMemo(() => {
    const fromPreferences = preferences.order.filter((key) =>
      environmentByKey.has(key),
    );
    const remaining = allEnvironmentKeys.filter(
      (key) => !fromPreferences.includes(key),
    );
    return [...fromPreferences, ...remaining];
  }, [preferences.order, environmentByKey, allEnvironmentKeys]);

  const hiddenSet = useMemo(
    () => new Set(preferences.hidden),
    [preferences.hidden],
  );

  const availableKeySet = useMemo(
    () => new Set(allEnvironmentKeys),
    [allEnvironmentKeys],
  );

  const filteredHiddenKeys = useMemo(
    () => preferences.hidden.filter((key) => availableKeySet.has(key)),
    [preferences.hidden, availableKeySet],
  );

  const preferenceSignature = useMemo(
    () =>
      JSON.stringify({
        order: orderedKeys,
        hidden: filteredHiddenKeys,
      }),
    [orderedKeys, filteredHiddenKeys],
  );

  const draftHiddenSet = useMemo(
    () => new Set(draftHiddenKeys),
    [draftHiddenKeys],
  );

  const visibleEnvironmentGroups = useMemo(() => {
    return orderedKeys
      .map((key) => environmentByKey.get(key))
      .filter((group): group is EnvironmentGroup => Boolean(group))
      .filter((group) => !hiddenSet.has(group.key));
  }, [orderedKeys, environmentByKey, hiddenSet]);

  useEffect(() => {
    if (!isCustomizeDialogOpen) {
      if (lastSyncedSignature !== null) {
        setLastSyncedSignature(null);
      }
      return;
    }

    if (preferenceSignature === lastSyncedSignature) {
      return;
    }

    setDraftOrder([...orderedKeys]);
    setDraftHiddenKeys([...filteredHiddenKeys]);
    setLastSyncedSignature(preferenceSignature);
  }, [
    isCustomizeDialogOpen,
    orderedKeys,
    filteredHiddenKeys,
    preferenceSignature,
    lastSyncedSignature,
  ]);

  const moveDraftKey = useCallback((key: string, direction: "up" | "down") => {
    setDraftOrder((previous: string[]) => {
      const index = previous.indexOf(key);
      if (index === -1) {
        return previous;
      }

      const next = [...previous];
      const swapIndex = direction === "up" ? index - 1 : index + 1;
      if (swapIndex < 0 || swapIndex >= next.length) {
        return previous;
      }

      const temp = next[index];
      next[index] = next[swapIndex];
      next[swapIndex] = temp;
      return next;
    });
  }, []);

  const toggleDraftHidden = useCallback((key: string, hidden: boolean) => {
    setDraftHiddenKeys((previous) => {
      const next = new Set(previous);
      if (hidden) {
        next.add(key);
      } else {
        next.delete(key);
      }
      return Array.from(next);
    });
  }, []);

  const draftOrderedKeys = useMemo(() => {
    const sanitized = draftOrder.filter((key) => environmentByKey.has(key));
    const remaining = allEnvironmentKeys.filter(
      (key) => !sanitized.includes(key),
    );
    return [...sanitized, ...remaining];
  }, [draftOrder, environmentByKey, allEnvironmentKeys]);

  const handleSavePreferences = useCallback(() => {
    updatePreferences(() => ({
      order: draftOrderedKeys,
      hidden: draftHiddenKeys,
    }));
    setIsCustomizeDialogOpen(false);
  }, [draftOrderedKeys, draftHiddenKeys, updatePreferences]);

  return (
    <div className="space-y-4">
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading deployments…</p>
      ) : null}
      {firstError ? (
        <p className="text-sm text-destructive">
          Unable to load deployment information.{" "}
          {firstError.error?.message ?? "Try again later."}
        </p>
      ) : null}

      <div className="overflow-x-auto">
        <TooltipProvider delayDuration={150}>
          <div className="mb-3 flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsCustomizeDialogOpen(true)}
            >
              Customize columns
            </Button>
            {preferences.order.length > 0 || preferences.hidden.length > 0 ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => resetPreferences()}
              >
                Reset
              </Button>
            ) : null}
          </div>
          <table className="w-full min-w-[680px] border-collapse text-sm">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 w-56 bg-background px-3 py-2 text-left text-xs font-semibold uppercase text-muted-foreground">
                  Repository
                </th>
                {visibleEnvironmentGroups.map((group) => (
                  <th
                    key={group.key}
                    className="w-48 border px-2 py-2 text-left text-xs font-semibold uppercase text-muted-foreground"
                  >
                    {group.displayName}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {repositories.map((repository, index) => {
                const query = queries[index];
                return (
                  <tr key={repository} className="border-t">
                    <td className="sticky left-0 z-10 bg-background px-3 py-3 align-top">
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-2">
                          <Checkbox
                            checked={selectedRepositories.has(repository)}
                            onCheckedChange={(checked) =>
                              onRepositorySelectionChange(
                                repository,
                                checked === true,
                              )
                            }
                            aria-label={`Select repository ${repository}`}
                          />
                          <a
                            href={`https://github.com/${organization}/${repository}`}
                            target="_blank"
                            rel="noreferrer"
                            className="font-semibold text-primary hover:underline"
                          >
                            {repository}
                          </a>
                        </div>
                        {query.isLoading ? (
                          <p className="text-xs text-muted-foreground">
                            Loading…
                          </p>
                        ) : query.isError ? (
                          <p className="text-xs text-destructive">
                            Failed to load deployments.
                          </p>
                        ) : null}
                      </div>
                    </td>
                    {visibleEnvironmentGroups.map((group) => {
                      const summary = group.repositories.get(repository);

                      if (!summary) {
                        return (
                          <td
                            key={group.key}
                            className="w-48 border px-2 py-3 align-top"
                          >
                            <p className="text-xs text-muted-foreground">
                              No environment
                            </p>
                          </td>
                        );
                      }

                      if (!summary.latestDeployment) {
                        return (
                          <td
                            key={group.key}
                            className="w-48 border px-2 py-3 align-top"
                          >
                            <div className="rounded-md border border-dashed bg-muted p-3 text-xs text-muted-foreground">
                              No deployments yet.
                            </div>
                          </td>
                        );
                      }

                      const deployment = summary.latestDeployment;
                      const statusClass =
                        DEPLOYMENT_STATUS_CLASSES[deployment.status];
                      const updatedLabel = deployment.updatedAt
                        ? new Date(deployment.updatedAt).toLocaleString()
                        : "Unknown";
                      const messageLabel =
                        deployment.commitMessage ?? deployment.commitSha ?? "";
                      const initiatedBy = deployment.initiatedBy ?? "Unknown";
                      const historyUrl = `https://github.com/${organization}/${repository}/deployments/${encodeURIComponent(group.displayName)}`;

                      return (
                        <td
                          key={group.key}
                          className="w-48 border px-2 py-3 align-top"
                        >
                          <div
                            className={cn(
                              "rounded-md border p-3 text-xs shadow-sm transition-colors",
                              statusClass,
                            )}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-semibold capitalize">
                                {deployment.statusLabel || deployment.status}
                              </span>
                              <a
                                href={historyUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                              >
                                History
                                <ExternalLink
                                  className="h-3 w-3"
                                  aria-hidden="true"
                                />
                              </a>
                            </div>
                            <dl className="mt-2 space-y-1">
                              <div className="flex items-center gap-2">
                                <dt className="flex-shrink-0 text-muted-foreground">
                                  Updated
                                </dt>
                                <dd className="truncate">{updatedLabel}</dd>
                              </div>
                              {messageLabel ? (
                                <div className="flex items-center gap-2">
                                  <dt className="flex-shrink-0 text-muted-foreground">
                                    Commit
                                  </dt>
                                  <dd className="max-w-[170px] flex-1">
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <span className="block truncate cursor-help">
                                          {messageLabel}
                                        </span>
                                      </TooltipTrigger>
                                      <TooltipContent
                                        side="top"
                                        className="max-w-xs break-words"
                                      >
                                        {messageLabel}
                                      </TooltipContent>
                                    </Tooltip>
                                  </dd>
                                </div>
                              ) : null}
                              <div className="flex items-center gap-2">
                                <dt className="flex-shrink-0 text-muted-foreground">
                                  Initiated by
                                </dt>
                                <dd className="truncate">{initiatedBy}</dd>
                              </div>
                              {deployment.tag ? (
                                <div className="flex items-center gap-2">
                                  <dt className="flex-shrink-0 text-muted-foreground">
                                    Tag
                                  </dt>
                                  <dd className="truncate font-mono text-xs">
                                    {deployment.tag}
                                  </dd>
                                </div>
                              ) : null}
                            </dl>
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TooltipProvider>
      </div>

      <Dialog
        open={isCustomizeDialogOpen}
        onOpenChange={setIsCustomizeDialogOpen}
      >
        <DialogContent className="max-w-lg" scrollable>
          <DialogHeader>
            <DialogTitle>Customize deployment columns</DialogTitle>
            <DialogDescription>
              Reorder or hide environment columns. Preferences are stored
              locally per organization.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <ul className="space-y-2">
              {draftOrderedKeys.map((key) => {
                const group = environmentByKey.get(key);
                if (!group) {
                  return null;
                }

                const hidden = draftHiddenSet.has(key);
                const index = draftOrderedKeys.indexOf(key);

                return (
                  <li
                    key={key}
                    className="flex items-center justify-between gap-3 rounded-md border border-border bg-muted/40 px-3 py-2"
                  >
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id={`env-${key}`}
                        checked={!hidden}
                        onCheckedChange={(checked) =>
                          toggleDraftHidden(key, checked !== true)
                        }
                        aria-label={`Toggle ${group.displayName}`}
                      />
                      <label
                        htmlFor={`env-${key}`}
                        className="text-sm font-medium"
                      >
                        {group.displayName}
                      </label>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        onClick={() => moveDraftKey(key, "up")}
                        disabled={index === 0}
                        aria-label={`Move ${group.displayName} up`}
                      >
                        <ArrowUp className="h-4 w-4" aria-hidden="true" />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        onClick={() => moveDraftKey(key, "down")}
                        disabled={index === draftOrderedKeys.length - 1}
                        aria-label={`Move ${group.displayName} down`}
                      >
                        <ArrowDown className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
            {draftOrderedKeys.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No environments detected yet.
              </p>
            ) : null}
          </div>
          <DialogFooter className="flex items-center justify-between">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setDraftOrder(orderedKeys);
                setDraftHiddenKeys(filteredHiddenKeys);
                setLastSyncedSignature(preferenceSignature);
              }}
            >
              Discard changes
            </Button>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => resetPreferences()}
              >
                Reset to default
              </Button>
              <Button type="button" onClick={handleSavePreferences}>
                Save changes
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
