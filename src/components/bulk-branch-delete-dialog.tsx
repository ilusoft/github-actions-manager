import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
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
import { deleteBranchRef } from "@/lib/github/branches";
import { GithubApiError } from "@/lib/github/client";
import { AlertTriangle, Check, Loader2, Trash2 } from "lucide-react";

export interface BranchDeletionTarget {
  repository: string;
  branch: string;
}

export interface BulkBranchDeleteResult {
  deleted: BranchDeletionTarget[];
  failed: {
    target: BranchDeletionTarget;
    message: string;
  }[];
}

type BranchDeletionStatus = "idle" | "pending" | "success" | "error";

interface BranchDeletionState {
  target: BranchDeletionTarget;
  status: BranchDeletionStatus;
  message?: string;
}

interface BulkBranchDeleteDialogProps {
  organization: string;
  branches: BranchDeletionTarget[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCompleted: (result: BulkBranchDeleteResult) => void;
}

const STATUS_ICON: Record<BranchDeletionStatus, ReactNode> = {
  idle: null,
  pending: (
    <Loader2
      className="h-4 w-4 animate-spin text-muted-foreground"
      aria-hidden="true"
    />
  ),
  success: <Check className="h-4 w-4 text-emerald-500" aria-hidden="true" />,
  error: (
    <AlertTriangle className="h-4 w-4 text-destructive" aria-hidden="true" />
  ),
};

export function BulkBranchDeleteDialog({
  organization,
  branches,
  open,
  onOpenChange,
  onCompleted,
}: BulkBranchDeleteDialogProps) {
  const initialStatuses = useMemo<BranchDeletionState[]>(
    () =>
      branches.map((target) => ({
        target,
        status: "idle",
      })),
    [branches]
  );
  const [statuses, setStatuses] =
    useState<BranchDeletionState[]>(initialStatuses);
  const [isDeleting, setIsDeleting] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (open) {
      setStatuses(initialStatuses);
      setIsDeleting(false);
      abortControllerRef.current?.abort();
      abortControllerRef.current = null;
    }
  }, [open, initialStatuses]);

  const updateStatus = useCallback(
    (target: BranchDeletionTarget, update: Partial<BranchDeletionState>) => {
      setStatuses((previous) =>
        previous.map((entry) =>
          entry.target.repository === target.repository &&
          entry.target.branch === target.branch
            ? { ...entry, ...update }
            : entry
        )
      );
    },
    []
  );

  const handleDelete = useCallback(async () => {
    if (!branches.length || isDeleting) {
      return;
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;
    setIsDeleting(true);

    const deleted: BranchDeletionTarget[] = [];
    const failed: BulkBranchDeleteResult["failed"] = [];

    for (const target of branches) {
      if (controller.signal.aborted) {
        break;
      }

      updateStatus(target, {
        status: "pending",
        message: "Deleting branch...",
      });

      try {
        await deleteBranchRef(
          organization,
          target.repository,
          target.branch,
          controller.signal
        );
        deleted.push(target);
        updateStatus(target, { status: "success", message: "Branch deleted" });
      } catch (error) {
        let message = "Unexpected error";
        if (error instanceof GithubApiError) {
          message = error.message || `GitHub error (${error.status})`;
        } else if (error instanceof Error) {
          message = error.message;
        }

        failed.push({ target, message });
        updateStatus(target, { status: "error", message });
      }
    }

    abortControllerRef.current = null;
    setIsDeleting(false);

    onCompleted({ deleted, failed });
  }, [branches, isDeleting, onCompleted, organization, updateStatus]);

  const handleDialogChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) {
        abortControllerRef.current?.abort();
        abortControllerRef.current = null;
      }
      onOpenChange(nextOpen);
    },
    [onOpenChange]
  );

  const hasResults = statuses.some(
    (status) => status.status === "success" || status.status === "error"
  );

  return (
    <Dialog open={open} onOpenChange={handleDialogChange}>
      <DialogContent className="flex max-h-[80vh] max-w-2xl flex-col overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="space-y-2 border-b px-6 py-4">
          <DialogTitle>Delete branches</DialogTitle>
          <DialogDescription>
            Permanently delete the selected branches from GitHub. This action
            cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {branches.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Select at least one branch to enable this action.
            </p>
          ) : null}

          {branches.length > 0 ? (
            <ul className="space-y-2">
              {statuses.map(({ target, status, message }) => (
                <li
                  key={`${target.repository}/${target.branch}`}
                  className="flex items-start justify-between gap-4 rounded-md border p-3 text-sm"
                >
                  <div className="space-y-1">
                    <p className="font-medium">
                      {target.repository}{" "}
                      <span className="text-muted-foreground">/</span>{" "}
                      {target.branch}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {message ?? "Awaiting deletion."}
                    </p>
                  </div>
                  <div className="flex h-6 w-6 items-center justify-center">
                    {STATUS_ICON[status]}
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <DialogFooter className="flex flex-col gap-2 border-t px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              abortControllerRef.current?.abort();
              abortControllerRef.current = null;
              setIsDeleting(false);
              onOpenChange(false);
            }}
            disabled={isDeleting && !hasResults}
          >
            Cancel
          </Button>
          <div className="flex gap-2 self-end sm:self-auto">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isDeleting && !hasResults}
            >
              Close
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleDelete}
              disabled={isDeleting || branches.length === 0}
            >
              {isDeleting ? (
                <span className="flex items-center gap-2">
                  <Loader2
                    className="h-4 w-4 animate-spin"
                    aria-hidden="true"
                  />
                  Deleting…
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                  Delete branches
                </span>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
