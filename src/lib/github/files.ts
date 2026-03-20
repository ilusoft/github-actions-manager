import { fetchGithubJson, GithubApiError } from "@/lib/github/client";

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
