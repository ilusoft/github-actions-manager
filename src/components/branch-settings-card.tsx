import { useCallback, type Dispatch, type SetStateAction } from "react";

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

interface BranchSettingsCardProps {
  settings: BranchViewSettings;
  onChange: Dispatch<SetStateAction<BranchViewSettings>>;
}

export function BranchSettingsCard({ settings, onChange }: BranchSettingsCardProps) {
  const clampNumeric = useCallback((value: number) => {
    return Math.min(Math.max(value, 1), 100);
  }, []);

  const handleNumericChange = useCallback(
    (field: "perPage" | "limit") => (event: React.ChangeEvent<HTMLInputElement>) => {
      const raw = Number.parseInt(event.target.value, 10);
      if (Number.isNaN(raw)) {
        return;
      }

      onChange((previous) => ({
        ...previous,
        [field]: clampNumeric(raw),
      }));
    },
    [clampNumeric, onChange]
  );

  return (
    <Card className="border-dashed">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Branch settings</CardTitle>
      </CardHeader>
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
