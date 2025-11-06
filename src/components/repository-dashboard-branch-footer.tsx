import { memo } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

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

  const handleCheckboxChange = (checked: boolean | "indeterminate") => {
    if (checked !== true) {
      onClearSelection();
    }
  };

  return (
    <div className="fixed inset-x-0 bottom-4 z-40 px-4">
      <div className="mx-auto flex max-w-4xl flex-col gap-3 rounded-lg border bg-background/95 p-4 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-background/75 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Checkbox defaultChecked onCheckedChange={handleCheckboxChange} aria-label="Deselect all branches" />
          <span>
            {count} branch
            {count === 1 ? "" : "es"} selected
          </span>
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
