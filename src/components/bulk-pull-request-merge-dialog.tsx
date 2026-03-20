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
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { ExternalLink } from "lucide-react";

import {
  mergePullRequest,
  type PullRequestMergeMethod,
} from "@/lib/github/merge-pull-request";
import type { PullRequestSelectionEntry } from "@/hooks/use-pull-request-selection";
import { GithubApiError } from "@/lib/github/client";

export interface BulkPullRequestMergeDialogProps {
  organization: string;
  pullRequests: PullRequestSelectionEntry[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCompleted?: () => void;
}

type RepositoryActionStatus =
  | "idle"
  | "pending"
  | "success"
  | "error"
  | "cancelled";

interface PullRequestStatusEntry {
  repository: string;
  pullNumber: number;
  title: string;
  url: string;
  status: RepositoryActionStatus;
  message?: string;
}

const STATUS_STYLE: Record<RepositoryActionStatus, string> = {
  idle: "bg-muted text-muted-foreground",
  pending: "bg-amber-500/20 text-amber-700 dark:text-amber-400",
  success: "bg-emerald-500/20 text-emerald-700 dark:text-emerald-400",
  error: "bg-destructive/20 text-destructive",
  cancelled: "bg-slate-500/20 text-slate-700 dark:text-slate-300",
};

const MERGE_METHOD_LABELS: Record<PullRequestMergeMethod, string> = {
  merge: "Merge commit",
  squash: "Squash and merge",
  rebase: "Rebase and merge",
};

const DEFAULT_MERGE_METHOD: PullRequestMergeMethod = "squash";

export function BulkPullRequestMergeDialog({
  organization,
  pullRequests,
  open,
  onOpenChange,
  onCompleted,
}: BulkPullRequestMergeDialogProps) {
  const [commitTitle, setCommitTitle] = useState("");
  const [commitMessage, setCommitMessage] = useState("");
  const [mergeMethod, setMergeMethod] =
    useState<PullRequestMergeMethod>(DEFAULT_MERGE_METHOD);
  const [isRunning, setIsRunning] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const sortedPullRequests = useMemo(() => {
    return [...pullRequests].sort((a, b) => {
      if (a.repository === b.repository) {
        return a.number - b.number;
      }
      return a.repository.localeCompare(b.repository);
    });
  }, [pullRequests]);

  const initialStatuses = useMemo<PullRequestStatusEntry[]>(
    () =>
      sortedPullRequests.map((entry) => ({
        repository: entry.repository,
        pullNumber: entry.number,
        status: "idle",
        title: entry.title,
        url: entry.url,
      })),
    [sortedPullRequests],
  );

  const [statuses, setStatuses] =
    useState<PullRequestStatusEntry[]>(initialStatuses);

  useEffect(() => {
    if (open) {
      const first = sortedPullRequests[0];
      if (first) {
        setCommitTitle(`Merge PR #${first.number}: ${first.title}`);
        setCommitMessage(`Merges PR #${first.number}: ${first.title}`);
      } else {
        setCommitTitle("");
        setCommitMessage("");
      }
      setMergeMethod(DEFAULT_MERGE_METHOD);
      setStatuses(initialStatuses);
      setIsRunning(false);
      abortControllerRef.current?.abort();
      abortControllerRef.current = null;
    }
  }, [initialStatuses, open, sortedPullRequests]);

  const updateStatus = useCallback(
    (
      repository: string,
      pullNumber: number,
      status: RepositoryActionStatus,
      message?: string,
    ) => {
      setStatuses((previous) =>
        previous.map((entry) =>
          entry.repository === repository && entry.pullNumber === pullNumber
            ? { ...entry, status, message }
            : entry,
        ),
      );
    },
    [],
  );

  const handleMerge = useCallback(async () => {
    if (sortedPullRequests.length === 0) {
      return;
    }

    const trimmedTitle = commitTitle.trim();
    const trimmedMessage = commitMessage.trim();

    if (!trimmedTitle) {
      setCommitTitle("");
      return;
    }

    setIsRunning(true);
    const controller = new AbortController();
    abortControllerRef.current = controller;

    for (const entry of sortedPullRequests) {
      if (controller.signal.aborted) {
        break;
      }

      updateStatus(
        entry.repository,
        entry.number,
        "pending",
        "Merging pull request...",
      );

      try {
        const response = await mergePullRequest(
          organization,
          entry.repository,
          entry.number,
          {
            commitTitle: trimmedTitle,
            commitMessage: trimmedMessage,
            method: mergeMethod,
            sha: entry.headSha,
            signal: controller.signal,
          },
        );

        if (response && "merged" in response && response.merged) {
          updateStatus(
            entry.repository,
            entry.number,
            "success",
            response.message || "Pull request merged successfully.",
          );
        } else {
          const message = response?.message ?? "Merge failed.";
          updateStatus(entry.repository, entry.number, "error", message);
        }
      } catch (error) {
        if (controller.signal.aborted) {
          updateStatus(entry.repository, entry.number, "cancelled");
          break;
        }

        let message = "Unexpected error";
        if (error instanceof GithubApiError) {
          message = error.message;
        } else if (error instanceof Error) {
          message = error.message;
        }

        updateStatus(entry.repository, entry.number, "error", message);
      }
    }

    abortControllerRef.current = null;
    setIsRunning(false);
    onCompleted?.();
  }, [
    commitMessage,
    commitTitle,
    mergeMethod,
    onCompleted,
    organization,
    sortedPullRequests,
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
          : entry,
      ),
    );
    setIsRunning(false);
  }, []);

  const handleClose = useCallback(() => {
    if (isRunning) {
      handleCancel();
    }
    onOpenChange(false);
  }, [handleCancel, isRunning, onOpenChange]);

  const handleMethodChange = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) => {
      const nextMethod = event.target.value as PullRequestMergeMethod;
      setMergeMethod(nextMethod);
    },
    [],
  );

  const allCompleted = statuses.every(
    (entry) =>
      entry.status === "success" ||
      entry.status === "error" ||
      entry.status === "cancelled",
  );
  const successfulCount = statuses.filter(
    (entry) => entry.status === "success",
  ).length;
  const hasAnyAttempt = statuses.some((entry) => entry.status !== "idle");

  const defaultButtonLabel = (() => {
    if (isRunning) {
      return "Merging...";
    }

    if (successfulCount > 0 && successfulCount === statuses.length) {
      return "Completed";
    }

    if (hasAnyAttempt) {
      return "Retry pending merges";
    }

    return "Merge pull requests";
  })();

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl" scrollable>
        <DialogHeader>
          <DialogTitle>Merge pull requests</DialogTitle>
          <DialogDescription>
            Provide merge details. The selected pull requests will be merged
            sequentially.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="commit-title">Commit title</Label>
              <Input
                id="commit-title"
                placeholder="Merge PR #123: Add feature"
                value={commitTitle}
                onChange={(event) => setCommitTitle(event.target.value)}
                disabled={isRunning}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="merge-method">Merge method</Label>
              <select
                id="merge-method"
                className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                value={mergeMethod}
                onChange={handleMethodChange}
                disabled={isRunning}
              >
                {Object.entries(MERGE_METHOD_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="commit-message">Commit message</Label>
            <Textarea
              id="commit-message"
              placeholder="Provide context for this merge commit."
              rows={4}
              value={commitMessage}
              onChange={(event) => setCommitMessage(event.target.value)}
              disabled={isRunning}
            />
          </div>

          <Separator />

          <div>
            <h4 className="text-sm font-semibold">Progress</h4>
            <ul className="mt-2 space-y-2">
              {statuses.map((entry) => (
                <li
                  key={`${entry.repository}-${entry.pullNumber}`}
                  className="flex flex-col gap-2 rounded-md border p-3 text-sm md:flex-row md:items-start md:justify-between"
                >
                  <div className="space-y-1">
                    <p className="font-medium">
                      {entry.repository} • PR #{entry.pullNumber}
                    </p>
                    <a
                      href={entry.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      View on GitHub
                      <ExternalLink className="h-3 w-3" aria-hidden="true" />
                    </a>
                    <p className="text-xs text-muted-foreground">
                      {entry.message ?? "Awaiting action."}
                    </p>
                  </div>
                  <span
                    className={`self-start rounded-full px-3 py-1 text-xs font-medium ${STATUS_STYLE[entry.status]}`}
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
              onClick={handleClose}
              disabled={isRunning && !allCompleted}
            >
              Close
            </Button>
            <Button
              type="button"
              onClick={handleMerge}
              disabled={
                isRunning ||
                sortedPullRequests.length === 0 ||
                !commitTitle.trim() ||
                !commitMessage.trim()
              }
            >
              {defaultButtonLabel}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
