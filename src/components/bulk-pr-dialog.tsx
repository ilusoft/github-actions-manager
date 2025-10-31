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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { createPullRequest } from "@/lib/github/pull-requests";
import { GithubApiError } from "@/lib/github/client";
import { ExternalLink } from "lucide-react";

interface BulkPrDialogProps {
  organization: string;
  repositories: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
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
  pullRequestUrl?: string;
}

const STATUS_STYLE: Record<RepositoryActionStatus, string> = {
  idle: "bg-muted text-muted-foreground",
  pending: "bg-amber-500/20 text-amber-700 dark:text-amber-400",
  success: "bg-emerald-500/20 text-emerald-700 dark:text-emerald-400",
  error: "bg-destructive/20 text-destructive",
  cancelled: "bg-slate-500/20 text-slate-700 dark:text-slate-300",
};

export function BulkPrDialog({
  organization,
  repositories,
  open,
  onOpenChange,
}: BulkPrDialogProps) {
  const [sourceBranch, setSourceBranch] = useState("");
  const [targetBranch, setTargetBranch] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const initialStatuses = useMemo<RepositoryStatus[]>(
    () => repositories.map((name) => ({ name, status: "idle" })),
    [repositories]
  );
  const [statuses, setStatuses] = useState<RepositoryStatus[]>(initialStatuses);

  useEffect(() => {
    if (open) {
      setSourceBranch("");
      setTargetBranch("");
      setTitle("");
      setDescription("");
      setStatuses(initialStatuses);
      setIsRunning(false);
      abortControllerRef.current?.abort();
      abortControllerRef.current = null;
    }
  }, [open, initialStatuses]);

  const updateStatus = useCallback(
    (
      repository: string,
      status: RepositoryActionStatus,
      message?: string,
      pullRequestUrl?: string
    ) => {
      setStatuses((previous) =>
        previous.map((entry) =>
          entry.name === repository
            ? { ...entry, status, message, pullRequestUrl }
            : entry
        )
      );
    },
    []
  );

  const handleCreatePullRequests = useCallback(async () => {
    const trimmedSource = sourceBranch.trim();
    const trimmedTarget = targetBranch.trim();
    const trimmedTitle = title.trim();
    const trimmedDescription = description.trim();

    if (!trimmedSource || !trimmedTarget || !trimmedTitle) {
      return;
    }

    setIsRunning(true);
    const controller = new AbortController();
    abortControllerRef.current = controller;

    for (const repository of repositories) {
      if (controller.signal.aborted) {
        break;
      }

      updateStatus(repository, "pending", "Creating pull request...");

      try {
        const response = await createPullRequest(
          organization,
          repository,
          trimmedTitle,
          trimmedSource,
          trimmedTarget,
          trimmedDescription || undefined,
          false, // draft = false
          controller.signal
        );

        updateStatus(
          repository,
          "success",
          "Pull request created successfully.",
          response.html_url
        );
      } catch (error) {
        if (controller.signal.aborted) {
          updateStatus(repository, "cancelled", "Operation cancelled.");
          break;
        }

        let message = "Unexpected error";
        if (error instanceof GithubApiError) {
          if (error.status === 422) {
            message = "Pull request already exists or branch not found.";
          } else {
            message = error.message;
          }
        } else if (error instanceof Error) {
          message = error.message;
        }

        updateStatus(repository, "error", message);
      }
    }

    abortControllerRef.current = null;
    setIsRunning(false);
  }, [
    description,
    organization,
    repositories,
    sourceBranch,
    targetBranch,
    title,
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

  const allCompleted = statuses.every(
    (entry) => entry.status === "success" || entry.status === "cancelled"
  );
  const hasSucceeded = statuses.some((entry) => entry.status === "success");

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Create pull requests</DialogTitle>
          <DialogDescription>
            Provide branch information and pull request details. The action will
            run sequentially across the selected repositories.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="source-branch">Source branch</Label>
              <Input
                id="source-branch"
                placeholder="feature/awesome"
                value={sourceBranch}
                onChange={(event) => setSourceBranch(event.target.value)}
                disabled={isRunning}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="target-branch">Destination branch</Label>
              <Input
                id="target-branch"
                placeholder="main"
                value={targetBranch}
                onChange={(event) => setTargetBranch(event.target.value)}
                disabled={isRunning}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="pr-title">Pull request title</Label>
            <Input
              id="pr-title"
              placeholder="Add awesome feature"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              disabled={isRunning}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="pr-description">Description</Label>
            <Textarea
              id="pr-description"
              placeholder="Describe the changes included in this pull request."
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              disabled={isRunning}
              rows={4}
            />
          </div>

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
                    {entry.status === "success" && entry.pullRequestUrl ? (
                      <a
                        href={entry.pullRequestUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                      >
                        View pull request
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
              disabled={isRunning && !allCompleted}
            >
              Close
            </Button>
            <Button
              type="button"
              onClick={handleCreatePullRequests}
              disabled={
                isRunning ||
                !sourceBranch.trim() ||
                !targetBranch.trim() ||
                !title.trim() ||
                repositories.length === 0 ||
                hasSucceeded
              }
            >
              {isRunning
                ? "Running..."
                : hasSucceeded
                ? "Completed"
                : "Create pull requests"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
