import { memo, useEffect, useState } from "react";
import { RefreshCwIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { RepositoryViewMode } from "@/types/repository-dashboard";

const VIEW_OPTIONS: { value: RepositoryViewMode; label: string }[] = [
  { value: "workflows", label: "Workflows" },
  { value: "deployments", label: "Deployments" },
  { value: "branches", label: "Branches" },
  { value: "pullRequests", label: "Pull Requests" },
];

interface RepositoryDashboardToolbarProps {
  viewMode: RepositoryViewMode;
  lastRefreshedLabel: string;
  onViewModeChange: (mode: RepositoryViewMode) => void;
  onRefresh: () => void;
  autoRefreshIntervalMs?: number;
  autoRefreshAriaLabel?: string;
}

const RepositoryDashboardToolbarComponent = ({
  viewMode,
  lastRefreshedLabel,
  onViewModeChange,
  onRefresh,
  autoRefreshIntervalMs = 60_000,
  autoRefreshAriaLabel = "Toggle auto refresh",
}: RepositoryDashboardToolbarProps) => {
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(false);

  useEffect(() => {
    if (!autoRefreshEnabled) {
      return undefined;
    }

    onRefresh();

    const intervalId = window.setInterval(() => {
      onRefresh();
    }, autoRefreshIntervalMs);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [autoRefreshEnabled, autoRefreshIntervalMs, onRefresh]);

  const handleAutoRefreshToggle = () => {
    setAutoRefreshEnabled((previous) => !previous);
  };

  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-1 rounded-md border bg-muted/40 p-1">
        {VIEW_OPTIONS.map((option) => (
          <Button
            key={option.value}
            type="button"
            size="sm"
            variant={viewMode === option.value ? "default" : "ghost"}
            onClick={() => onViewModeChange(option.value)}
          >
            {option.label}
          </Button>
        ))}
      </div>
      <span className="text-xs text-muted-foreground">
        Last refreshed: {lastRefreshedLabel}
      </span>
      <Button
        type="button"
        variant={autoRefreshEnabled ? "default" : "outline"}
        size="sm"
        onClick={handleAutoRefreshToggle}
        aria-pressed={autoRefreshEnabled}
        aria-label={autoRefreshAriaLabel}
        className="flex items-center gap-2"
      >
        <RefreshCwIcon className="h-4 w-4" aria-hidden="true" />
        <span className="text-xs font-medium">
          Auto refresh {autoRefreshEnabled ? "on" : "off"}
        </span>
      </Button>
    </div>
  );
};

export const RepositoryDashboardToolbar = memo(
  RepositoryDashboardToolbarComponent
);
