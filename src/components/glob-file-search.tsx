import { useState, useCallback } from "react";

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
import { FolderOpen, FileText } from "lucide-react";
import { findFilesOptimized, type FileMatchResult } from "@/lib/github/files";

export interface RepoFileMatches {
  repository: string;
  files: FileMatchResult[];
}

interface GlobFileSearchProps {
  organization: string;
  repositories: string[];
  baseBranch: string;
  filePath: string;
  isGlobMode: boolean;
  isRunning: boolean;
  matchingFiles: FileMatchResult[];
  repoFileMatches: RepoFileMatches[];
  isSearchingFiles: boolean;
  maxApiCalls: number;
  onFilePathChange: (value: string) => void;
  onGlobModeChange: (value: boolean) => void;
  onMatchingFilesChange: (
    files: FileMatchResult[],
    repoMatches: RepoFileMatches[],
  ) => void;
  onIsSearchingFilesChange: (value: boolean) => void;
  onMaxApiCallsChange: (value: number) => void;
}

export function GlobFileSearch({
  organization,
  repositories,
  baseBranch,
  filePath,
  isGlobMode,
  isRunning,
  matchingFiles,
  repoFileMatches,
  isSearchingFiles,
  maxApiCalls,
  onFilePathChange,
  onGlobModeChange,
  onMatchingFilesChange,
  onIsSearchingFilesChange,
  onMaxApiCallsChange,
}: GlobFileSearchProps) {
  const [showFileMatchesPopover, setShowFileMatchesPopover] = useState(false);

  const handleFindMatchingFiles = useCallback(async () => {
    if (!baseBranch || !filePath || repositories.length === 0) return;

    onIsSearchingFilesChange(true);
    onMatchingFilesChange([], []);

    try {
      const allMatches: RepoFileMatches[] = [];

      for (const repo of repositories) {
        try {
          const files = await findFilesOptimized(
            organization,
            repo,
            filePath,
            baseBranch,
            undefined,
            maxApiCalls,
          );
          if (files.length > 0) {
            allMatches.push({ repository: repo, files });
          }
        } catch (error) {
          console.error(`Error finding files in ${repo}:`, error);
        }
      }

      onMatchingFilesChange(
        allMatches.flatMap((m) => m.files),
        allMatches,
      );
    } catch (error) {
      console.error("Error finding matching files:", error);
      onMatchingFilesChange([], []);
    } finally {
      onIsSearchingFilesChange(false);
    }
  }, [
    organization,
    repositories,
    baseBranch,
    filePath,
    maxApiCalls,
    onMatchingFilesChange,
    onIsSearchingFilesChange,
  ]);

  const handleGlobModeToggle = useCallback(
    (checked: boolean) => {
      onGlobModeChange(checked);
      onMatchingFilesChange([], []);
    },
    [onGlobModeChange, onMatchingFilesChange],
  );

  return (
    <>
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Label htmlFor="file-path">File path</Label>
          <div className="flex items-center gap-1">
            <Checkbox
              id="glob-mode"
              checked={isGlobMode}
              onCheckedChange={handleGlobModeToggle}
              disabled={isRunning}
            />
            <Label htmlFor="glob-mode" className="text-sm cursor-pointer">
              Glob pattern
            </Label>
          </div>
        </div>
        <Input
          id="file-path"
          placeholder={isGlobMode ? "*.json or folder/*.yaml" : "README.md"}
          value={filePath}
          onChange={(e) => onFilePathChange(e.target.value)}
          disabled={isRunning}
        />
        {isGlobMode && (
          <>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleFindMatchingFiles}
                disabled={
                  isRunning || !baseBranch || !filePath || isSearchingFiles
                }
              >
                {isSearchingFiles ? "Searching..." : "Find Files"}
              </Button>
              {matchingFiles.length > 0 ? (
                <span className="text-sm text-green-600 bg-green-50 px-2 py-1 rounded dark:bg-green-900/20 dark:text-green-400">
                  {matchingFiles.length} file(s) found in{" "}
                  {repoFileMatches.length} repo(s) -{" "}
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    onClick={() => setShowFileMatchesPopover(true)}
                    className="h-auto p-0 text-blue-600 hover:text-blue-800"
                  >
                    View Details
                  </Button>
                </span>
              ) : !isSearchingFiles && filePath ? (
                <span className="text-sm text-yellow-600 bg-yellow-50 px-2 py-1 rounded dark:bg-yellow-900/20 dark:text-yellow-400">
                  0 files found.
                </span>
              ) : null}
            </div>
            <div className="flex items-center gap-2 pt-2">
              <Label htmlFor="max-api-calls" className="text-sm">
                Max API calls:
              </Label>
              <Input
                id="max-api-calls"
                type="number"
                min={1}
                max={100}
                value={maxApiCalls}
                onChange={(e) =>
                  onMaxApiCallsChange(
                    Math.max(1, Math.min(100, parseInt(e.target.value) || 10)),
                  )
                }
                disabled={isRunning}
                className="w-20 h-8"
              />
              <span className="text-xs text-muted-foreground">(1-100)</span>
            </div>
          </>
        )}
        {isGlobMode && (
          <p className="text-xs text-muted-foreground">
            Use patterns like *.json, **/*.yaml, folder/*.json
          </p>
        )}
      </div>

      {/* Popover Dialog for showing file matches per repository */}
      <Dialog
        open={showFileMatchesPopover}
        onOpenChange={setShowFileMatchesPopover}
      >
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FolderOpen className="h-5 w-5" />
              File Matches by Repository
            </DialogTitle>
            <DialogDescription>
              Found {matchingFiles.length} file(s) matching pattern "{filePath}"
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {repoFileMatches.map((repoMatch) => (
              <div key={repoMatch.repository} className="rounded-lg border p-3">
                <div className="flex items-center gap-2 mb-2">
                  <FolderOpen className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">{repoMatch.repository}</span>
                  <span className="text-sm text-muted-foreground">
                    ({repoMatch.files.length} file(s))
                  </span>
                </div>
                <ul className="ml-6 space-y-1">
                  {repoMatch.files.map((file) => (
                    <li
                      key={file.path}
                      className="flex items-center gap-2 text-sm"
                    >
                      <FileText className="h-3 w-3 text-muted-foreground" />
                      <span className="font-mono text-xs">{file.path}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            {repoFileMatches.length === 0 && (
              <p className="text-center text-muted-foreground py-4">
                No files found matching the pattern.
              </p>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowFileMatchesPopover(false)}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
