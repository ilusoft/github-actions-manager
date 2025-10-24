import { useCallback, type ChangeEvent } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface WorkflowFiltersState {
  excludeNoRuns: boolean;
  branch: string;
  runName: string;
  startDate?: string;
  endDate?: string;
}

interface RepositoryFiltersCardProps {
  filters: WorkflowFiltersState;
  onFiltersChange: (updater: (prev: WorkflowFiltersState) => WorkflowFiltersState) => void;
}

export function RepositoryFiltersCard({ filters, onFiltersChange }: RepositoryFiltersCardProps) {
  const handleInputChange = useCallback(
    (key: keyof WorkflowFiltersState) =>
      (event: ChangeEvent<HTMLInputElement>) => {
        const value = event.target.value;
        onFiltersChange((prev) => ({ ...prev, [key]: value }));
      },
    [onFiltersChange]
  );

  return (
    <Card className="border-dashed">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Filters</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="flex items-center gap-2">
          <Checkbox
            id="filter-exclude-no-runs"
            checked={filters.excludeNoRuns}
            onCheckedChange={(checked) =>
              onFiltersChange((prev) => ({
                ...prev,
                excludeNoRuns: Boolean(checked),
              }))
            }
          />
          <Label htmlFor="filter-exclude-no-runs" className="text-sm">
            Hide workflows with no runs
          </Label>
        </div>
        <div className="space-y-1">
          <Label htmlFor="filter-branch" className="text-xs uppercase text-muted-foreground">
            Branch
          </Label>
          <Input
            id="filter-branch"
            placeholder="e.g. main"
            value={filters.branch}
            onChange={handleInputChange("branch")}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="filter-run-name" className="text-xs uppercase text-muted-foreground">
            Run name contains
          </Label>
          <Input
            id="filter-run-name"
            placeholder="e.g. deploy"
            value={filters.runName}
            onChange={handleInputChange("runName")}
          />
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="filter-start-date" className="text-xs uppercase text-muted-foreground">
              Start date
            </Label>
            <Input
              id="filter-start-date"
              type="datetime-local"
              value={filters.startDate ?? ""}
              onChange={(event) =>
                onFiltersChange((prev) => ({
                  ...prev,
                  startDate: event.target.value || undefined,
                }))
              }
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="filter-end-date" className="text-xs uppercase text-muted-foreground">
              End date
            </Label>
            <Input
              id="filter-end-date"
              type="datetime-local"
              value={filters.endDate ?? ""}
              onChange={(event) =>
                onFiltersChange((prev) => ({
                  ...prev,
                  endDate: event.target.value || undefined,
                }))
              }
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
