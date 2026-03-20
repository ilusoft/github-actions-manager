import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { ExternalLink } from "lucide-react";
import {
  fetchFileContents,
  createOrUpdateFile,
  applyFileChange,
  testRegex,
  decodeBase64,
  type FileChangeType,
  type RegexTestResult,
} from "@/lib/github/files";
import { fetchBranchRef, createBranchRef } from "@/lib/github/branches";
import { createPullRequest } from "@/lib/github/pull-requests";
import { RegexPresetSelector } from "@/components/regex-preset-selector";
import { GithubApiError } from "@/lib/github/client";

interface BulkFileEditDialogProps {
  organization: string;
  repositories: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type RepositoryActionStatus =
  | "idle"
  | "pending"
  | "success"
  | "error"
  | "cancelled"
  | "skipped";

interface RepositoryStatus {
  name: string;
  status: RepositoryActionStatus;
  message?: string;
  pullRequestUrl?: string;
}

const STATUS_STYLE: Record<RepositoryActionStatus, string> = {
  idle: "bg-muted text-muted-foreground",
  pending: "bg-amber-500/20 text-amber-700 dark:text-amber-400",
  success: "bg-emerald-500/20 text-emerald-700 dark:text-emerald-400",
  error: "bg-destructive/20 text-destructive",
  cancelled: "bg-slate-500/20 text-slate-700 dark:text-slate-300",
  skipped: "bg-slate-500/20 text-slate-700 dark:text-slate-300",
};

// Slugify a string for use in branch names
const slugify = (text: string): string => {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
};

export function BulkFileEditDialog({
  organization,
  repositories,
  open,
  onOpenChange,
}: BulkFileEditDialogProps) {
  const [baseBranch, setBaseBranch] = useState("");
  const [filePath, setFilePath] = useState("");
  const [changeType, setChangeType] =
    useState<FileChangeType>("search-replace");
  const [searchContent, setSearchContent] = useState("");
  const [newContent, setNewContent] = useState("");
  const [branchName, setBranchName] = useState("");
  const [prTitle, setPrTitle] = useState("");
  const [prDescription, setPrDescription] = useState("");
  const [useRegex, setUseRegex] = useState(false);
  const [sampleContent, setSampleContent] = useState("");
  const [regexTestResult, setRegexTestResult] =
    useState<RegexTestResult | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const initialStatuses = useMemo<RepositoryStatus[]>(
    () => repositories.map((name) => ({ name, status: "idle" })),
    [repositories],
  );
  const [statuses, setStatuses] = useState<RepositoryStatus[]>(initialStatuses);

  // Auto-generate branch name and PR title from description
  const handleDescriptionChange = useCallback(
    (value: string) => {
      setPrDescription(value);
      if (!branchName && value.trim()) {
        setBranchName(`chore/${slugify(value).slice(0, 50)}`);
      }
      if (!prTitle && value.trim()) {
        setPrTitle(value.trim());
      }
    },
    [branchName, prTitle],
  );

  // Test regex pattern
  const handleTestRegex = useCallback(() => {
    const result = testRegex(searchContent, sampleContent, newContent);
    setRegexTestResult(result);
  }, [searchContent, sampleContent, newContent]);

  useEffect(() => {
    if (open) {
      setBaseBranch("");
      setFilePath("");
      setChangeType("search-replace");
      setSearchContent("");
      setNewContent("");
      setBranchName("");
      setPrTitle("");
      setPrDescription("");
      setUseRegex(false);
      setSampleContent("");
      setRegexTestResult(null);
      setStatuses(initialStatuses);
      setIsRunning(false);
      abortControllerRef.current?.abort();
      abortControllerRef.current = null;
    }
  }, [open, initialStatuses]);

  const updateStatus = useCallback(
    (
      repository: string,
      status: RepositoryActionStatus,
      message?: string,
      pullRequestUrl?: string,
    ) => {
      setStatuses((previous) =>
        previous.map((entry) =>
          entry.name === repository
            ? { ...entry, status, message, pullRequestUrl }
            : entry,
        ),
      );
    },
    [],
  );

  const handleBulkFileEdit = useCallback(async () => {
    const trimmedBaseBranch = baseBranch.trim();
    const trimmedFilePath = filePath.trim();
    const trimmedBranchName = branchName.trim();
    const trimmedPrTitle = prTitle.trim();
    const trimmedPrDescription = prDescription.trim();
    const trimmedSearchContent = searchContent.trim();
    const trimmedNewContent = newContent.trim();

    if (
      !trimmedBaseBranch ||
      !trimmedFilePath ||
      !trimmedBranchName ||
      !trimmedPrTitle ||
      !trimmedNewContent
    ) {
      return;
    }

    // Validate search content for search-replace
    if (changeType === "search-replace" && !trimmedSearchContent) {
      return;
    }

    setIsRunning(true);
    const controller = new AbortController();
    abortControllerRef.current = controller;

    for (const repository of repositories) {
      if (controller.signal.aborted) {
        break;
      }

      updateStatus(repository, "pending", "Processing...");

      try {
        // Step 1: Get the SHA of the base branch
        updateStatus(repository, "pending", "Getting base branch SHA...");
        const baseSha = await fetchBranchRef(
          organization,
          repository,
          trimmedBaseBranch,
          controller.signal,
        );

        // Step 2: Fetch current file contents (if exists)
        updateStatus(repository, "pending", "Fetching file contents...");
        let originalContent = "";
        let fileSha: string | undefined;

        const fileContent = await fetchFileContents(
          organization,
          repository,
          trimmedFilePath,
          trimmedBaseBranch,
          controller.signal,
        );

        if (fileContent) {
          // File exists, decode content
          originalContent = decodeBase64(fileContent.content);
          fileSha = fileContent.sha;
        }

        // Step 3: Apply the change
        updateStatus(repository, "pending", "Applying changes...");
        let updatedContent: string;
        try {
          updatedContent = applyFileChange(
            originalContent,
            changeType,
            trimmedSearchContent,
            trimmedNewContent,
            useRegex,
          );
        } catch (err) {
          if (err instanceof Error && err.message.includes("Search content")) {
            // Search content not found - skip this repository
            updateStatus(
              repository,
              "skipped",
              "Search content not found in file.",
            );
            continue;
          }
          throw err;
        }

        // Step 4: Create a new branch from the base branch
        updateStatus(repository, "pending", "Creating branch...");
        await createBranchRef(
          organization,
          repository,
          trimmedBranchName,
          baseSha,
          controller.signal,
        );

        // Step 5: Create or update the file in the new branch
        updateStatus(repository, "pending", "Updating file...");
        await createOrUpdateFile(
          organization,
          repository,
          trimmedFilePath,
          updatedContent,
          `Update ${trimmedFilePath}`,
          fileSha,
          trimmedBranchName,
          controller.signal,
        );

        // Step 6: Create a pull request
        updateStatus(repository, "pending", "Creating pull request...");
        const response = await createPullRequest(
          organization,
          repository,
          trimmedPrTitle,
          trimmedBranchName,
          trimmedBaseBranch,
          trimmedPrDescription || undefined,
          false, // draft = false
          controller.signal,
        );

        updateStatus(
          repository,
          "success",
          "File updated and pull request created successfully.",
          response.html_url,
        );
      } catch (error) {
        if (controller.signal.aborted) {
          updateStatus(repository, "cancelled", "Operation cancelled.");
          break;
        }

        let message = "Unexpected error";
        if (error instanceof GithubApiError) {
          if (error.status === 422) {
            message =
              "File operation failed - branch may already exist or file not found.";
          } else if (error.status === 404) {
            message = "Repository, branch, or file not found.";
          } else {
            message = error.message;
          }
        } else if (error instanceof Error) {
          message = error.message;
        }

        updateStatus(repository, "error", message);
      }
    }

    abortControllerRef.current = null;
    setIsRunning(false);
  }, [
    baseBranch,
    filePath,
    changeType,
    searchContent,
    newContent,
    branchName,
    prTitle,
    prDescription,
    organization,
    repositories,
    updateStatus,
  ]);

  const handleCancel = useCallback(() => {
    const controller = abortControllerRef.current;
    if (controller) {
      controller.abort();
      abortControllerRef.current = null;
    }

    setStatuses((previous) =>
      previous.map((entry) =>
        entry.status === "pending"
          ? { ...entry, status: "cancelled", message: "Operation cancelled." }
          : entry,
      ),
    );
    setIsRunning(false);
  }, []);

  const handleDialogOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) {
        handleCancel();
      }

      onOpenChange(nextOpen);
    },
    [handleCancel, onOpenChange],
  );

  const allCompleted = statuses.every(
    (entry) =>
      entry.status === "success" ||
      entry.status === "cancelled" ||
      entry.status === "skipped" ||
      entry.status === "error",
  );
  const hasSucceeded = statuses.some((entry) => entry.status === "success");

  // Check if search content field should be shown
  const showSearchContent =
    changeType === "search-replace" || changeType === "replace";

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Bulk file edit</DialogTitle>
          <DialogDescription>
            Modify a common file across multiple repositories. The action will
            run sequentially across the selected repositories.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] overflow-y-auto pr-2">
          <div className="space-y-4">
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="base-branch">Base branch</Label>
                  <Input
                    id="base-branch"
                    placeholder="main"
                    value={baseBranch}
                    onChange={(event) => setBaseBranch(event.target.value)}
                    disabled={isRunning}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="file-path">File path</Label>
                  <Input
                    id="file-path"
                    placeholder="README.md"
                    value={filePath}
                    onChange={(event) => setFilePath(event.target.value)}
                    disabled={isRunning}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="change-type">Change type</Label>
                <Select
                  value={changeType}
                  onValueChange={(value) =>
                    setChangeType(value as FileChangeType)
                  }
                  disabled={isRunning}
                >
                  <SelectTrigger id="change-type">
                    <SelectValue placeholder="Select change type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="search-replace">
                      Search and replace
                    </SelectItem>
                    <SelectItem value="replace">Replace entire file</SelectItem>
                    <SelectItem value="prepend">Prepend content</SelectItem>
                    <SelectItem value="append">Append content</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {showSearchContent && (
                <div className="space-y-2">
                  <Label htmlFor="search-content">Search content</Label>
                  <Textarea
                    id="search-content"
                    placeholder="Content to search for (required for search-replace)"
                    value={searchContent}
                    onChange={(event) => setSearchContent(event.target.value)}
                    disabled={isRunning}
                    rows={3}
                  />
                  <p className="text-xs text-muted-foreground">
                    Enter the exact content you want to replace. Leave empty for
                    full file replacement.
                  </p>

                  {/* Preset selector */}
                  <div className="pt-2">
                    <RegexPresetSelector
                      searchPattern={searchContent}
                      replaceWith={newContent}
                      sampleContent={sampleContent}
                      onApplyPreset={(search, replace) => {
                        setSearchContent(search);
                        setNewContent(replace);
                        setUseRegex(true);
                      }}
                      disabled={isRunning}
                    />
                  </div>

                  {/* Regex toggle and test */}
                  <div className="flex items-center gap-2 pt-2">
                    <Checkbox
                      id="use-regex"
                      checked={useRegex}
                      onCheckedChange={(checked: boolean | string) =>
                        setUseRegex(checked === true)
                      }
                      disabled={isRunning}
                    />
                    <Label
                      htmlFor="use-regex"
                      className="text-sm cursor-pointer"
                    >
                      Use regex pattern
                    </Label>
                  </div>

                  {useRegex && (
                    <div className="space-y-2 pt-2 border-l-2 border-muted pl-3">
                      <Label htmlFor="sample-content">
                        Sample content for testing
                      </Label>
                      <Textarea
                        id="sample-content"
                        placeholder="Paste a sample of the file content to test your regex"
                        value={sampleContent}
                        onChange={(event) =>
                          setSampleContent(event.target.value)
                        }
                        disabled={isRunning}
                        rows={4}
                      />
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={handleTestRegex}
                          disabled={
                            isRunning || !searchContent || !sampleContent
                          }
                        >
                          Test Regex
                        </Button>
                      </div>
                      {regexTestResult && (
                        <div
                          className={`text-sm p-2 rounded ${
                            regexTestResult.isValid
                              ? regexTestResult.matches.length > 0
                                ? "bg-green-50 text-green-700"
                                : "bg-yellow-50 text-yellow-700"
                              : "bg-red-50 text-red-700"
                          }`}
                        >
                          {!regexTestResult.isValid ? (
                            <span>Invalid regex: {regexTestResult.error}</span>
                          ) : regexTestResult.matches.length === 0 ? (
                            <span>No matches found</span>
                          ) : (
                            <div className="space-y-1">
                              <span>
                                {regexTestResult.matches.length} match(es) found
                              </span>
                              {regexTestResult.preview && (
                                <pre className="mt-2 p-2 bg-white rounded border text-xs overflow-x-auto whitespace-pre-wrap">
                                  {regexTestResult.preview}
                                </pre>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="new-content">New content</Label>
                <Textarea
                  id="new-content"
                  placeholder="Content to insert or replace with"
                  value={newContent}
                  onChange={(event) => setNewContent(event.target.value)}
                  disabled={isRunning}
                  rows={5}
                />
              </div>
            </div>

            <Separator />

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="branch-name">Branch name</Label>
                <Input
                  id="branch-name"
                  placeholder="chore/update-config"
                  value={branchName}
                  onChange={(event) => setBranchName(event.target.value)}
                  disabled={isRunning}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="pr-title">Pull request title</Label>
                <Input
                  id="pr-title"
                  placeholder="Update configuration file"
                  value={prTitle}
                  onChange={(event) => setPrTitle(event.target.value)}
                  disabled={isRunning}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="pr-description">Description (optional)</Label>
                <Textarea
                  id="pr-description"
                  placeholder="Describe the changes..."
                  value={prDescription}
                  onChange={(event) =>
                    handleDescriptionChange(event.target.value)
                  }
                  disabled={isRunning}
                  rows={3}
                />
                <p className="text-xs text-muted-foreground">
                  The branch name and PR title will be auto-filled from the
                  description if left empty.
                </p>
              </div>
            </div>

            <Separator />

            <div className="space-y-2">
              <h4 className="text-sm font-semibold">Progress</h4>
              <ul className="space-y-2">
                {statuses.map((entry) => (
                  <li
                    key={entry.name}
                    className="flex items-start justify-between gap-4 rounded-md border p-3 text-sm"
                  >
                    <div className="space-y-1">
                      <p className="font-medium">{entry.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {entry.message ?? "Awaiting action."}
                      </p>
                      {entry.status === "success" && entry.pullRequestUrl ? (
                        <a
                          href={entry.pullRequestUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                        >
                          View pull request
                          <ExternalLink
                            className="h-3 w-3"
                            aria-hidden="true"
                          />
                        </a>
                      ) : null}
                    </div>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-medium ${
                        STATUS_STYLE[entry.status]
                      }`}
                    >
                      {entry.status.charAt(0).toUpperCase() +
                        entry.status.slice(1)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        <DialogFooter className="flex flex-col gap-2 sm:flex-row sm:justify-between">
          <Button
            type="button"
            variant="ghost"
            onClick={handleCancel}
            disabled={!isRunning}
          >
            Cancel
          </Button>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleDialogOpenChange(false)}
              disabled={isRunning && !allCompleted}
            >
              Close
            </Button>
            <Button
              type="button"
              onClick={handleBulkFileEdit}
              disabled={
                isRunning ||
                !baseBranch.trim() ||
                !filePath.trim() ||
                !branchName.trim() ||
                !prTitle.trim() ||
                !newContent.trim() ||
                (changeType === "search-replace" && !searchContent.trim()) ||
                repositories.length === 0 ||
                hasSucceeded
              }
            >
              {isRunning
                ? "Running..."
                : hasSucceeded
                  ? "Completed"
                  : "Apply changes"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
