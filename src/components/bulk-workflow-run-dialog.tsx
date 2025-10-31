import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  dispatchWorkflow,
  fetchWorkflowInputs,
  type WorkflowDispatchInputDefinition,
} from "@/lib/github/workflows";
import { GithubApiError } from "@/lib/github/client";
import { ExternalLink } from "lucide-react";
import {
  fetchWorkflowRuns,
  type GithubWorkflowRun,
} from "@/hooks/githubQueries";

export interface BulkWorkflowRepositoryEntry {
  repository: string;
  workflowId: number;
  workflowPath: string;
  workflowHtmlUrl: string;
}

interface SelectedWorkflowEntry extends BulkWorkflowRepositoryEntry {
  workflowName: string;
  key: string;
}

interface AggregatedInputDefinition
  extends Omit<WorkflowDispatchInputDefinition, 'required'> {
  id: string;
  label: string;
  description?: string;
  required: boolean;
  type: "string" | "choice" | "boolean" | "environment" | "number";
  options?: string[];
  defaultValue?: string;
  requiredBy: string[];
  workflows: string[];
  repositories: string[];
}

type WorkflowInputCache = Record<string, WorkflowDispatchInputDefinition[]>;

const buildWorkflowKey = (repository: string, workflowId: number) =>
  `${repository}::${workflowId}`;

const buildInputCacheKey = (
  repository: string,
  workflowId: number,
  workflowPath: string
) => `${repository}::${workflowId}::${workflowPath}`;

const extractWorkflowName = (fullName: string): string => {
  const parts = fullName.split(' - ');
  return parts.length > 1 ? parts.slice(1).join(' - ') : fullName;
};

const waitForRunUrl = async (
  organization: string,
  repository: string,
  workflowId: number,
  branch: string,
  signal: AbortSignal
): Promise<string | null> => {
  for (let attempt = 0; attempt < WAIT_ATTEMPTS; attempt += 1) {
    if (signal.aborted) {
      return null;
    }

    try {
      const { runs } = await fetchWorkflowRuns(
        organization,
        repository,
        workflowId,
        10,
        1,
        { branch }
      );

      const matchingRun = runs.find(
        (run: GithubWorkflowRun) => run.head_branch === branch
      );
      if (matchingRun) {
        if (matchingRun.id) {
          const encodedOrg = encodeURIComponent(organization);
          const encodedRepo = encodeURIComponent(repository);
          return `https://github.com/${encodedOrg}/${encodedRepo}/actions/runs/${matchingRun.id}`;
        }

        if (matchingRun.html_url) {
          return matchingRun.html_url;
        }
      }
    } catch (error) {
      if (error instanceof GithubApiError && error.status === 404) {
        // Workflow or runs not yet available; continue polling.
      } else if (error instanceof Error) {
        console.error("Failed to fetch workflow runs", error);
      }
    }

    await waitWithSignal(WAIT_DELAY_MS, signal);
  }

  return null;
};

const waitWithSignal = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);

    const onAbort = () => {
      clearTimeout(timeoutId);
      signal.removeEventListener("abort", onAbort);
      reject(new DOMException("Aborted", "AbortError"));
    };

    if (signal.aborted) {
      clearTimeout(timeoutId);
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }

    signal.addEventListener("abort", onAbort);
  });

export interface BulkWorkflowOption {
  name: string;
  repositories: BulkWorkflowRepositoryEntry[];
}

interface BulkWorkflowRunDialogProps {
  organization: string;
  repositories: string[];
  workflows: BulkWorkflowOption[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isLoadingWorkflows: boolean;
  loadError?: string | null;
}

type RepositoryActionStatus =
  | "idle"
  | "pending"
  | "success"
  | "error"
  | "cancelled";

interface RepositoryStatus {
  key: string;
  repository: string;
  workflowName: string;
  status: RepositoryActionStatus;
  message?: string;
  runUrl?: string;
}

const STATUS_STYLE: Record<RepositoryActionStatus, string> = {
  idle: "bg-muted text-muted-foreground",
  pending: "bg-amber-500/20 text-amber-700 dark:text-amber-400",
  success: "bg-emerald-500/20 text-emerald-700 dark:text-emerald-400",
  error: "bg-destructive/20 text-destructive",
  cancelled: "bg-slate-500/20 text-slate-700 dark:text-slate-300",
};

const WAIT_ATTEMPTS = 10;
const WAIT_DELAY_MS = 2000;

export function BulkWorkflowRunDialog({
  organization,
  repositories,
  workflows,
  open,
  onOpenChange,
  isLoadingWorkflows,
  loadError,
}: BulkWorkflowRunDialogProps) {
  const [sourceBranch, setSourceBranch] = useState("");
  const [selectedWorkflowNames, setSelectedWorkflowNames] = useState<string[]>([]);
  const [inputDefinitions, setInputDefinitions] = useState<
    AggregatedInputDefinition[]
  >([]);
  const [inputValues, setInputValues] = useState<Record<string, string>>({});
  const [workflowInputCache, setWorkflowInputCache] = useState<WorkflowInputCache>({});
  const workflowInputCacheRef = useRef<WorkflowInputCache>({});
  const [isFetchingInputs, setIsFetchingInputs] = useState(false);
  const [inputError, setInputError] = useState<string | null>(null);
  const [runSilently, setRunSilently] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const inputAbortControllerRef = useRef<AbortController | null>(null);
  const [hasDispatchedRuns, setHasDispatchedRuns] = useState(false);

  const [statuses, setStatuses] = useState<RepositoryStatus[]>([]);

  const selectedWorkflows = useMemo<SelectedWorkflowEntry[]>(() => {
    if (selectedWorkflowNames.length === 0 || workflows.length === 0) {
      return [];
    }

    const entries: SelectedWorkflowEntry[] = [];

    selectedWorkflowNames.forEach((name) => {
      const option = workflows.find((item) => item.name === name);
      if (!option) {
        return;
      }

      option.repositories.forEach((repoEntry) => {
        entries.push({
          ...repoEntry,
          workflowName: extractWorkflowName(name),
          key: buildWorkflowKey(repoEntry.repository, repoEntry.workflowId),
        });
      });
    });

    return entries.sort((a, b) => {
      if (a.repository === b.repository) {
        return a.workflowName.localeCompare(b.workflowName);
      }

      return a.repository.localeCompare(b.repository);
    });
  }, [selectedWorkflowNames, workflows]);

  useEffect(() => {
    workflowInputCacheRef.current = workflowInputCache;
  }, [workflowInputCache]);

  useEffect(() => {
    setStatuses((previous) => {
      const previousByKey = new Map(previous.map((entry) => [entry.key, entry]));

      const next = selectedWorkflows.map((entry) => {
        const existing = previousByKey.get(entry.key);

        if (existing) {
          return existing;
        }

        return {
          key: entry.key,
          repository: entry.repository,
          workflowName: entry.workflowName,
          status: "idle" as RepositoryActionStatus,
        };
      });

      if (
        previous.length === next.length &&
        previous.every((item, index) => item.key === next[index].key)
      ) {
        return previous;
      }

      return next;
    });
  }, [selectedWorkflows]);

  // Temporarily disabled the status update effect
  // useEffect(() => {
  //   setStatuses(selectedWorkflows.map((entry) => ({
  //     key: entry.key,
  //     repository: entry.repository,
  //     workflowName: entry.workflowName,
  //     status: "idle" as RepositoryActionStatus,
  //   })));
  // }, [selectedWorkflows.map(w => w.key).join(',')]);

  useEffect(() => {
    if (open) {
      setSourceBranch("");
      setSelectedWorkflowNames([]);
      setInputDefinitions([]);
      setInputValues({});
      setInputError(null);
      setRunSilently(false);
      setWorkflowInputCache({});
      setStatuses([]);
      setIsRunning(false);
      abortControllerRef.current?.abort();
      abortControllerRef.current = null;
      inputAbortControllerRef.current?.abort();
      inputAbortControllerRef.current = null;
      setHasDispatchedRuns(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open || selectedWorkflows.length === 0) {
      setInputDefinitions([]);
      setInputValues({});
      setInputError(null);
      return;
    }

    inputAbortControllerRef.current?.abort();
    const controller = new AbortController();
    inputAbortControllerRef.current = controller;
    setIsFetchingInputs(true);
    setInputError(null);

    const loadInputs = async () => {
      const cacheCopy: WorkflowInputCache = { ...workflowInputCacheRef.current };
      let cacheUpdated = false;
      const aggregated = new Map<string, AggregatedInputDefinition>();

      for (const entry of selectedWorkflows) {
        const cacheKey = buildInputCacheKey(
          entry.repository,
          entry.workflowId,
          entry.workflowPath
        );

        let definitions = cacheCopy[cacheKey];

        if (!definitions) {
          try {
            definitions = await fetchWorkflowInputs(
              organization,
              entry.repository,
              entry.workflowPath,
              controller.signal
            );
            cacheCopy[cacheKey] = definitions;
            cacheUpdated = true;
          } catch (error) {
            if (controller.signal.aborted) {
              return;
            }

            if (error instanceof GithubApiError) {
              setInputError(error.message);
            } else if (error instanceof Error) {
              setInputError(error.message);
            } else {
              setInputError("Unable to load workflow inputs.");
            }
            return;
          }
        }

        definitions.forEach((definition) => {
          const existing = aggregated.get(definition.id);

          if (!existing) {
            aggregated.set(definition.id, {
              ...definition,
              required: Boolean(definition.required),
              requiredBy: definition.required ? [entry.workflowName] : [],
              repositories: [entry.repository],
              workflows: [entry.workflowName],
            });
            return;
          }

          if (definition.required) {
            existing.requiredBy = Array.from(
              new Set([...existing.requiredBy, entry.workflowName])
            );
            existing.required = true;
          }

          existing.repositories = Array.from(
            new Set([...existing.repositories, entry.repository])
          );
          existing.workflows = Array.from(
            new Set([...existing.workflows, entry.workflowName])
          );

          if (definition.defaultValue && !existing.defaultValue) {
            existing.defaultValue = definition.defaultValue;
          }

          if (definition.options?.length) {
            existing.options = Array.from(
              new Set([...(existing.options ?? []), ...definition.options])
            );
          }
        });
      }

      if (cacheUpdated) {
        workflowInputCacheRef.current = cacheCopy;
        setWorkflowInputCache(cacheCopy);
      }
      const aggregatedList = Array.from(aggregated.values()).sort((a, b) =>
        a.label.localeCompare(b.label)
      );
      setInputDefinitions(aggregatedList);
      setInputValues((prev) => {
        const next = { ...prev };
        aggregatedList.forEach((definition) => {
          if (next[definition.id] === undefined) {
            next[definition.id] = String(definition.defaultValue ?? "");
          }
        });
        return next;
      });
    };

    loadInputs().finally(() => {
      if (!controller.signal.aborted) {
        setIsFetchingInputs(false);
      }
    });

    return () => {
      controller.abort();
    };
  }, [organization, open, selectedWorkflows]);

  const updateStatus = useCallback(
    (
      workflowKey: string,
      status: RepositoryActionStatus,
      message?: string,
      runUrl?: string
    ) => {
      setStatuses((previous) =>
        previous.map((entry) =>
          entry.key === workflowKey ? { ...entry, status, message, runUrl } : entry
        )
      );
    },
    []
  );

  const handleInputChange = useCallback(
    (key: string) => (event: ChangeEvent<HTMLInputElement>) => {
      setInputValues((prev) => ({ ...prev, [key]: event.target.value }));
    },
    []
  );

  const handleCheckboxChange = useCallback(
    (checked: boolean | "indeterminate") => {
      setRunSilently(checked === true);
    },
    []
  );

  const handleWorkflowSelection = useCallback(
    (workflowName: string, checked: boolean) => {
      setSelectedWorkflowNames((prev) => {
        if (checked) {
          if (prev.includes(workflowName)) {
            return prev;
          }

          return [...prev, workflowName];
        }

        return prev.filter((name) => name !== workflowName);
      });
    },
    []
  );

  const handleCreateRuns = useCallback(async () => {
    if (selectedWorkflows.length === 0 || !sourceBranch.trim()) {
      return;
    }

    setIsRunning(true);
    setHasDispatchedRuns(true);
    const controller = new AbortController();
    abortControllerRef.current = controller;

    const tasks = selectedWorkflows.map((entry) =>
      (async () => {
        if (controller.signal.aborted) {
          updateStatus(entry.key, "cancelled", "Operation cancelled.");
          return;
        }

        updateStatus(entry.key, "pending", "Dispatching workflow...");

        // Get the specific inputs for this workflow
        const cacheKey = buildInputCacheKey(
          entry.repository,
          entry.workflowId,
          entry.workflowPath
        );
        const workflowInputs = workflowInputCacheRef.current[cacheKey] ?? [];

        // Filter inputs to only include those defined for this specific workflow
        const inputsPayload = runSilently
          ? undefined
          : workflowInputs.reduce<Record<string, string>>((acc, definition) => {
              const value = String(inputValues[definition.id] ?? "").trim();
              if (value) {
                acc[definition.id] = value;
              }
              return acc;
            }, {});

        try {
          await dispatchWorkflow(
            organization,
            entry.repository,
            entry.workflowId,
            sourceBranch.trim(),
            inputsPayload,
            controller.signal
          );

          if (controller.signal.aborted) {
            updateStatus(entry.key, "cancelled", "Operation cancelled.");
            return;
          }

          updateStatus(entry.key, "pending", "Waiting for run to begin...");

          const runUrl = await waitForRunUrl(
            organization,
            entry.repository,
            entry.workflowId,
            sourceBranch.trim(),
            controller.signal
          );

          if (controller.signal.aborted) {
            updateStatus(entry.key, "cancelled", "Operation cancelled.");
            return;
          }

          updateStatus(
            entry.key,
            "success",
            runUrl
              ? "Workflow dispatched."
              : "Workflow dispatched (run pending).",
            runUrl ?? `${entry.workflowHtmlUrl}/runs`
          );
        } catch (error) {
          if (controller.signal.aborted) {
            updateStatus(entry.key, "cancelled", "Operation cancelled.");
            return;
          }

          let message = "Unexpected error";
          if (error instanceof GithubApiError) {
            message = error.message;
          } else if (error instanceof Error) {
            message = error.message;
          }

          updateStatus(entry.key, "error", message);
        }
      })()
    );

    await Promise.allSettled(tasks);

    abortControllerRef.current = null;
    setIsRunning(false);
  }, [
    inputDefinitions,
    inputValues,
    organization,
    runSilently,
    selectedWorkflows,
    sourceBranch,
    updateStatus,
  ]);

  const handleCancel = useCallback(() => {
    const controller = abortControllerRef.current;
    if (controller) {
      controller.abort();
      abortControllerRef.current = null;
    }

    setStatuses((previous) =>
      previous.map((entry) =>
        entry.status === "pending"
          ? { ...entry, status: "cancelled", message: "Operation cancelled." }
          : entry
      )
    );
    setIsRunning(false);
  }, []);

  const handleDialogOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) {
        handleCancel();
      }

      onOpenChange(nextOpen);
    },
    [handleCancel, onOpenChange]
  );

  const hasSucceeded = statuses.some((entry) => entry.status === "success");

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogContent className="flex h-[80vh] max-w-3xl flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle>Run workflows</DialogTitle>
          <DialogDescription>
            Select one or more workflows from the available repositories, provide the branch and inputs, then queue runs in bulk.
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto space-y-4 pr-1">
          {loadError ? (
            <p className="text-sm text-destructive">{loadError}</p>
          ) : null}

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="workflow-select">Workflows</Label>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full justify-between"
                    disabled={isLoadingWorkflows || isRunning}
                  >
                    {selectedWorkflowNames.length === 0
                      ? "Select workflows"
                      : `${selectedWorkflowNames.length} workflow${
                          selectedWorkflowNames.length === 1 ? "" : "s"
                        } selected`}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-full max-h-80 overflow-y-auto">
                  <DropdownMenuLabel>Available Workflows</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {workflows.length ? (
                    workflows.map((option) => (
                      <DropdownMenuCheckboxItem
                        key={option.name}
                        checked={selectedWorkflowNames.includes(option.name)}
                        onCheckedChange={(checked) =>
                          handleWorkflowSelection(option.name, checked)
                        }
                      >
                        {option.name}
                      </DropdownMenuCheckboxItem>
                    ))
                  ) : (
                    <div className="px-2 py-1 text-sm text-muted-foreground">
                      {isLoadingWorkflows ? "Loading..." : "No workflows available"}
                    </div>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <div className="space-y-2">
              <Label htmlFor="source-branch-run">Branch</Label>
              <Input
                id="source-branch-run"
                placeholder="main"
                value={sourceBranch}
                onChange={(event) => setSourceBranch(event.target.value)}
                disabled={isRunning}
              />
            </div>

            {inputDefinitions.length ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Inputs</Label>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="run-silently"
                      checked={runSilently}
                      onCheckedChange={handleCheckboxChange}
                      disabled={isRunning}
                    />
                    <Label
                      htmlFor="run-silently"
                      className="text-xs text-muted-foreground"
                    >
                      Do not send inputs (use defaults)
                    </Label>
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  {inputDefinitions.map((definition) => (
                    <div key={definition.id} className="space-y-1">
                      <Label
                        htmlFor={`input-${definition.id}`}
                        className="text-xs uppercase text-muted-foreground"
                      >
                        {definition.label}
                      </Label>
                      <Input
                        id={`input-${definition.id}`}
                        value={inputValues[definition.id] ?? ""}
                        onChange={handleInputChange(definition.id)}
                        disabled={isRunning || runSilently}
                      />
                      {definition.description ? (
                        <p className="text-xs text-muted-foreground">
                          {definition.description}
                        </p>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {inputError ? (
              <p className="text-sm text-destructive">{inputError}</p>
            ) : isFetchingInputs ? (
              <p className="text-sm text-muted-foreground">
                Loading workflow inputs...
              </p>
            ) : null}

            <Separator />

            <div className="space-y-2">
              <h4 className="text-sm font-semibold">Progress</h4>
              <ul className="space-y-2">
                {statuses.map((entry) => (
                  <li
                    key={entry.key}
                    className="flex items-start justify-between gap-4 rounded-md border p-3 text-sm"
                  >
                    <div className="space-y-1">
                      <p className="font-medium">
                        {entry.repository} - {entry.workflowName}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {entry.message ?? "Awaiting action."}
                      </p>
                      {entry.status === "success" && entry.runUrl ? (
                        <a
                          href={entry.runUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                        >
                          View runs
                          <ExternalLink className="h-3 w-3" aria-hidden="true" />
                        </a>
                      ) : null}
                    </div>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-medium ${
                        STATUS_STYLE[entry.status]
                      }`}
                    >
                      {entry.status.charAt(0).toUpperCase() +
                        entry.status.slice(1)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
        <DialogFooter className="shrink-0 flex flex-col gap-2 sm:flex-row sm:justify-between">
          <Button
            type="button"
            variant="ghost"
            onClick={handleCancel}
            disabled={!isRunning}
          >
            Cancel
          </Button>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleDialogOpenChange(false)}
              disabled={isRunning}
            >
              Close
            </Button>
            <Button
              type="button"
              onClick={handleCreateRuns}
              disabled={
                isRunning ||
                isLoadingWorkflows ||
                selectedWorkflows.length === 0 ||
                !sourceBranch.trim() ||
                repositories.length === 0 ||
                hasDispatchedRuns ||
                (inputDefinitions.length > 0 &&
                  !runSilently &&
                  inputDefinitions.some(
                    (definition) =>
                      definition.required && !String(inputValues[definition.id] ?? "").trim()
                  ))
              }
            >
              {isRunning
                ? "Running..."
                : hasSucceeded
                ? "Completed"
                : "Run workflows"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
