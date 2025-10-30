import { memo } from "react";

import { Button } from "@/components/ui/button";

interface RepositoryDashboardPullRequestFooterProps {
  count: number;
  disabled?: boolean;
  onMergeClick: () => void;
}

const RepositoryDashboardPullRequestFooterComponent = ({
  count,
  disabled = false,
  onMergeClick,
}: RepositoryDashboardPullRequestFooterProps) => {
  if (count === 0) {
    return null;
  }

  return (
    <div className="fixed inset-x-0 bottom-4 z-40 px-4">
      <div className="mx-auto flex max-w-4xl flex-col gap-3 rounded-lg border bg-background/95 p-4 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-background/75 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm text-muted-foreground">
          {count} pull request{count === 1 ? "" : "s"} selected
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" onClick={onMergeClick} disabled={disabled}>
            Merge pull requests
          </Button>
        </div>
      </div>
    </div>
  );
};

export const RepositoryDashboardPullRequestFooter = memo(
  RepositoryDashboardPullRequestFooterComponent
);
