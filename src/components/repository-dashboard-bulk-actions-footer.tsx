import { memo } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type RepositoryBulkAction =
  | "create-branch"
  | "create-pr"
  | "run-workflow";

interface RepositoryDashboardBulkActionsFooterProps {
  count: number;
  onSelectAction: (action: RepositoryBulkAction) => void;
}

const RepositoryDashboardBulkActionsFooterComponent = ({
  count,
  onSelectAction,
}: RepositoryDashboardBulkActionsFooterProps) => {
  if (count === 0) {
    return null;
  }

  const handleSelect = (action: RepositoryBulkAction) =>
    (event: Event | React.BaseSyntheticEvent) => {
      event.preventDefault();
      onSelectAction(action);
    };

  return (
    <div className="fixed inset-x-0 bottom-4 z-40 px-4">
      <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 rounded-lg border bg-background/95 p-4 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-background/75">
        <div className="text-sm text-muted-foreground">
          {count} repositories selected
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="secondary">
              Bulk actions
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={handleSelect("create-branch")}>
              Create branch
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={handleSelect("create-pr")}>
              Create pull request
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={handleSelect("run-workflow")}>
              Run workflow
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
};

export const RepositoryDashboardBulkActionsFooter = memo(
  RepositoryDashboardBulkActionsFooterComponent
);
