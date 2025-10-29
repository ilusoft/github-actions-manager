import { type Dispatch, type SetStateAction } from "react";

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
import { type PullRequestViewSettings } from "@/types/repository-dashboard";

interface PullRequestFiltersCardProps {
  settings: PullRequestViewSettings;
  onChange: Dispatch<SetStateAction<PullRequestViewSettings>>;
  onPerPageChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
}

export function PullRequestFiltersCard({ settings, onChange, onPerPageChange }: PullRequestFiltersCardProps) {
  return (
    <Card className="border-dashed">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Pull request filters</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
        <div className="space-y-1">
          <Label
            htmlFor="pull-request-state"
            className="text-xs uppercase text-muted-foreground"
          >
            State
          </Label>
          <Select
            value={settings.state}
            onValueChange={(value: "open" | "closed" | "all") =>
              onChange((previous) => ({
                ...previous,
                state: value,
              }))
            }
          >
            <SelectTrigger id="pull-request-state">
              <SelectValue placeholder="Select state" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="closed">Closed</SelectItem>
              <SelectItem value="all">All</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label
            htmlFor="pull-request-base"
            className="text-xs uppercase text-muted-foreground"
          >
            Base branch
          </Label>
          <Input
            id="pull-request-base"
            placeholder="e.g. main"
            value={settings.base}
            onChange={(event) =>
              onChange((previous) => ({
                ...previous,
                base: event.target.value,
              }))
            }
          />
          <p className="text-[10px] text-muted-foreground">
            Filters pull requests targeting the specified base branch.
          </p>
        </div>
        <div className="space-y-1">
          <Label
            htmlFor="pull-request-author"
            className="text-xs uppercase text-muted-foreground"
          >
            Author login contains
          </Label>
          <Input
            id="pull-request-author"
            placeholder="e.g. octocat"
            value={settings.author}
            onChange={(event) =>
              onChange((previous) => ({
                ...previous,
                author: event.target.value,
              }))
            }
          />
          <p className="text-[10px] text-muted-foreground">
            Matches GitHub usernames (case-insensitive, partial match).
          </p>
        </div>
        <div className="space-y-1">
          <Label
            htmlFor="pull-request-per-page"
            className="text-xs uppercase text-muted-foreground"
          >
            Pull requests per request
          </Label>
          <Input
            id="pull-request-per-page"
            type="number"
            min={1}
            max={100}
            value={settings.perPage}
            onChange={onPerPageChange}
          />
          <p className="text-[10px] text-muted-foreground">
            Controls the GitHub API page size (max 100).
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
