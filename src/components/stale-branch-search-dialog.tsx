import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Search,
  Loader2,
  Check,
  GitBranch,
  User,
  Calendar,
  Trash2,
  AlertTriangle,
  X,
  Download,
  Filter,
} from "lucide-react";
import {
  type StaleBranchInfo,
  searchStaleBranches,
  deleteBranchRef,
} from "@/lib/github/branches";
import { GithubApiError } from "@/lib/github/client";

export interface StaleBranchSearchResult {
  branches: StaleBranchInfo[];
  totalScanned: number;
}

interface StaleBranchSearchDialogProps {
  organization: string;
  repositories: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSearchComplete: (result: StaleBranchSearchResult) => void;
}

type SearchStatus = "idle" | "searching" | "success" | "error";

interface ProgressState {
  current: number;
  total: number;
  repository: string;
}

export function StaleBranchSearchDialog({
  organization,
  repositories,
  open,
  onOpenChange,
  onSearchComplete,
}: StaleBranchSearchDialogProps) {
  // Form state
  const [baseBranch, setBaseBranch] = useState("main");
  const [authorFilter, setAuthorFilter] = useState("");
  const [daysOldThreshold, setDaysOldThreshold] = useState(30);
  const [branchNameFilter, setBranchNameFilter] = useState("");
  const [branchNameFilterMode, setBranchNameFilterMode] = useState<
    "include" | "exclude"
  >("exclude");

  // Search state
  const [status, setStatus] = useState<SearchStatus>("idle");
  const [progress, setProgress] = useState<ProgressState>({
    current: 0,
    total: repositories.length,
    repository: "",
  });
  const [foundBranches, setFoundBranches] = useState<StaleBranchInfo[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Selection state for deletion
  const [selectedBranches, setSelectedBranches] = useState<Set<string>>(
    new Set(),
  );

  // Deletion state
  const [isDeleting, setIsDeleting] = useState(false);
  const [deletionResults, setDeletionResults] = useState<
    Map<string, { success: boolean; message?: string }>
  >(new Map());
  const deletionAbortRef = useRef<AbortController | null>(null);

  // Abort controller for cancellation
  const abortControllerRef = useRef<AbortController | null>(null);

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setBaseBranch("main");
      setAuthorFilter("");
      setDaysOldThreshold(30);
      setBranchNameFilter("");
      setBranchNameFilterMode("exclude");
      setStatus("idle");
      setProgress({ current: 0, total: repositories.length, repository: "" });
      setFoundBranches([]);
      setError(null);
      setSelectedBranches(new Set());
      setDeletionResults(new Map());
      setIsDeleting(false);
      abortControllerRef.current?.abort();
      abortControllerRef.current = null;
      deletionAbortRef.current?.abort();
      deletionAbortRef.current = null;
    }
  }, [open, repositories.length]);

  // Handle search cancellation
  const handleCancel = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setStatus("idle");
  }, []);

  // Handle search
  const handleSearch = useCallback(async () => {
    if (!baseBranch.trim()) {
      setError("Please enter a base branch name (e.g., main, master, develop)");
      return;
    }

    setError(null);
    setStatus("searching");
    setFoundBranches([]);
    setProgress({ current: 0, total: repositories.length, repository: "" });

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const author = authorFilter.trim() || undefined;

      const results = await searchStaleBranches({
        organization,
        repositories,
        baseBranch: baseBranch.trim(),
        authorFilter: author,
        daysOldThreshold,
        signal: controller.signal,
        onProgress: (current, total, repo) => {
          setProgress({ current, total, repository: repo });
        },
      });

      // Apply branch name filter
      let filteredResults = results;
      if (branchNameFilter.trim()) {
        const filterTerms = branchNameFilter
          .split(",")
          .map((t) => t.trim().toLowerCase())
          .filter(Boolean);

        if (filterTerms.length > 0) {
          filteredResults = results.filter((branch) => {
            const branchNameLower = branch.branchName.toLowerCase();
            const matchesAnyTerm = filterTerms.some((term) =>
              branchNameLower.includes(term),
            );

            if (branchNameFilterMode === "include") {
              // Include only branches that match at least one term
              return matchesAnyTerm;
            } else {
              // Exclude branches that match any term
              return !matchesAnyTerm;
            }
          });
        }
      }

      setFoundBranches(filteredResults);
      setStatus("success");

      // Call the completion handler with results
      onSearchComplete({
        branches: results,
        totalScanned: repositories.length,
      });
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        setStatus("idle");
        return;
      }

      setError(
        err instanceof Error ? err.message : "An unexpected error occurred",
      );
      setStatus("error");
    }
  }, [
    organization,
    repositories,
    baseBranch,
    authorFilter,
    daysOldThreshold,
    branchNameFilter,
    branchNameFilterMode,
    onSearchComplete,
  ]);

  // Handle dialog close
  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen && (status === "searching" || isDeleting)) {
        // Cancel operation before closing
        abortControllerRef.current?.abort();
        abortControllerRef.current = null;
        deletionAbortRef.current?.abort();
        deletionAbortRef.current = null;
      }
      onOpenChange(nextOpen);
    },
    [onOpenChange, status, isDeleting],
  );

  // Toggle branch selection
  const toggleBranchSelection = useCallback((branchKey: string) => {
    setSelectedBranches((prev) => {
      const next = new Set(prev);
      if (next.has(branchKey)) {
        next.delete(branchKey);
      } else {
        next.add(branchKey);
      }
      return next;
    });
  }, []);

  // Select all / deselect all
  const selectAllBranches = useCallback(() => {
    setSelectedBranches(
      new Set(foundBranches.map((b) => `${b.repository}/${b.branchName}`)),
    );
  }, [foundBranches]);

  const deselectAllBranches = useCallback(() => {
    setSelectedBranches(new Set());
  }, []);

  // Delete selected branches
  const handleDeleteSelected = useCallback(async () => {
    if (selectedBranches.size === 0) {
      return;
    }

    setIsDeleting(true);
    setDeletionResults(new Map());

    const controller = new AbortController();
    deletionAbortRef.current = controller;

    const results = new Map<string, { success: boolean; message?: string }>();

    // Get the list of branches to delete
    const branchesToDelete = foundBranches.filter((b) =>
      selectedBranches.has(`${b.repository}/${b.branchName}`),
    );

    for (const branch of branchesToDelete) {
      const branchKey = `${branch.repository}/${branch.branchName}`;

      try {
        await deleteBranchRef(
          organization,
          branch.repository,
          branch.branchName,
          controller.signal,
        );
        results.set(branchKey, { success: true });
      } catch (error) {
        const message =
          error instanceof GithubApiError
            ? error.message
            : error instanceof Error
              ? error.message
              : "Failed to delete branch";
        results.set(branchKey, { success: false, message });
      }

      // Update results after each deletion
      setDeletionResults(new Map(results));
    }

    setIsDeleting(false);
    deletionAbortRef.current = null;
  }, [organization, foundBranches, selectedBranches]);

  // Save search results to text file
  const handleSaveSearchResults = useCallback(() => {
    if (foundBranches.length === 0) return;

    const content = foundBranches
      .map(
        (b) =>
          `${b.repository}/${b.branchName} | Author: ${b.author || "N/A"} | Last Commit: ${b.lastCommitDate || "N/A"} | Ahead: ${b.aheadBy} | Behind: ${b.behindBy}`,
      )
      .join("\n");

    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `stale-branches-${new Date().toISOString().split("T")[0]}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [foundBranches]);

  // Save deletion results to text file
  const handleSaveDeletionResults = useCallback(() => {
    if (deletionResults.size === 0) return;

    const deleted: string[] = [];
    const failed: string[] = [];

    deletionResults.forEach((result, branchKey) => {
      if (result.success) {
        deleted.push(`${branchKey} - Deleted successfully`);
      } else {
        failed.push(
          `${branchKey} - Failed: ${result.message || "Unknown error"}`,
        );
      }
    });

    const content = [
      "=== Stale Branch Deletion Report ===",
      `Generated: ${new Date().toLocaleString()}`,
      "",
      `Total: ${deletionResults.size}`,
      `Deleted: ${deleted.length}`,
      `Failed: ${failed.length}`,
      "",
      "--- Deleted Branches ---",
      ...deleted,
      "",
      "--- Failed Deletions ---",
      ...failed,
    ].join("\n");

    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `branch-deletion-report-${new Date().toISOString().split("T")[0]}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [deletionResults]);

  // Format date for display
  const formatDate = (dateStr?: string) => {
    if (!dateStr) return "Unknown";
    const date = new Date(dateStr);
    return date.toLocaleDateString() + " " + date.toLocaleTimeString();
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="flex max-h-[80vh] max-w-2xl flex-col overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="space-y-2 border-b px-6 py-4">
          <DialogTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            Search Stale Branches
          </DialogTitle>
          <DialogDescription>
            Find branches that have been merged into the base branch and meet
            the age criteria. Results can be used for bulk deletion.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {/* Search Form */}
          {status === "idle" || status === "error" ? (
            <div className="space-y-4">
              {/* Base Branch */}
              <div className="space-y-2">
                <Label
                  htmlFor="base-branch"
                  className="flex items-center gap-2"
                >
                  <GitBranch className="h-4 w-4" />
                  Base Branch
                </Label>
                <Input
                  id="base-branch"
                  placeholder="e.g., main, master, develop"
                  value={baseBranch}
                  onChange={(e) => setBaseBranch(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  The branch to compare against (typically your main or master
                  branch)
                </p>
              </div>

              {/* Author Filter */}
              <div className="space-y-2">
                <Label
                  htmlFor="author-filter"
                  className="flex items-center gap-2"
                >
                  <User className="h-4 w-4" />
                  Filter by Author (Optional)
                </Label>
                <Input
                  id="author-filter"
                  placeholder="Leave empty for ALL users"
                  value={authorFilter}
                  onChange={(e) => setAuthorFilter(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Filter branches by the last commit author username
                </p>
              </div>

              {/* Days Threshold */}
              <div className="space-y-2">
                <Label
                  htmlFor="days-threshold"
                  className="flex items-center gap-2"
                >
                  <Calendar className="h-4 w-4" />
                  Older than (days)
                </Label>
                <Input
                  id="days-threshold"
                  type="number"
                  min={1}
                  max={365}
                  value={daysOldThreshold}
                  onChange={(e) =>
                    setDaysOldThreshold(
                      Math.max(
                        1,
                        Math.min(365, parseInt(e.target.value) || 30),
                      ),
                    )
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Only include branches with last commit older than this many
                  days
                </p>
              </div>

              {/* Branch Name Filter */}
              <div className="space-y-2">
                <Label
                  htmlFor="branch-name-filter"
                  className="flex items-center gap-2"
                >
                  <Filter className="h-4 w-4" />
                  Branch Name Filter (Optional)
                </Label>
                <div className="flex gap-2">
                  <Select
                    value={branchNameFilterMode}
                    onValueChange={(value) =>
                      setBranchNameFilterMode(value as "include" | "exclude")
                    }
                  >
                    <SelectTrigger className="w-[140px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="exclude">Exclude</SelectItem>
                      <SelectItem value="include">Include</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    id="branch-name-filter"
                    placeholder="e.g., feature, bugfix, test"
                    value={branchNameFilter}
                    onChange={(e) => setBranchNameFilter(e.target.value)}
                    className="flex-1"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Comma-separated list of terms to{" "}
                  {branchNameFilterMode === "include" ? "include" : "exclude"}{" "}
                  in branch names
                </p>
              </div>

              {/* Error Message */}
              {error ? (
                <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                  {error}
                </div>
              ) : null}
            </div>
          ) : null}

          {/* Search Progress */}
          {status === "searching" ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
                <span className="text-sm">
                  Scanning repositories for stale branches...
                </span>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Progress</span>
                  <span>
                    {progress.current} / {progress.total} repositories
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-primary transition-all duration-300"
                    style={{
                      width: `${(progress.current / progress.total) * 100}%`,
                    }}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Currently scanning: <strong>{progress.repository}</strong>
                </p>
              </div>

              <p className="text-xs text-muted-foreground">
                Found {foundBranches.length} stale branches so far...
              </p>
            </div>
          ) : null}

          {/* Search Results */}
          {status === "success" ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Check className="h-5 w-5 text-emerald-500" />
                  <span className="font-medium">
                    Found {foundBranches.length} stale branch
                    {foundBranches.length === 1 ? "" : "es"}
                  </span>
                </div>
                {foundBranches.length > 0 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleSaveSearchResults}
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Save Results
                  </Button>
                )}
              </div>

              {foundBranches.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No stale branches found matching your criteria. Try adjusting
                  the base branch or increasing the days threshold.
                </p>
              ) : (
                <>
                  {/* Selection controls */}
                  <div className="flex items-center gap-4">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={selectAllBranches}
                      disabled={isDeleting}
                    >
                      Select All
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={deselectAllBranches}
                      disabled={isDeleting}
                    >
                      Deselect All
                    </Button>
                    <span className="text-xs text-muted-foreground">
                      {selectedBranches.size} of {foundBranches.length} selected
                    </span>
                  </div>

                  {/* Results list with checkboxes */}
                  <div className="max-h-[250px] space-y-2 overflow-y-auto rounded-md border">
                    {foundBranches.map((branch) => {
                      const branchKey = `${branch.repository}/${branch.branchName}`;
                      const isSelected = selectedBranches.has(branchKey);
                      const deletionResult = deletionResults.get(branchKey);
                      const isDeletingThis = isDeleting && isSelected;

                      return (
                        <div
                          key={branchKey}
                          className={`flex items-start gap-3 border-b p-3 last:border-0 ${
                            deletionResult?.success
                              ? "bg-destructive/10"
                              : deletionResult && !deletionResult.success
                                ? "bg-destructive/5"
                                : ""
                          }`}
                        >
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() =>
                              toggleBranchSelection(branchKey)
                            }
                            disabled={isDeleting || deletionResult?.success}
                            className="mt-1"
                          />
                          <div className="flex-1 space-y-1">
                            <p className="text-sm font-medium">
                              {branch.repository} / {branch.branchName}
                            </p>
                            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                              {branch.author && (
                                <span>Author: {branch.author}</span>
                              )}
                              <span>
                                Last commit: {formatDate(branch.lastCommitDate)}
                              </span>
                              <span>
                                Status: {branch.aheadBy} ahead,{" "}
                                {branch.behindBy} behind
                              </span>
                            </div>
                            {/* Deletion result for this branch */}
                            {deletionResult && (
                              <div
                                className={`mt-2 flex items-center gap-2 text-xs ${
                                  deletionResult.success
                                    ? "text-emerald-600"
                                    : "text-destructive"
                                }`}
                              >
                                {deletionResult.success ? (
                                  <>
                                    <Check className="h-3 w-3" />
                                    <span>Deleted successfully</span>
                                  </>
                                ) : (
                                  <>
                                    <AlertTriangle className="h-3 w-3" />
                                    <span>
                                      {deletionResult.message ||
                                        "Failed to delete"}
                                    </span>
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                          {isDeletingThis && (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </>
              )}

              {deletionResults.size > 0 ? (
                <div className="space-y-3">
                  <div className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-700">
                    Deletion complete.{" "}
                    {
                      [...deletionResults.values()].filter((r) => r.success)
                        .length
                    }{" "}
                    of {deletionResults.size} branches deleted successfully.
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleSaveDeletionResults}
                    className="w-full"
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Save Deletion Report
                  </Button>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  These branches are behind the base branch and older than{" "}
                  {daysOldThreshold} days. Select branches to delete them.
                </p>
              )}
            </div>
          ) : null}
        </div>

        <DialogFooter className="flex flex-col gap-2 border-t px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              if (status === "searching") {
                handleCancel();
              } else if (isDeleting) {
                deletionAbortRef.current?.abort();
                deletionAbortRef.current = null;
                setIsDeleting(false);
              } else {
                onOpenChange(false);
              }
            }}
          >
            {status === "searching"
              ? "Cancel Search"
              : isDeleting
                ? "Cancel Deletion"
                : "Close"}
          </Button>

          <div className="flex gap-2">
            {/* Delete Selected button - shown after search is complete */}
            {status === "success" && foundBranches.length > 0 && (
              <Button
                type="button"
                variant="destructive"
                onClick={handleDeleteSelected}
                disabled={selectedBranches.size === 0 || isDeleting}
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete Selected ({selectedBranches.size})
                  </>
                )}
              </Button>
            )}

            {status === "success" && (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  // Reset for a new search
                  setStatus("idle");
                  setFoundBranches([]);
                  setSelectedBranches(new Set());
                  setDeletionResults(new Map());
                }}
                disabled={isDeleting}
              >
                <Search className="mr-2 h-4 w-4" />
                New Search
              </Button>
            )}

            {(status === "idle" || status === "error") && (
              <Button
                type="button"
                onClick={handleSearch}
                disabled={!baseBranch.trim() || repositories.length === 0}
              >
                <Search className="mr-2 h-4 w-4" />
                Search Stale Branches
              </Button>
            )}

            {status === "searching" && (
              <Button
                type="button"
                variant="destructive"
                onClick={handleCancel}
              >
                Cancel
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
