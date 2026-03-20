import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { closePullRequest } from "@/lib/github/pull-requests";
import type { PullRequestSelectionEntry } from "@/hooks/use-pull-request-selection";
import { GithubApiError } from "@/lib/github/client";

export interface BulkClosePullRequestDialogProps {
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

export function BulkClosePullRequestDialog({
  organization,
  pullRequests,
  open,
  onOpenChange,
  onCompleted,
}: BulkClosePullRequestDialogProps) {
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
        title: entry.title,
        url: entry.url,
        status: "idle",
      })),
    [sortedPullRequests],
  );
  const [statuses, setStatuses] =
    useState<PullRequestStatusEntry[]>(initialStatuses);

  useEffect(() => {
    if (open) {
      setStatuses(initialStatuses);
      setIsRunning(false);
      abortControllerRef.current?.abort();
      abortControllerRef.current = null;
    }
  }, [open, initialStatuses]);

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

  const handleClosePullRequests = useCallback(async () => {
    setIsRunning(true);
    const controller = new AbortController();
    abortControllerRef.current = controller;

    for (const pullRequest of sortedPullRequests) {
      if (controller.signal.aborted) {
        break;
      }

      updateStatus(
        pullRequest.repository,
        pullRequest.number,
        "pending",
        "Closing pull request...",
      );

      try {
        await closePullRequest({
          organization,
          repository: pullRequest.repository,
          pullNumber: pullRequest.number,
          signal: controller.signal,
        });

        updateStatus(
          pullRequest.repository,
          pullRequest.number,
          "success",
          "Pull request closed successfully.",
        );
      } catch (error) {
        if (controller.signal.aborted) {
          updateStatus(
            pullRequest.repository,
            pullRequest.number,
            "cancelled",
            "Operation cancelled.",
          );
          break;
        }

        let message = "Unexpected error";
        if (error instanceof GithubApiError) {
          if (error.status === 404) {
            message = "Pull request not found.";
          } else if (error.status === 422) {
            message = "Pull request already closed or merged.";
          } else {
            message = error.message;
          }
        } else if (error instanceof Error) {
          message = error.message;
        }

        updateStatus(
          pullRequest.repository,
          pullRequest.number,
          "error",
          message,
        );
      }
    }

    abortControllerRef.current = null;
    setIsRunning(false);
  }, [organization, sortedPullRequests, updateStatus]);

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

  const handleDialogOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) {
        handleCancel();
      }

      onOpenChange(nextOpen);
    },
    [handleCancel, onOpenChange],
  );

  const allCompleted = statuses.every(
    (entry) =>
      entry.status === "success" ||
      entry.status === "cancelled" ||
      entry.status === "error",
  );
  const hasSucceeded = statuses.some((entry) => entry.status === "success");

  const handleClose = useCallback(() => {
    onCompleted?.();
    handleDialogOpenChange(false);
  }, [onCompleted, handleDialogOpenChange]);

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Close pull requests</DialogTitle>
          <DialogDescription>
            Close the selected pull requests. This action will run sequentially
            across the selected pull requests.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] overflow-y-auto pr-2">
          <div className="space-y-2">
            <h4 className="text-sm font-semibold">Pull requests to close</h4>
            <ul className="space-y-2">
              {statuses.map((entry) => (
                <li
                  key={`${entry.repository}-${entry.pullNumber}`}
                  className="flex items-start justify-between gap-4 rounded-md border p-3 text-sm"
                >
                  <div className="space-y-1">
                    <p className="font-medium">
                      {entry.repository} #{entry.pullNumber}
                    </p>
                    <p className="text-xs text-muted-foreground line-clamp-1">
                      {entry.title}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {entry.message ?? "Awaiting action."}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-medium whitespace-nowrap ${
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

        <Separator />

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
              onClick={handleClosePullRequests}
              disabled={isRunning || pullRequests.length === 0 || hasSucceeded}
            >
              {isRunning
                ? "Running..."
                : hasSucceeded
                  ? "Completed"
                  : "Close pull requests"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
