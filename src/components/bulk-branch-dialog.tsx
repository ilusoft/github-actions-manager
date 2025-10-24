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
import { Separator } from "@/components/ui/separator";
import { fetchBranchRef, createBranchRef } from "@/lib/github/branches";
import { GithubApiError } from "@/lib/github/client";
import { ExternalLink } from "lucide-react";

interface BulkBranchDialogProps {
  organization: string;
  repositories: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type RepositoryActionStatus = "idle" | "pending" | "success" | "error" | "cancelled";

interface RepositoryStatus {
  name: string;
  status: RepositoryActionStatus;
  message?: string;
  branchUrl?: string;
}

const STATUS_STYLE: Record<RepositoryActionStatus, string> = {
  idle: "bg-muted text-muted-foreground",
  pending: "bg-amber-500/20 text-amber-700 dark:text-amber-400",
  success: "bg-emerald-500/20 text-emerald-700 dark:text-emerald-400",
  error: "bg-destructive/20 text-destructive",
  cancelled: "bg-slate-500/20 text-slate-700 dark:text-slate-300",
};

export function BulkBranchDialog({
  organization,
  repositories,
  open,
  onOpenChange,
}: BulkBranchDialogProps) {
  const [baseBranch, setBaseBranch] = useState("");
  const [newBranch, setNewBranch] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const initialStatuses = useMemo<RepositoryStatus[]>(
    () => repositories.map((name) => ({ name, status: "idle" })),
    [repositories]
  );
  const [statuses, setStatuses] = useState<RepositoryStatus[]>(initialStatuses);

  useEffect(() => {
    if (open) {
      setBaseBranch("");
      setNewBranch("");
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
      branchUrl?: string
    ) => {
      setStatuses((previous) =>
        previous.map((entry) =>
          entry.name === repository
            ? { ...entry, status, message, branchUrl }
            : entry
        )
      );
    },
    []
  );

  const handleCreateBranches = useCallback(async () => {
    const trimmedBase = baseBranch.trim();
    const trimmedNew = newBranch.trim();

    if (!trimmedBase || !trimmedNew) {
      return;
    }

    setIsRunning(true);
    const controller = new AbortController();
    abortControllerRef.current = controller;

    for (const repository of repositories) {
      if (controller.signal.aborted) {
        break;
      }

      updateStatus(repository, "pending", "Creating branch...");

      try {
        const baseSha = await fetchBranchRef(
          organization,
          repository,
          trimmedBase,
          controller.signal
        );

        await createBranchRef(
          organization,
          repository,
          trimmedNew,
          baseSha,
          controller.signal
        );

        const branchUrl = `https://github.com/${organization}/${repository}/tree/${encodeURIComponent(trimmedNew)}`;
        updateStatus(
          repository,
          "success",
          "Branch created successfully.",
          branchUrl
        );
      } catch (error) {
        if (controller.signal.aborted) {
          updateStatus(repository, "cancelled", "Operation cancelled.");
          break;
        }

        let message = "Unexpected error";
        if (error instanceof GithubApiError) {
          if (error.status === 422) {
            message = `Branch "${trimmedNew}" already exists.`;
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
  }, [baseBranch, newBranch, organization, repositories, updateStatus]);

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
          <DialogTitle>Create branch in repositories</DialogTitle>
          <DialogDescription>
            Provide the base branch and the new branch name. The action will run sequentially across the
            selected repositories.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="base-branch">Base branch</Label>
              <Input
                id="base-branch"
                placeholder="e.g. main"
                value={baseBranch}
                onChange={(event) => setBaseBranch(event.target.value)}
                disabled={isRunning}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-branch">New branch name</Label>
              <Input
                id="new-branch"
                placeholder="e.g. feature/new-project"
                value={newBranch}
                onChange={(event) => setNewBranch(event.target.value)}
                disabled={isRunning}
              />
            </div>
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
                    {entry.status === "success" && entry.branchUrl ? (
                      <a
                        href={entry.branchUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                      >
                        View branch
                        <ExternalLink className="h-3 w-3" aria-hidden="true" />
                      </a>
                    ) : null}
                  </div>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-medium ${STATUS_STYLE[entry.status]}`}
                  >
                    {entry.status.charAt(0).toUpperCase() + entry.status.slice(1)}
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
              onClick={handleCreateBranches}
              disabled={
                isRunning ||
                !baseBranch.trim() ||
                !newBranch.trim() ||
                repositories.length === 0 ||
                hasSucceeded
              }
            >
              {isRunning ? "Running..." : hasSucceeded ? "Completed" : "Create branches"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
