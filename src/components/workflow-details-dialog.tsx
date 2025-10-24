import { useMemo } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { GithubWorkflowRun, RepositoryWorkflowSummary } from "@/hooks/githubQueries";
import { ExternalLink } from "lucide-react";

interface WorkflowDetailsDialogProps {
  workflow: RepositoryWorkflowSummary | null;
  runNameFilter: string;
  onOpenChange: (open: boolean) => void;
}

const filterRunsByName = (
  runs: GithubWorkflowRun[],
  runNameFilter: string
): GithubWorkflowRun[] => {
  const trimmedFilter = runNameFilter.trim().toLowerCase();

  if (!trimmedFilter) {
    return runs;
  }

  return runs.filter((run) =>
    (run.display_title || run.name || "").toLowerCase().includes(trimmedFilter)
  );
};

const buildRunSummary = (run: GithubWorkflowRun | null) => {
  if (!run) {
    return "Never run";
  }

  const updatedAt = run.updated_at ? new Date(run.updated_at) : undefined;
  const formattedDate =
    updatedAt && !Number.isNaN(updatedAt.valueOf())
      ? updatedAt.toLocaleString()
      : "Unknown time";

  return `${formattedDate} • ${run.event ?? "Unknown event"}`;
};

export const filterWorkflowByRunName = (
  workflow: RepositoryWorkflowSummary,
  runNameFilter: string
): RepositoryWorkflowSummary | null => {
  const filteredRuns = filterRunsByName(workflow.runs, runNameFilter);

  if (filteredRuns.length === 0) {
    return null;
  }

  return {
    ...workflow,
    runs: filteredRuns,
    latestRun: filteredRuns[0] ?? null,
  } satisfies RepositoryWorkflowSummary;
};

const renderRunStatusDescriptor = (run: GithubWorkflowRun) => {
  const status = run.status?.toLowerCase();
  const conclusion = run.conclusion?.toLowerCase();

  if (!status && !conclusion) {
    return { label: "Unknown", className: "bg-muted-foreground" };
  }

  if (
    conclusion === "success" ||
    (status === "completed" && conclusion === "success")
  ) {
    return { label: "Success", className: "bg-emerald-500" };
  }

  if (
    conclusion && ["failure", "timed_out", "cancelled", "action_required"].includes(conclusion)
  ) {
    return { label: "Failed", className: "bg-destructive" };
  }

  if (
    ["in_progress", "queued", "waiting", "pending"].includes(status ?? "")
  ) {
    return { label: "In progress", className: "bg-amber-500" };
  }

  return { label: status ?? "Unknown", className: "bg-muted-foreground" };
};

export function WorkflowDetailsDialog({
  workflow,
  runNameFilter,
  onOpenChange,
}: WorkflowDetailsDialogProps) {
  const open = Boolean(workflow);
  const runs = useMemo(
    () => filterRunsByName(workflow?.runs ?? [], runNameFilter),
    [workflow?.runs, runNameFilter]
  );
  const latestRun = runs[0] ?? null;
  const workflowLink = useMemo(() => {
    if (!workflow?.htmlUrl || !workflow?.path) {
      return null;
    }

    try {
      const url = new URL(workflow.htmlUrl);
      const segments = url.pathname.split("/").filter(Boolean);
      if (segments.length < 2) {
        return null;
      }

      const owner = segments[0];
      const repo = segments[1];
      const fileName = workflow.path.split("/").pop();

      if (!fileName) {
        return null;
      }

      return `https://github.com/${owner}/${repo}/actions/workflows/${fileName}`;
    } catch {
      return null;
    }
  }, [workflow?.htmlUrl, workflow?.path]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle>{workflow?.name ?? "Workflow"}</DialogTitle>
          <DialogDescription>{buildRunSummary(latestRun)}</DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto space-y-4 pr-1">
          <section className="space-y-2">
            <h4 className="text-sm font-semibold">Latest runs</h4>
            {runs.length ? (
              <ul className="space-y-3">
                {runs.map((run: GithubWorkflowRun) => {
                  const descriptor = renderRunStatusDescriptor(run);

                  return (
                    <li key={run.id} className="rounded-lg border p-3 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span
                            aria-hidden="true"
                            className={cn(
                              "h-2.5 w-2.5 flex-shrink-0 rounded-full",
                              descriptor.className
                            )}
                          />
                          <p className="font-medium">
                            {run.display_title ??
                              run.name ??
                              `Run #${run.run_number}`}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-muted-foreground">
                            {descriptor.label}
                          </span>
                          {run.html_url ? (
                            <a
                              href={run.html_url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-muted-foreground transition-colors hover:text-primary"
                              title="Open run on GitHub"
                            >
                              <ExternalLink
                                className="h-4 w-4"
                                aria-hidden="true"
                              />
                              <span className="sr-only">Open run</span>
                            </a>
                          ) : null}
                        </div>
                      </div>
                      <dl className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <div className="flex flex-col">
                          <dt className="text-xs uppercase text-muted-foreground">
                            Branch
                          </dt>
                          <dd className="text-xs font-medium">
                            {run.head_branch ?? "Unknown"}
                          </dd>
                        </div>
                        <div className="flex flex-col">
                          <dt className="text-xs uppercase text-muted-foreground">
                            Event
                          </dt>
                          <dd className="text-xs font-medium">
                            {run.event ?? "Unknown"}
                          </dd>
                        </div>
                        <div className="flex flex-col">
                          <dt className="text-xs uppercase text-muted-foreground">
                            Actor
                          </dt>
                          <dd className="text-xs font-medium">
                            {run.head_commit?.author?.name ?? "Unknown"}
                          </dd>
                        </div>
                        <div className="flex flex-col">
                          <dt className="text-xs uppercase text-muted-foreground">
                            Duration
                          </dt>
                          <dd className="text-xs font-medium">
                            {run.run_started_at
                              ? `${new Date(run.run_started_at).toLocaleString()} → ${new Date(run.updated_at).toLocaleString()}`
                              : "Unknown"}
                          </dd>
                        </div>
                      </dl>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                No runs match the current filters.
              </p>
            )}
          </section>
        </div>
        <DialogFooter className="flex-shrink-0 justify-end">
          {workflowLink ? (
            <Button asChild variant="outline">
              <a href={workflowLink} target="_blank" rel="noreferrer">
                View workflow on GitHub
                <ExternalLink className="ml-2 h-4 w-4" aria-hidden="true" />
              </a>
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
