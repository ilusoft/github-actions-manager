import { useCallback, type Dispatch, type SetStateAction } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { type BranchViewSettings } from "@/types/repository-dashboard";
import { Search, X } from "lucide-react";

interface BranchSettingsCardProps {
  settings: BranchViewSettings;
  onChange: Dispatch<SetStateAction<BranchViewSettings>>;
  onSearchStaleBranches?: () => void;
}

export function BranchSettingsCard({
  settings,
  onChange,
  onSearchStaleBranches,
}: BranchSettingsCardProps) {
  const clampNumeric = useCallback((value: number) => {
    return Math.min(Math.max(value, 1), 100);
  }, []);

  const handleNumericChange = useCallback(
    (field: "perPage" | "limit") =>
      (event: React.ChangeEvent<HTMLInputElement>) => {
        const raw = Number.parseInt(event.target.value, 10);
        if (Number.isNaN(raw)) {
          return;
        }

        onChange((previous) => ({
          ...previous,
          [field]: clampNumeric(raw),
        }));
      },
    [clampNumeric, onChange],
  );

  const staleResults = settings.staleSearch?.foundBranches;
  const staleCount = staleResults?.length ?? 0;
  const hasStaleResults = staleCount > 0;

  const handleClearStaleResults = useCallback(() => {
    onChange((previous) => ({
      ...previous,
      staleSearch: undefined,
    }));
  }, [onChange]);

  return (
    <Card className="border-dashed">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-base">Branch settings</CardTitle>
        {onSearchStaleBranches && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onSearchStaleBranches}
            className="gap-2"
          >
            <Search className="h-4 w-4" />
            Search Stale Branches
          </Button>
        )}
      </CardHeader>

      {/* Stale Results Summary */}
      {hasStaleResults && (
        <CardContent className="pb-0">
          <div className="mb-4 flex items-center justify-between rounded-md bg-amber-50 p-3 dark:bg-amber-950/30">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">
                {staleCount} stale branch{staleCount === 1 ? "" : "es"} found
              </span>
              <span className="text-xs text-muted-foreground">
                (base: {settings.staleSearch?.baseBranch})
              </span>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleClearStaleResults}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      )}

      <CardContent className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
        <div className="space-y-1">
          <Label
            htmlFor="branch-visibility"
            className="text-xs uppercase text-muted-foreground"
          >
            Visibility
          </Label>
          <Select
            value={settings.visibility}
            onValueChange={(value: "all" | "protected" | "unprotected") =>
              onChange((previous) => ({
                ...previous,
                visibility: value,
              }))
            }
          >
            <SelectTrigger id="branch-visibility">
              <SelectValue placeholder="Select visibility" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All branches</SelectItem>
              <SelectItem value="protected">Protected only</SelectItem>
              <SelectItem value="unprotected">Unprotected only</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label
            htmlFor="branch-per-page"
            className="text-xs uppercase text-muted-foreground"
          >
            Branches per request
          </Label>
          <Input
            id="branch-per-page"
            type="number"
            min={1}
            max={100}
            value={settings.perPage}
            onChange={handleNumericChange("perPage")}
          />
          <p className="text-[10px] text-muted-foreground">
            Controls the GitHub API page size (max 100).
          </p>
        </div>
        <div className="space-y-1">
          <Label
            htmlFor="branch-limit"
            className="text-xs uppercase text-muted-foreground"
          >
            Maximum branches displayed
          </Label>
          <Input
            id="branch-limit"
            type="number"
            min={1}
            max={100}
            value={settings.limit}
            onChange={handleNumericChange("limit")}
          />
          <p className="text-[10px] text-muted-foreground">
            Caps the number of branches shown per repository.
          </p>
        </div>
        <div className="space-y-1">
          <Label
            htmlFor="branch-name-filter"
            className="text-xs uppercase text-muted-foreground"
          >
            Branch name contains
          </Label>
          <Input
            id="branch-name-filter"
            placeholder="e.g. release"
            value={settings.name}
            onChange={(event) =>
              onChange((previous) => ({
                ...previous,
                name: event.target.value,
              }))
            }
          />
        </div>
      </CardContent>
    </Card>
  );
}
