import { memo, type BaseSyntheticEvent } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Checkbox } from "@/components/ui/checkbox";

export type PullRequestBulkAction = "review" | "merge";

interface RepositoryDashboardPullRequestFooterProps {
  count: number;
  disabled?: boolean;
  onSelectAction: (action: PullRequestBulkAction) => void;
  onClearSelection?: () => void;
}

const RepositoryDashboardPullRequestFooterComponent = ({
  count,
  disabled = false,
  onSelectAction,
  onClearSelection,
}: RepositoryDashboardPullRequestFooterProps) => {
  if (count === 0) {
    return null;
  }

  const handleSelect = (action: PullRequestBulkAction) =>
    (event: Event | BaseSyntheticEvent) => {
      event.preventDefault();
      if (disabled) {
        return;
      }
      onSelectAction(action);
    };

  const handleCheckboxChange = (checked: boolean | "indeterminate") => {
    if (checked !== true && onClearSelection) {
      onClearSelection();
    }
  };

  return (
    <div className="fixed inset-x-0 bottom-4 z-40 px-4">
      <div className="mx-auto flex max-w-4xl flex-col gap-3 rounded-lg border bg-background/95 p-4 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-background/75 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          {onClearSelection ? (
            <Checkbox
              defaultChecked
              onCheckedChange={handleCheckboxChange}
              aria-label="Deselect all pull requests"
              disabled={disabled}
            />
          ) : null}
          <span>
            {count} pull request{count === 1 ? "" : "s"} selected
          </span>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="secondary" disabled={disabled}>
              Bulk actions
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={handleSelect("review")}>
              Review pull requests
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={handleSelect("merge")}>
              Merge pull requests
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
};

export const RepositoryDashboardPullRequestFooter = memo(
  RepositoryDashboardPullRequestFooterComponent
);
