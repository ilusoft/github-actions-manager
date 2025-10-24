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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
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
  type RepositoryWorkflowSummary,
} from "@/hooks/githubQueries";

export interface BulkWorkflowRepositoryEntry {
  repository: string;
  workflowId: number;
  workflowPath: string;
  workflowHtmlUrl: string;
}

const areInputDefinitionsEqual = (
  left: WorkflowDispatchInputDefinition[],
  right: WorkflowDispatchInputDefinition[]
): boolean => {
  if (left.length !== right.length) {
    return false;
  }

  const normalize = (definition: WorkflowDispatchInputDefinition) => ({
    id: definition.id,
    type: definition.type ?? "string",
    required: Boolean(definition.required),
    defaultValue: definition.defaultValue ?? "",
    options: [...(definition.options ?? [])].sort(),
  });

  const leftMap = new Map(
    left.map((definition) => [definition.id, normalize(definition)])
  );
  const rightMap = new Map(
    right.map((definition) => [definition.id, normalize(definition)])
  );

  if (leftMap.size !== rightMap.size) {
    return false;
  }

  for (const [id, leftDefinition] of leftMap.entries()) {
    const rightDefinition = rightMap.get(id);
    if (!rightDefinition) {
      return false;
    }

    if (leftDefinition.type !== rightDefinition.type) {
      return false;
    }

    if (leftDefinition.required !== rightDefinition.required) {
      return false;
    }

    if (leftDefinition.defaultValue !== rightDefinition.defaultValue) {
      return false;
    }

    if (leftDefinition.options.length !== rightDefinition.options.length) {
      return false;
    }

    for (let index = 0; index < leftDefinition.options.length; index += 1) {
      if (leftDefinition.options[index] !== rightDefinition.options[index]) {
        return false;
      }
    }
  }

  return true;
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
  loadError?: string;
  repositoryWorkflows: Record<string, RepositoryWorkflowSummary[]>;
}

type RepositoryActionStatus =
  | "idle"
  | "pending"
  | "success"
  | "error"
  | "cancelled";

interface RepositoryStatus {
  name: string;
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
  repositoryWorkflows,
}: BulkWorkflowRunDialogProps) {
  const [sourceBranch, setSourceBranch] = useState("");
  const [selectedWorkflowName, setSelectedWorkflowName] = useState<
    string | null
  >(null);
  const [inputDefinitions, setInputDefinitions] = useState<
    WorkflowDispatchInputDefinition[]
  >([]);
  const [inputValues, setInputValues] = useState<Record<string, string>>({});
  const [isFetchingInputs, setIsFetchingInputs] = useState(false);
  const [inputError, setInputError] = useState<string | null>(null);
  const [runSilently, setRunSilently] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const patternAbortControllerRef = useRef<AbortController | null>(null);
  const [pattern, setPattern] = useState("");
  const [patternOption, setPatternOption] = useState<BulkWorkflowOption | null>(
    null
  );
  const [patternError, setPatternError] = useState<string | null>(null);
  const [isMatchingPattern, setIsMatchingPattern] = useState(false);
  const [hasDispatchedRuns, setHasDispatchedRuns] = useState(false);

  const initialStatuses = useMemo<RepositoryStatus[]>(
    () => repositories.map((name) => ({ name, status: "idle" })),
    [repositories]
  );
  const [statuses, setStatuses] = useState<RepositoryStatus[]>(initialStatuses);

  const availableWorkflows = useMemo(() => {
    if (!patternOption) {
      return workflows;
    }

    const withoutDuplicate = workflows.filter(
      (option) => option.name !== patternOption.name
    );

    return [patternOption, ...withoutDuplicate];
  }, [patternOption, workflows]);

  const selectedWorkflow = useMemo(() => {
    if (!selectedWorkflowName) {
      return null;
    }

    return (
      availableWorkflows.find((item) => item.name === selectedWorkflowName) ??
      null
    );
  }, [availableWorkflows, selectedWorkflowName]);

  useEffect(() => {
    if (open) {
      setSourceBranch("");
      setSelectedWorkflowName(null);
      setInputDefinitions([]);
      setInputValues({});
      setInputError(null);
      setRunSilently(false);
      setStatuses(initialStatuses);
      setIsRunning(false);
      abortControllerRef.current?.abort();
      abortControllerRef.current = null;
      patternAbortControllerRef.current?.abort();
      patternAbortControllerRef.current = null;
      setPattern("");
      setPatternOption(null);
      setPatternError(null);
      setIsMatchingPattern(false);
      setHasDispatchedRuns(false);
    }
  }, [open, initialStatuses]);

  useEffect(() => {
    if (!selectedWorkflow || !open) {
      setInputDefinitions([]);
      setInputValues({});
      setInputError(null);
      return;
    }

    const firstRepository = selectedWorkflow.repositories[0];
    if (!firstRepository) {
      setInputDefinitions([]);
      setInputValues({});
      setInputError(null);
      return;
    }

    const controller = new AbortController();
    setIsFetchingInputs(true);
    setInputError(null);

    fetchWorkflowInputs(
      organization,
      firstRepository.repository,
      firstRepository.workflowPath,
      controller.signal
    )
      .then((definitions) => {
        setInputDefinitions(definitions);
        setInputValues(
          Object.fromEntries(
            definitions.map((definition) => [
              definition.id,
              definition.defaultValue ?? "",
            ])
          )
        );
      })
      .catch((error) => {
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
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsFetchingInputs(false);
        }
      });

    return () => {
      controller.abort();
    };
  }, [organization, open, selectedWorkflow]);

  const updateStatus = useCallback(
    (
      repository: string,
      status: RepositoryActionStatus,
      message?: string,
      runUrl?: string
    ) => {
      setStatuses((previous) =>
        previous.map((entry) =>
          entry.name === repository
            ? { ...entry, status, message, runUrl }
            : entry
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

  const handleApplyPattern = useCallback(async () => {
    const trimmedPattern = pattern.trim();

    patternAbortControllerRef.current?.abort();

    if (!trimmedPattern) {
      setPatternOption(null);
      setPatternError(null);
      setSelectedWorkflowName(null);
      return;
    }

    if (!organization) {
      setPatternError("Missing organization context for pattern matching.");
      setPatternOption(null);
      setSelectedWorkflowName(null);
      return;
    }

    if (repositories.length === 0) {
      setPatternError(
        "Select at least one repository before matching workflows."
      );
      setPatternOption(null);
      setSelectedWorkflowName(null);
      return;
    }

    const normalizedPattern = trimmedPattern.toLowerCase();
    const matches = [] as {
      repository: string;
      summary: RepositoryWorkflowSummary;
    }[];

    for (const repository of repositories) {
      const workflowsForRepo = repositoryWorkflows[repository] ?? [];
      const repoMatches = workflowsForRepo.filter((workflow) =>
        workflow.name.toLowerCase().includes(normalizedPattern)
      );

      if (repoMatches.length === 0) {
        setPatternError(
          `No workflows in repository "${repository}" match the provided pattern.`
        );
        setPatternOption(null);
        setSelectedWorkflowName(null);
        return;
      }

      if (repoMatches.length > 1) {
        setPatternError(
          `Pattern is ambiguous in repository "${repository}". Refine it to match a single workflow.`
        );
        setPatternOption(null);
        setSelectedWorkflowName(null);
        return;
      }

      matches.push({ repository, summary: repoMatches[0] });
    }

    const controller = new AbortController();
    patternAbortControllerRef.current = controller;
    setIsMatchingPattern(true);
    setPatternError(null);

    try {
      let referenceInputs: WorkflowDispatchInputDefinition[] | null = null;

      for (const match of matches) {
        const inputs = await fetchWorkflowInputs(
          organization,
          match.repository,
          match.summary.path,
          controller.signal
        );

        if (!referenceInputs) {
          referenceInputs = inputs;
          continue;
        }

        if (!areInputDefinitionsEqual(referenceInputs, inputs)) {
          setPatternError(
            "Matched workflows do not share the same dispatch inputs. Refine the pattern."
          );
          setPatternOption(null);
          setSelectedWorkflowName(null);
          return;
        }
      }

      const optionName = `Pattern: ${trimmedPattern}`;
      setPatternOption({
        name: optionName,
        repositories: matches.map(({ repository, summary }) => ({
          repository,
          workflowId: summary.id,
          workflowPath: summary.path,
          workflowHtmlUrl: summary.htmlUrl,
        })),
      });
      setSelectedWorkflowName(optionName);
      setPatternError(null);
    } catch (error) {
      if (controller.signal.aborted) {
        return;
      }

      if (error instanceof GithubApiError) {
        setPatternError(
          error.message || "Failed to load workflow inputs for comparison."
        );
      } else if (error instanceof Error) {
        setPatternError(error.message);
      } else {
        setPatternError("Unexpected error while matching pattern.");
      }
      setPatternOption(null);
      setSelectedWorkflowName(null);
    } finally {
      if (patternAbortControllerRef.current === controller) {
        patternAbortControllerRef.current = null;
      }
      setIsMatchingPattern(false);
    }
  }, [organization, pattern, repositories, repositoryWorkflows]);

  const handleCreateRuns = useCallback(async () => {
    if (!selectedWorkflow || !sourceBranch.trim()) {
      return;
    }

    setIsRunning(true);
    setHasDispatchedRuns(true);
    const controller = new AbortController();
    abortControllerRef.current = controller;

    const inputsPayload = runSilently
      ? undefined
      : inputDefinitions.reduce<Record<string, string>>(
          (acc, definition) => {
            const value = inputValues[definition.id]?.trim() ?? "";
            if (value) {
              acc[definition.id] = value;
            }
            return acc;
          },
          {}
        );

    const tasks = selectedWorkflow.repositories.map((entry) =>
      (async () => {
        if (controller.signal.aborted) {
          updateStatus(entry.repository, "cancelled", "Operation cancelled.");
          return;
        }

        updateStatus(entry.repository, "pending", "Dispatching workflow...");

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
            updateStatus(entry.repository, "cancelled", "Operation cancelled.");
            return;
          }

          updateStatus(entry.repository, "pending", "Waiting for run to begin...");

          const runUrl = await waitForRunUrl(
            organization,
            entry.repository,
            entry.workflowId,
            sourceBranch.trim(),
            controller.signal
          );

          if (controller.signal.aborted) {
            updateStatus(entry.repository, "cancelled", "Operation cancelled.");
            return;
          }

          updateStatus(
            entry.repository,
            "success",
            runUrl
              ? "Workflow dispatched."
              : "Workflow dispatched (run pending).",
            runUrl ?? `${entry.workflowHtmlUrl}/runs`
          );
        } catch (error) {
          if (controller.signal.aborted) {
            updateStatus(entry.repository, "cancelled", "Operation cancelled.");
            return;
          }

          let message = "Unexpected error";
          if (error instanceof GithubApiError) {
            message = error.message;
          } else if (error instanceof Error) {
            message = error.message;
          }

          updateStatus(entry.repository, "error", message);
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
    selectedWorkflow,
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
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Run workflows</DialogTitle>
          <DialogDescription>
            Select a workflow common to all repositories, provide the branch and
            inputs, then queue runs in bulk.
          </DialogDescription>
        </DialogHeader>

        {loadError ? (
          <p className="text-sm text-destructive">{loadError}</p>
        ) : null}

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="workflow-select">Workflow</Label>
            <div className="space-y-1">
              <Label
                htmlFor="workflow-pattern"
                className="text-xs uppercase text-muted-foreground"
              >
                Match pattern (optional)
              </Label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  id="workflow-pattern"
                  placeholder="e.g. deploy"
                  value={pattern}
                  onChange={(event) => setPattern(event.target.value)}
                  disabled={
                    isRunning || isLoadingWorkflows || isMatchingPattern
                  }
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleApplyPattern}
                  disabled={
                    isRunning ||
                    isLoadingWorkflows ||
                    isMatchingPattern ||
                    repositories.length === 0
                  }
                >
                  {isMatchingPattern ? "Matching..." : "Apply"}
                </Button>
              </div>
              {patternError ? (
                <p className="text-xs text-destructive">{patternError}</p>
              ) : null}
            </div>
            <Select
              value={selectedWorkflowName ?? undefined}
              onValueChange={(value) => setSelectedWorkflowName(value)}
              disabled={isLoadingWorkflows || isRunning}
            >
              <SelectTrigger id="workflow-select">
                <SelectValue
                  placeholder={
                    isLoadingWorkflows
                      ? "Loading workflows..."
                      : "Select workflow"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {availableWorkflows.length ? (
                  availableWorkflows.map((option) => (
                    <SelectItem key={option.name} value={option.name}>
                      {option.name}
                    </SelectItem>
                  ))
                ) : (
                  <SelectItem value="__none" disabled>
                    {isLoadingWorkflows
                      ? "Loading..."
                      : "No common workflows available"}
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
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
                  key={entry.name}
                  className="flex items-start justify-between gap-4 rounded-md border p-3 text-sm"
                >
                  <div className="space-y-1">
                    <p className="font-medium">{entry.name}</p>
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

        <DialogFooter className="flex flex-col gap-2 sm:flex-row sm:justify-between">
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
                !selectedWorkflow ||
                !sourceBranch.trim() ||
                repositories.length === 0 ||
                hasDispatchedRuns ||
                (inputDefinitions.length > 0 &&
                  !runSilently &&
                  inputDefinitions.some(
                    (definition) =>
                      definition.required && !inputValues[definition.id]?.trim()
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
