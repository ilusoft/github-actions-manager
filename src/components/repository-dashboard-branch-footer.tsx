import { memo } from "react";

import { Button } from "@/components/ui/button";

interface RepositoryDashboardBranchFooterProps {
  count: number;
  onClearSelection: () => void;
  onDeleteSelected: () => void;
}

const RepositoryDashboardBranchFooterComponent = ({
  count,
  onClearSelection,
  onDeleteSelected,
}: RepositoryDashboardBranchFooterProps) => {
  if (count === 0) {
    return null;
  }

  return (
    <div className="fixed inset-x-0 bottom-4 z-40 px-4">
      <div className="mx-auto flex max-w-4xl flex-col gap-3 rounded-lg border bg-background/95 p-4 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-background/75 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm text-muted-foreground">
          {count} branch
          {count === 1 ? "" : "es"} selected
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="ghost" onClick={onClearSelection}>
            Clear selection
          </Button>
          <Button type="button" variant="destructive" onClick={onDeleteSelected}>
            Delete branches
          </Button>
        </div>
      </div>
    </div>
  );
};

export const RepositoryDashboardBranchFooter = memo(
  RepositoryDashboardBranchFooterComponent
);
