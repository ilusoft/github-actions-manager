import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  fetchFileContents,
  createOrUpdateFile,
  applyFileChange,
  testRegex,
  decodeBase64,
  type FileChangeType,
  type RegexTestResult,
  type FileMatchResult,
} from "@/lib/github/files";
import { fetchBranchRef, createBranchRef } from "@/lib/github/branches";
import { createPullRequest } from "@/lib/github/pull-requests";
import { GithubApiError } from "@/lib/github/client";
import type { RepoFileMatches } from "@/components/glob-file-search";

// Slugify a string for use in branch names
const slugify = (text: string): string => {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
};

export type RepositoryActionStatus =
  | "idle"
  | "pending"
  | "success"
  | "error"
  | "cancelled"
  | "skipped";

export interface RepositoryStatus {
  name: string;
  status: RepositoryActionStatus;
  message?: string;
  pullRequestUrl?: string;
}

interface UseBulkFileEditOptions {
  organization: string;
  repositories: string[];
  isGlobMode: boolean;
  repoFileMatches: RepoFileMatches[];
  open: boolean;
}

interface UseBulkFileEditReturn {
  // Form state
  baseBranch: string;
  setBaseBranch: (value: string) => void;
  filePath: string;
  setFilePath: (value: string) => void;
  changeType: FileChangeType;
  setChangeType: (value: FileChangeType) => void;
  searchContent: string;
  setSearchContent: (value: string) => void;
  newContent: string;
  setNewContent: (value: string) => void;
  branchName: string;
  setBranchName: (value: string) => void;
  prTitle: string;
  setPrTitle: (value: string) => void;
  prDescription: string;
  setPrDescription: (value: string) => void;
  useRegex: boolean;
  setUseRegex: (value: boolean) => void;
  sampleContent: string;
  setSampleContent: (value: string) => void;
  regexTestResult: RegexTestResult | null;

  // Status state
  statuses: RepositoryStatus[];
  isRunning: boolean;

  // Actions
  handleDescriptionChange: (value: string) => void;
  handleTestRegex: () => void;
  handleBulkFileEdit: () => Promise<void>;
  handleCancel: () => void;

  // Computed
  allCompleted: boolean;
  hasSucceeded: boolean;
  showSearchContent: boolean;
  isFormValid: boolean;
}

export function useBulkFileEdit({
  organization,
  repositories,
  isGlobMode,
  repoFileMatches,
  open,
}: UseBulkFileEditOptions): UseBulkFileEditReturn {
  // Form state
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

  // Status state
  const [isRunning, setIsRunning] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const initialStatuses = useMemo<RepositoryStatus[]>(
    () =>
      repositories.map((name) => ({
        name,
        status: "idle" as RepositoryActionStatus,
      })),
    [repositories],
  );
  const [statuses, setStatuses] = useState<RepositoryStatus[]>(initialStatuses);

  // Reset form when dialog opens
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

  // Update statuses when repositories change
  useEffect(() => {
    setStatuses(
      repositories.map((name) => ({
        name,
        status: "idle" as RepositoryActionStatus,
      })),
    );
  }, [repositories]);

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

  // Update status for a repository
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

  // Main bulk file edit function
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

    // In glob mode, use the pre-found matched files per repository
    const filesToProcessPerRepo: Map<string, FileMatchResult[]> = new Map();
    if (isGlobMode && repoFileMatches.length > 0) {
      for (const match of repoFileMatches) {
        filesToProcessPerRepo.set(match.repository, match.files);
      }
    }

    for (const repository of repositories) {
      if (controller.signal.aborted) {
        break;
      }

      // Get files to process for this repository
      const filesToProcess = filesToProcessPerRepo.get(repository);
      const isMultiFile =
        isGlobMode && filesToProcess && filesToProcess.length > 1;

      // If in glob mode but no files found for this repo, skip
      if (isGlobMode && (!filesToProcess || filesToProcess.length === 0)) {
        updateStatus(
          repository,
          "skipped",
          "No matching files found in this repository.",
        );
        continue;
      }

      // Determine the file(s) to process
      const files =
        isGlobMode && filesToProcess
          ? filesToProcess
          : [{ path: trimmedFilePath, sha: "", type: "file" as const }];

      updateStatus(
        repository,
        "pending",
        isMultiFile ? `Processing ${files.length} file(s)...` : "Processing...",
      );

      try {
        // Step 1: Get the SHA of the base branch
        updateStatus(
          repository,
          "pending",
          isMultiFile
            ? `Processing ${files.length} files...`
            : "Getting base branch SHA...",
        );
        const baseSha = await fetchBranchRef(
          organization,
          repository,
          trimmedBaseBranch,
          controller.signal,
        );

        // Step 2: Create a new branch from the base branch
        updateStatus(
          repository,
          "pending",
          isMultiFile
            ? `Creating branch for ${files.length} files...`
            : "Creating branch...",
        );
        await createBranchRef(
          organization,
          repository,
          trimmedBranchName,
          baseSha,
          controller.signal,
        );

        // Process each file
        for (let fileIndex = 0; fileIndex < files.length; fileIndex++) {
          const file = files[fileIndex];
          const currentFilePath = file.path;

          // Step 3: Fetch current file contents (if exists)
          updateStatus(
            repository,
            "pending",
            isMultiFile
              ? `Processing ${currentFilePath} (${fileIndex + 1}/${files.length})...`
              : "Fetching file contents...",
          );
          let originalContent = "";
          let fileSha: string | undefined;

          const fileContent = await fetchFileContents(
            organization,
            repository,
            currentFilePath,
            trimmedBaseBranch,
            controller.signal,
          );

          if (fileContent) {
            // File exists, decode content
            originalContent = decodeBase64(fileContent.content);
            fileSha = fileContent.sha;
          }

          // Step 4: Apply the change
          updateStatus(
            repository,
            "pending",
            isMultiFile
              ? `Updating ${currentFilePath}...`
              : "Applying changes...",
          );
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
            if (
              err instanceof Error &&
              err.message.includes("Search content")
            ) {
              // Search content not found - skip this file
              if (isMultiFile) {
                console.error(
                  `Search content not found in ${currentFilePath}:`,
                  err,
                );
                continue;
              }
              updateStatus(
                repository,
                "skipped",
                "Search content not found in file.",
              );
              continue;
            }
            throw err;
          }

          // Step 5: Create or update the file in the new branch
          updateStatus(
            repository,
            "pending",
            isMultiFile ? `Saving ${currentFilePath}...` : "Updating file...",
          );
          await createOrUpdateFile(
            organization,
            repository,
            currentFilePath,
            updatedContent,
            `Update ${currentFilePath}`,
            fileSha,
            trimmedBranchName,
            controller.signal,
          );
        }

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
          isMultiFile
            ? `Successfully updated ${files.length} files and created pull request.`
            : "File updated and pull request created successfully.",
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
    isGlobMode,
    repoFileMatches,
    useRegex,
  ]);

  // Cancel operation
  const handleCancel = useCallback(() => {
    const controller = abortControllerRef.current;
    if (controller) {
      controller.abort();
      abortControllerRef.current = null;
    }

    setStatuses((previous) =>
      previous.map((entry) =>
        entry.status === "pending"
          ? {
              ...entry,
              status: "cancelled" as RepositoryActionStatus,
              message: "Operation cancelled.",
            }
          : entry,
      ),
    );
    setIsRunning(false);
  }, []);

  // Computed values
  const allCompleted = statuses.every(
    (entry) =>
      entry.status === "success" ||
      entry.status === "cancelled" ||
      entry.status === "skipped" ||
      entry.status === "error",
  );
  const hasSucceeded = statuses.some((entry) => entry.status === "success");

  const showSearchContent =
    changeType === "search-replace" || changeType === "replace";

  const isFormValid = useMemo(() => {
    const trimmedBaseBranch = baseBranch.trim();
    const trimmedFilePath = filePath.trim();
    const trimmedBranchName = branchName.trim();
    const trimmedPrTitle = prTitle.trim();
    const trimmedNewContent = newContent.trim();

    if (
      !trimmedBaseBranch ||
      !trimmedFilePath ||
      !trimmedBranchName ||
      !trimmedPrTitle ||
      !trimmedNewContent
    ) {
      return false;
    }

    if (changeType === "search-replace" && !searchContent.trim()) {
      return false;
    }

    return true;
  }, [
    baseBranch,
    filePath,
    branchName,
    prTitle,
    newContent,
    changeType,
    searchContent,
  ]);

  return {
    // Form state
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
    setPrDescription,
    useRegex,
    setUseRegex,
    sampleContent,
    setSampleContent,
    regexTestResult,

    // Status state
    statuses,
    isRunning,

    // Actions
    handleDescriptionChange,
    handleTestRegex,
    handleBulkFileEdit,
    handleCancel,

    // Computed
    allCompleted,
    hasSucceeded,
    showSearchContent,
    isFormValid,
  };
}
