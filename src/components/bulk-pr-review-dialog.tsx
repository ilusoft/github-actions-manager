import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { CheckIcon, MessageSquareIcon, XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import {
  submitPullRequestReview,
  type PullRequestReviewEvent,
} from "@/lib/github/pull-requests";
import type { PullRequestSelectionEntry } from "@/hooks/use-pull-request-selection";

export type BulkPRReviewStatus = "approve" | "request_changes" | "comment";

interface BulkPRReviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organization: string;
  selectedPullRequests: PullRequestSelectionEntry[];
  onCompleted?: (results: ReviewProgressEntry[]) => void;
}

export interface ReviewProgressEntry {
  key: string;
  repository: string;
  pullRequestNumber: number;
  status: "idle" | "pending" | "success" | "error" | "cancelled";
  message?: string;
}

const STATUS_ICONS = {
  idle: null,
  pending: null,
  success: <CheckIcon className="h-4 w-4" aria-hidden="true" />,
  error: <XIcon className="h-4 w-4" aria-hidden="true" />,
  cancelled: <XIcon className="h-4 w-4" aria-hidden="true" />,
};

const STATUS_CLASSES = {
  idle: "bg-muted text-muted-foreground",
  pending: "bg-muted text-muted-foreground",
  success: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  error: "bg-destructive/15 text-destructive",
  cancelled: "bg-muted text-muted-foreground",
};

const STATUS_LABELS = {
  idle: "Ready",
  pending: "Pending",
  success: "Approved",
  error: "Failed",
  cancelled: "Cancelled",
};

export function BulkPRReviewDialog({
  open,
  onOpenChange,
  organization,
  selectedPullRequests,
  onCompleted,
}: BulkPRReviewDialogProps) {
  const [reviewStatus, setReviewStatus] =
    useState<BulkPRReviewStatus>("comment");
  const [comment, setComment] = useState("");
  const [statuses, setStatuses] = useState<ReviewProgressEntry[]>([]);
  const hasNotifiedCompletion = useRef(false);

  useEffect(() => {
    if (!open) {
      setStatuses([]);
      hasNotifiedCompletion.current = false;
      return;
    }

    setStatuses(
      selectedPullRequests.map((entry) => ({
        key: `${entry.repository}-${entry.number}`,
        repository: entry.repository,
        pullRequestNumber: entry.number,
        status: "idle" as const,
        message: "Ready to submit review.",
      })),
    );
    hasNotifiedCompletion.current = false;
  }, [open, selectedPullRequests]);

  useEffect(() => {
    if (!open || !onCompleted) {
      return;
    }

    if (statuses.length === 0) {
      return;
    }

    const hasAttempt = statuses.some((entry) => entry.status !== "idle");
    if (!hasAttempt) {
      return;
    }

    const hasPending = statuses.some((entry) => entry.status === "pending");
    if (hasPending || hasNotifiedCompletion.current) {
      return;
    }

    hasNotifiedCompletion.current = true;
    onCompleted(statuses);
  }, [open, onCompleted, statuses]);

  const isRunning = statuses.some((entry) => entry.status === "pending");

  const mutation = useMutation({
    mutationFn: async ({
      repository,
      pullRequestNumber,
      status,
      comment,
    }: {
      repository: string;
      pullRequestNumber: number;
      status: BulkPRReviewStatus;
      comment: string;
    }) => {
      const event: PullRequestReviewEvent =
        status === "approve"
          ? "APPROVE"
          : status === "request_changes"
            ? "REQUEST_CHANGES"
            : "COMMENT";

      return submitPullRequestReview({
        organization,
        repository,
        pullNumber: pullRequestNumber,
        event,
        body: comment,
      });
    },
    onError: (error, variables) => {
      updateStatus(
        variables.repository,
        variables.pullRequestNumber,
        "error",
        error.message,
      );
    },
  });

  const updateStatus = useCallback(
    (
      repository: string,
      pullRequestNumber: number,
      status: ReviewProgressEntry["status"],
      message?: string,
    ) => {
      const key = `${repository}-${pullRequestNumber}`;
      setStatuses((prev) => {
        const existing = prev.find((entry) => entry.key === key);
        if (existing) {
          return prev.map((entry) =>
            entry.key === key ? { ...entry, status, message } : entry,
          );
        }
        return [
          ...prev,
          { key, repository, pullRequestNumber, status, message },
        ];
      });
    },
    [],
  );

  const handleCreateReviews = useCallback(async () => {
    if (!organization || selectedPullRequests.length === 0) {
      return;
    }

    setStatuses(() =>
      selectedPullRequests.map((entry) => ({
        key: `${entry.repository}-${entry.number}`,
        repository: entry.repository,
        pullRequestNumber: entry.number,
        status: "pending" as const,
        message: "Submitting review...",
      })),
    );

    const tasks = selectedPullRequests.map((entry) =>
      mutation
        .mutateAsync({
          repository: entry.repository,
          pullRequestNumber: entry.number,
          status: reviewStatus,
          comment,
        })
        .then(() => {
          updateStatus(
            entry.repository,
            entry.number,
            "success",
            "Review submitted successfully",
          );
        })
        .catch((error) => {
          updateStatus(entry.repository, entry.number, "error", error.message);
        }),
    );

    await Promise.allSettled(tasks);
  }, [
    organization,
    selectedPullRequests,
    reviewStatus,
    comment,
    mutation,
    updateStatus,
  ]);

  const handleCancel = useCallback(() => {
    setStatuses((prev) =>
      prev.map((entry) =>
        entry.status === "pending"
          ? { ...entry, status: "cancelled", message: "Operation cancelled." }
          : entry,
      ),
    );
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

  const hasSucceeded = statuses.some((entry) => entry.status === "success");
  const hasErrors = statuses.some((entry) => entry.status === "error");

  const isValid = comment.trim().length > 0 || reviewStatus === "approve";

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogContent className="max-w-2xl" scrollable>
        <DialogHeader>
          <DialogTitle>Review pull requests</DialogTitle>
          <DialogDescription>
            Submit reviews for multiple pull requests across repositories.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="review-status">Review action</Label>
            <Select
              value={reviewStatus}
              onValueChange={(value: BulkPRReviewStatus) =>
                setReviewStatus(value)
              }
              disabled={isRunning}
            >
              <SelectTrigger id="review-status">
                <SelectValue placeholder="Select review action" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="approve">
                  <div className="flex items-center gap-2">
                    <CheckIcon className="h-4 w-4" />
                    <span>Approve</span>
                  </div>
                </SelectItem>
                <SelectItem value="request_changes">
                  <div className="flex items-center gap-2">
                    <XIcon className="h-4 w-4" />
                    <span>Request Changes</span>
                  </div>
                </SelectItem>
                <SelectItem value="comment">
                  <div className="flex items-center gap-2">
                    <MessageSquareIcon className="h-4 w-4" />
                    <span>Comment</span>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="review-comment">
              Comment {reviewStatus === "approve" ? "(optional)" : "(required)"}
            </Label>
            <Textarea
              id="review-comment"
              placeholder={
                reviewStatus === "approve"
                  ? "Optional approval comment..."
                  : "Enter your review comment..."
              }
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              disabled={isRunning}
              rows={4}
            />
          </div>

          {!isValid && !isRunning && (
            <p className="text-sm text-destructive">
              Comment is required for request changes and comments.
            </p>
          )}

          <Separator />

          <div className="space-y-2">
            <h4 className="text-sm font-semibold">Progress</h4>
            <ul className="space-y-2 max-h-60 overflow-y-auto">
              {statuses.map((entry) => (
                <li
                  key={entry.key}
                  className="flex items-start justify-between gap-4 rounded-md border p-3 text-sm"
                >
                  <div className="space-y-1">
                    <p className="font-medium">
                      {entry.repository} - PR #{entry.pullRequestNumber}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {entry.message ?? "Awaiting action."}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium",
                      STATUS_CLASSES[entry.status],
                    )}
                  >
                    {STATUS_ICONS[entry.status]}
                    {STATUS_LABELS[entry.status]}
                  </span>
                </li>
              ))}
              {statuses.length === 0 && (
                <li className="text-sm text-muted-foreground">
                  No pull requests selected yet.
                </li>
              )}
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
              onClick={handleCreateReviews}
              disabled={
                isRunning ||
                selectedPullRequests.length === 0 ||
                !isValid ||
                hasSucceeded ||
                hasErrors
              }
            >
              {isRunning
                ? "Submitting..."
                : hasSucceeded
                  ? "Completed"
                  : hasErrors
                    ? "Some Failed"
                    : `Submit ${
                        reviewStatus === "approve"
                          ? "approvals"
                          : reviewStatus === "request_changes"
                            ? "change requests"
                            : "comments"
                      }`}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
