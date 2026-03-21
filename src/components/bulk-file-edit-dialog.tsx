import { useState } from "react";

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
  GlobFileSearch,
  type RepoFileMatches,
} from "@/components/glob-file-search";
import { RegexPresetSelector } from "@/components/regex-preset-selector";
import {
  useBulkFileEdit,
  type RepositoryActionStatus,
} from "@/hooks/use-bulk-file-edit";
import { type FileChangeType, type FileMatchResult } from "@/lib/github/files";

const STATUS_STYLE: Record<RepositoryActionStatus, string> = {
  idle: "bg-muted text-muted-foreground",
  pending: "bg-amber-500/20 text-amber-700 dark:text-amber-400",
  success: "bg-emerald-500/20 text-emerald-700 dark:text-emerald-400",
  error: "bg-destructive/20 text-destructive",
  cancelled: "bg-slate-500/20 text-slate-700 dark:text-slate-300",
  skipped: "bg-slate-500/20 text-slate-700 dark:text-slate-300",
};

interface BulkFileEditDialogProps {
  organization: string;
  repositories: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function BulkFileEditDialog({
  organization,
  repositories,
  open,
  onOpenChange,
}: BulkFileEditDialogProps) {
  // Local state for glob-specific functionality
  const [matchingFiles, setMatchingFiles] = useState<FileMatchResult[]>([]);
  const [repoFileMatches, setRepoFileMatches] = useState<RepoFileMatches[]>([]);
  const [isSearchingFiles, setIsSearchingFiles] = useState(false);
  const [maxApiCalls, setMaxApiCalls] = useState(10);
  const [isGlobMode, setIsGlobMode] = useState(false);

  // Use the custom hook for bulk file edit logic
  const {
    baseBranch,
    setBaseBranch,
    filePath,
    setFilePath,
    changeType,
    setChangeType,
    searchContent,
    setSearchContent,
    newContent,
    setNewContent,
    branchName,
    setBranchName,
    prTitle,
    setPrTitle,
    prDescription,
    useRegex,
    setUseRegex,
    sampleContent,
    setSampleContent,
    regexTestResult,
    statuses,
    isRunning,
    handleDescriptionChange,
    handleTestRegex,
    handleBulkFileEdit,
    handleCancel,
    allCompleted,
    hasSucceeded,
    showSearchContent,
  } = useBulkFileEdit({
    organization,
    repositories,
    isGlobMode,
    repoFileMatches,
    open,
  });

  // Handle dialog open/close
  const handleDialogOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      handleCancel();
    }
    onOpenChange(nextOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Bulk file edit</DialogTitle>
          <DialogDescription>
            Modify a common file across multiple repositories. The action will
            run sequentially across the selected repositories.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] overflow-y-auto pr-2 pl-2">
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
                <GlobFileSearch
                  organization={organization}
                  repositories={repositories}
                  baseBranch={baseBranch}
                  filePath={filePath}
                  isGlobMode={isGlobMode}
                  isRunning={isRunning}
                  matchingFiles={matchingFiles}
                  repoFileMatches={repoFileMatches}
                  isSearchingFiles={isSearchingFiles}
                  maxApiCalls={maxApiCalls}
                  onFilePathChange={setFilePath}
                  onGlobModeChange={setIsGlobMode}
                  onMatchingFilesChange={(files, repoMatches) => {
                    setMatchingFiles(files);
                    setRepoFileMatches(repoMatches);
                  }}
                  onIsSearchingFilesChange={setIsSearchingFiles}
                  onMaxApiCallsChange={setMaxApiCalls}
                />
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
                hasSucceeded ||
                // In glob mode, require at least one file matched
                (isGlobMode && matchingFiles.length === 0)
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
