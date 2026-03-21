import { fetchGithubJson, GithubApiError } from "@/lib/github/client";
import { minimatch } from "minimatch";

export type FileChangeType =
  | "replace"
  | "prepend"
  | "append"
  | "search-replace";

interface GithubFileContent {
  content?: string;
  encoding?: string;
  sha?: string;
  name?: string;
  path?: string;
  type?: string;
}

export interface FileContentResponse {
  content: string;
  sha: string;
  encoding: string;
}

export interface FileUpdateResponse {
  content: {
    name: string;
    path: string;
    sha?: string;
    size: number;
    type: string;
  };
  commit: {
    sha: string;
    node_id: string;
    url: string;
    message: string;
    verification: unknown;
  };
}

/**
 * Fetch file contents from a repository.
 * Returns base64-encoded content that needs to be decoded.
 */
export const fetchFileContents = async (
  organization: string,
  repository: string,
  path: string,
  ref?: string,
  signal?: AbortSignal,
): Promise<FileContentResponse | null> => {
  const encodedOrg = encodeURIComponent(organization);
  const encodedRepo = encodeURIComponent(repository);
  const encodedPath = encodeURIComponent(path);

  const params = new URLSearchParams();
  if (ref) {
    params.set("ref", ref);
  }

  const queryString = params.toString();
  const pathWithQuery = queryString
    ? `/repos/${encodedOrg}/${encodedRepo}/contents/${encodedPath}?${queryString}`
    : `/repos/${encodedOrg}/${encodedRepo}/contents/${encodedPath}`;

  try {
    const response = await fetchGithubJson<GithubFileContent>({
      path: pathWithQuery,
      signal,
    });

    if (!response?.content || response.encoding !== "base64") {
      return null;
    }

    return {
      content: response.content,
      sha: response.sha ?? "",
      encoding: response.encoding,
    };
  } catch (error) {
    if (error instanceof GithubApiError && error.status === 404) {
      // File not found
      return null;
    }
    throw error;
  }
};

/**
 * Decode base64 content to string.
 */
export const decodeBase64 = (value: string): string => {
  if (typeof window !== "undefined" && typeof window.atob === "function") {
    return window.atob(value);
  }

  const nodeBuffer = (
    globalThis as {
      Buffer?: {
        from: (
          input: string,
          encoding: string,
        ) => {
          toString: (encoding: string) => string;
        };
      };
    }
  ).Buffer;

  if (nodeBuffer) {
    return nodeBuffer.from(value, "base64").toString("utf-8");
  }

  throw new GithubApiError("Unable to decode base64 content.", 500);
};

/**
 * Encode string to base64.
 */
export const encodeBase64 = (value: string): string => {
  if (typeof window !== "undefined" && typeof window.btoa === "function") {
    return window.btoa(value);
  }

  const nodeBuffer = (
    globalThis as {
      Buffer?: {
        from: (
          input: string,
          encoding: string,
        ) => {
          toString: (encoding: string) => string;
        };
      };
    }
  ).Buffer;

  if (nodeBuffer) {
    return nodeBuffer.from(value, "utf-8").toString("base64");
  }

  throw new GithubApiError("Unable to encode content to base64.", 500);
};

/**
 * Apply a change to file content based on the change type.
 */
export const applyFileChange = (
  originalContent: string,
  changeType: FileChangeType,
  searchContent: string,
  newContent: string,
  useRegex: boolean = false,
): string => {
  switch (changeType) {
    case "replace":
      // Full file replacement
      return newContent;

    case "prepend":
      // Add new content at the beginning
      return newContent + "\n" + originalContent;

    case "append":
      // Add new content at the end
      return originalContent + "\n" + newContent;

    case "search-replace":
      // Replace searchContent with newContent
      if (!searchContent) {
        throw new Error(
          "Search content is required for search-replace operation",
        );
      }
      if (useRegex) {
        return applyRegexReplace(originalContent, searchContent, newContent);
      }
      return originalContent.split(searchContent).join(newContent);

    default:
      throw new Error(`Unknown change type: ${changeType}`);
  }
};

/**
 * Apply regex-based replacement to content.
 */
export const applyRegexReplace = (
  originalContent: string,
  searchPattern: string,
  replaceWith: string,
): string => {
  try {
    const regex = new RegExp(searchPattern, "g");
    return originalContent.replace(regex, replaceWith);
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Invalid regex pattern: ${error.message}`);
    }
    throw error;
  }
};

/**
 * Test a regex pattern against sample content and return match results.
 */
export interface RegexTestResult {
  isValid: boolean;
  error?: string;
  matches: Array<{
    match: string;
    index: number;
    groups?: string[];
  }>;
  preview: string;
}

export const testRegex = (
  pattern: string,
  content: string,
  replaceWith: string,
): RegexTestResult => {
  if (!pattern) {
    return {
      isValid: false,
      error: "Pattern is required",
      matches: [],
      preview: content,
    };
  }

  try {
    const regex = new RegExp(pattern, "g");
    const matches: Array<{ match: string; index: number; groups?: string[] }> =
      [];
    let match;

    // Find all matches
    while ((match = regex.exec(content)) !== null) {
      matches.push({
        match: match[0],
        index: match.index,
        groups: match.slice(1),
      });

      // Prevent infinite loop for zero-length matches
      if (match[0].length === 0) {
        regex.lastIndex++;
      }
    }

    // Generate preview with replacements
    const preview = content.replace(regex, replaceWith);

    return {
      isValid: true,
      matches,
      preview,
    };
  } catch (error) {
    if (error instanceof SyntaxError) {
      return {
        isValid: false,
        error: error.message,
        matches: [],
        preview: content,
      };
    }
    return {
      isValid: false,
      error: "Unknown error testing regex",
      matches: [],
      preview: content,
    };
  }
};

/**
 * Create or update a file in a repository.
 */
export const createOrUpdateFile = async (
  organization: string,
  repository: string,
  path: string,
  content: string,
  message: string,
  sha?: string,
  branch?: string,
  signal?: AbortSignal,
): Promise<FileUpdateResponse> => {
  const encodedOrg = encodeURIComponent(organization);
  const encodedRepo = encodeURIComponent(repository);
  const encodedPath = encodeURIComponent(path);

  const payload: Record<string, string> = {
    message,
    content: encodeBase64(content),
  };

  if (sha) {
    payload.sha = sha;
  }

  if (branch) {
    payload.branch = branch;
  }

  return fetchGithubJson<FileUpdateResponse>({
    path: `/repos/${encodedOrg}/${encodedRepo}/contents/${encodedPath}`,
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    signal,
  });
};

// ===========================================
// Glob-based File Search (Optimized)
// ===========================================

export interface FileMatchResult {
  path: string;
  sha: string;
  type: "file" | "dir";
}

interface GithubContentsResponseItem {
  name: string;
  path: string;
  sha: string;
  type: "file" | "dir";
  size?: number;
}

// Default maximum number of API calls for glob pattern search
const DEFAULT_MAX_API_CALLS = 10;

/**
 * Check if a pattern contains glob characters.
 */
const hasGlobCharacters = (pattern: string): boolean => {
  return /[*?\[\]]/.test(pattern);
};

/**
 * Parse a glob pattern to determine the optimal search strategy.
 * Returns the initial path to fetch and whether recursive search is needed.
 */
const parseGlobPattern = (
  pattern: string,
): {
  initialPath: string;
  isRecursive: boolean;
  basePattern: string;
  hasWildcardInPath: boolean;
  wildcardPath?: string;
} => {
  // Handle recursive patterns like **/*.json
  if (pattern.startsWith("**/")) {
    return {
      initialPath: "",
      isRecursive: true,
      basePattern: pattern.slice(3), // Remove **/
      hasWildcardInPath: true,
    };
  }

  // Handle patterns like folder/*.json or *.json
  const lastSlashIndex = pattern.lastIndexOf("/");
  if (lastSlashIndex === -1) {
    // No folder, just a filename pattern in root
    return {
      initialPath: "",
      isRecursive: false,
      basePattern: pattern,
      hasWildcardInPath: hasGlobCharacters(pattern),
    };
  }

  // Pattern has a folder component
  const folder = pattern.slice(0, lastSlashIndex);
  const filePattern = pattern.slice(lastSlashIndex + 1);

  // Check if folder contains wildcards (e.g., bff/*.Common)
  const folderHasWildcards = hasGlobCharacters(folder);

  // Check if any subfolder pattern exists (e.g., folder/**/*.json)
  if (folder.includes("**")) {
    return {
      initialPath: folder.replace(/\*\*.*$/, ""), // Get the base folder before **
      isRecursive: true,
      basePattern: pattern
        .slice(folder.replace(/\*\*.*$/, "").length + 1)
        .replace(/^\*\*/, ""),
      hasWildcardInPath: true,
    };
  }

  // If folder has wildcards, we need to handle it specially
  if (folderHasWildcards) {
    // Find the first non-wildcard parent path
    const folderParts = folder.split("/");
    let basePath = "";
    let wildcardSuffix = "";

    for (let i = 0; i < folderParts.length; i++) {
      const part = folderParts[i];
      if (hasGlobCharacters(part)) {
        // This part has wildcards, use everything before as base
        wildcardSuffix = folderParts.slice(i).join("/");
        break;
      }
      basePath = basePath ? `${basePath}/${part}` : part;
    }

    return {
      initialPath: basePath,
      isRecursive: false,
      basePattern: filePattern,
      hasWildcardInPath: true,
      wildcardPath: wildcardSuffix, // Store the wildcard part to match after listing base path
    };
  }

  return {
    initialPath: folder,
    isRecursive: false,
    basePattern: filePattern,
    hasWildcardInPath: false,
  };
};

/**
 * Fetch directory contents from a repository at a specific path.
 */
const fetchDirectoryContents = async (
  organization: string,
  repository: string,
  path: string,
  ref?: string,
  signal?: AbortSignal,
): Promise<GithubContentsResponseItem[]> => {
  const encodedOrg = encodeURIComponent(organization);
  const encodedRepo = encodeURIComponent(repository);
  const encodedPath = encodeURIComponent(path);

  const params = new URLSearchParams();
  if (ref) {
    params.set("ref", ref);
  }

  const queryString = params.toString();
  const pathWithQuery = queryString
    ? `/repos/${encodedOrg}/${encodedRepo}/contents/${encodedPath}?${queryString}`
    : `/repos/${encodedOrg}/${encodedRepo}/contents/${encodedPath}`;

  try {
    const response = await fetchGithubJson<GithubContentsResponseItem[]>({
      path: pathWithQuery,
      signal,
    });

    // Contents API returns an array for directories, object for files
    if (Array.isArray(response)) {
      return response;
    }
    return [];
  } catch (error) {
    if (error instanceof GithubApiError && error.status === 404) {
      return [];
    }
    throw error;
  }
};

/**
 * Recursively search for files matching a glob pattern.
 * Uses optimized algorithm to minimize API calls.
 * @param maxApiCalls - Maximum number of API calls to prevent excessive requests (default: 10)
 */
export const findMatchingFiles = async (
  organization: string,
  repository: string,
  pattern: string,
  ref?: string,
  signal?: AbortSignal,
  onProgress?: (found: number) => void,
  maxApiCalls: number = DEFAULT_MAX_API_CALLS,
): Promise<FileMatchResult[]> => {
  const results: FileMatchResult[] = [];
  let apiCallCount = 0;

  // If no glob characters, it's an exact file path - single API call
  if (!hasGlobCharacters(pattern)) {
    const fileContent = await fetchFileContents(
      organization,
      repository,
      pattern,
      ref,
      signal,
    );

    if (fileContent) {
      results.push({
        path: pattern,
        sha: fileContent.sha,
        type: "file",
      });
    }
    return results;
  }

  // Parse the glob pattern to determine search strategy
  const {
    initialPath,
    isRecursive,
    basePattern,
    hasWildcardInPath,
    wildcardPath,
  } = parseGlobPattern(pattern);

  // If there's a wildcard in the path (e.g., bff/*.common/*.csproj), we need recursive search
  const shouldSearchRecursively = isRecursive || hasWildcardInPath;

  // Track visited directories to avoid duplicate API calls
  const visitedDirs = new Set<string>();

  // Queue of directories to explore
  const dirsToExplore: string[] = [initialPath];

  // When there's a wildcard in the path, build the full pattern for directory matching
  // e.g., for "bff/*.common/*.csproj", the wildcardPath is "*.common/" and we want to match directories against "*.common"
  const directoryMatchPattern =
    hasWildcardInPath && wildcardPath
      ? wildcardPath.replace(/\/$/, "") // Remove trailing slash for directory matching
      : "";

  // minimatch options for case-insensitive matching (useful for patterns like *.Common)
  const minimatchOptions = { nocase: true };

  while (dirsToExplore.length > 0 && apiCallCount < maxApiCalls) {
    const currentPath = dirsToExplore.shift()!;

    // Skip if already visited
    if (visitedDirs.has(currentPath)) {
      continue;
    }
    visitedDirs.add(currentPath);
    apiCallCount++;

    // Stop if we've reached the API call limit
    if (apiCallCount >= maxApiCalls) {
      break;
    }

    // Fetch directory contents
    const contents = await fetchDirectoryContents(
      organization,
      repository,
      currentPath,
      ref,
      signal,
    );

    for (const item of contents) {
      if (item.type === "file") {
        // Check if filename matches the pattern
        const relativePath = currentPath
          ? `${currentPath}/${item.name}`
          : item.name;

        if (
          minimatch(relativePath, pattern, minimatchOptions) ||
          minimatch(item.name, basePattern, minimatchOptions)
        ) {
          results.push({
            path: relativePath,
            sha: item.sha,
            type: "file",
          });
          onProgress?.(results.length);
        }
      } else if (item.type === "dir") {
        // Determine if we should explore this subdirectory
        let shouldExplore = shouldSearchRecursively;

        // If there's a wildcard path (e.g., *.common/), check if directory matches
        if (hasWildcardInPath && directoryMatchPattern) {
          // Build the relative path from the initial path to check against wildcard
          const pathFromInitial = currentPath
            ? `${currentPath}/${item.name}`.replace(
                new RegExp(`^${initialPath}/?`),
                "",
              )
            : item.name;

          // Check if this directory matches the wildcard pattern
          // e.g., for pattern "bff/*.common/*.csproj", check if "PRQXDashboard.Common" matches "*.common"
          // Use case-insensitive matching since filesystem paths may have different case
          shouldExplore =
            minimatch(item.name, directoryMatchPattern, minimatchOptions) ||
            minimatch(pathFromInitial, directoryMatchPattern, minimatchOptions);
        }

        if (shouldExplore) {
          // Add subdirectory to explore queue
          const newPath = currentPath
            ? `${currentPath}/${item.name}`
            : item.name;
          dirsToExplore.push(newPath);
        }
      }
    }
  }

  return results;
};

/**
 * Find files matching a pattern with minimum API calls.
 * Optimized based on pattern complexity:
 * - Exact path: 1 call
 * - folder/filename.json: 1 call to folder
 * - Recursive patterns: recursive search
 * @param maxApiCalls - Maximum number of API calls to prevent excessive requests (default: 10)
 */
export const findFilesOptimized = async (
  organization: string,
  repository: string,
  pattern: string,
  ref?: string,
  signal?: AbortSignal,
  maxApiCalls: number = DEFAULT_MAX_API_CALLS,
): Promise<FileMatchResult[]> => {
  return findMatchingFiles(
    organization,
    repository,
    pattern,
    ref,
    signal,
    undefined,
    maxApiCalls,
  );
};
