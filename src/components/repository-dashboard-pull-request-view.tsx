import { memo, useCallback, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { RepositoryPullRequestTree } from "@/components/repository-pull-request-tree";
import {
  RepositoryDashboardPullRequestFooter,
  type PullRequestBulkAction,
} from "@/components/repository-dashboard-pull-request-footer";
import { BulkPullRequestMergeDialog } from "@/components/bulk-pull-request-merge-dialog";
import {
  BulkPRReviewDialog,
  type ReviewProgressEntry,
} from "@/components/bulk-pr-review-dialog";
import type { RepositoryPullRequestRequestOptions } from "@/lib/github/pull-requests";
import { usePullRequestSelection } from "@/hooks/use-pull-request-selection";

interface RepositoryDashboardPullRequestViewProps {
  organization: string;
  repositories: string[];
  options: RepositoryPullRequestRequestOptions;
}

const RepositoryDashboardPullRequestViewComponent = ({
  organization,
  repositories,
  options,
}: RepositoryDashboardPullRequestViewProps) => {
  const queryClient = useQueryClient();
  const {
    selectedEntries,
    selectedCount,
    selectedIdsByRepository,
    handlePullRequestSelectionChange,
    clearSelectedPullRequests,
    ensureSelectionWithinRepositories,
  } = usePullRequestSelection();

  const [isMergeDialogOpen, setIsMergeDialogOpen] = useState(false);
  const [isReviewDialogOpen, setIsReviewDialogOpen] = useState(false);

  useEffect(() => {
    ensureSelectionWithinRepositories(repositories);
  }, [ensureSelectionWithinRepositories, repositories]);

  const pullRequestPerPage = options.perPage;
  const pullRequestState = options.state;
  const pullRequestBase = options.base ?? "";
  const pullRequestAuthor = options.author ?? "";

  const invalidatePullRequestQueries = useCallback(
    (repositoryNames: Iterable<string>) => {
      for (const repo of repositoryNames) {
        queryClient.invalidateQueries({
          queryKey: [
            "github",
            "org",
            organization,
            "repo",
            repo,
            "pulls",
            pullRequestPerPage,
            pullRequestState,
            pullRequestBase,
            pullRequestAuthor,
            1,
          ],
        });
      }
    },
    [
      organization,
      pullRequestAuthor,
      pullRequestBase,
      pullRequestPerPage,
      pullRequestState,
      queryClient,
    ]
  );

  const handleBulkAction = useCallback(
    (action: PullRequestBulkAction) => {
      if (selectedEntries.length === 0) {
        return;
      }

      if (action === "merge") {
        setIsMergeDialogOpen(true);
        return;
      }

      if (action === "review") {
        setIsReviewDialogOpen(true);
      }
    },
    [selectedEntries.length]
  );

  const handleMergeCompleted = useCallback(() => {
    if (selectedEntries.length === 0) {
      setIsMergeDialogOpen(false);
      return;
    }

    const repositoriesToRefresh = new Set(
      selectedEntries.map((entry) => entry.repository)
    );

    invalidatePullRequestQueries(repositoriesToRefresh);
    clearSelectedPullRequests();
    setIsMergeDialogOpen(false);
  }, [
    clearSelectedPullRequests,
    invalidatePullRequestQueries,
    selectedEntries,
  ]);

  const handleReviewCompleted = useCallback(
    (results: ReviewProgressEntry[]) => {
      if (results.length === 0) {
        setIsReviewDialogOpen(false);
        return;
      }

      const repositoriesToRefresh = new Set(
        results
          .filter((entry) => entry.status !== "idle")
          .map((entry) => entry.repository)
      );

      invalidatePullRequestQueries(repositoriesToRefresh);
      clearSelectedPullRequests();
      setIsReviewDialogOpen(false);
    },
    [clearSelectedPullRequests, invalidatePullRequestQueries]
  );

  return (
    <>
      <BulkPullRequestMergeDialog
        organization={organization}
        pullRequests={selectedEntries}
        open={isMergeDialogOpen}
        onOpenChange={setIsMergeDialogOpen}
        onCompleted={handleMergeCompleted}
      />
      <BulkPRReviewDialog
        organization={organization}
        selectedPullRequests={selectedEntries}
        open={isReviewDialogOpen}
        onOpenChange={setIsReviewDialogOpen}
        onCompleted={handleReviewCompleted}
      />
      <RepositoryPullRequestTree
        organization={organization}
        repositories={repositories}
        options={options}
        selectedPullRequestIds={selectedIdsByRepository}
        onPullRequestSelectionChange={handlePullRequestSelectionChange}
      />
      <RepositoryDashboardPullRequestFooter
        count={selectedCount}
        onSelectAction={handleBulkAction}
        onClearSelection={clearSelectedPullRequests}
        disabled={selectedCount === 0}
      />
    </>
  );
};

export const RepositoryDashboardPullRequestView = memo(
  RepositoryDashboardPullRequestViewComponent
);
