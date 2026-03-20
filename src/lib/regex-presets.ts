import type {
  RegexPreset,
  RegexPresetsStorage,
} from "@/types/repository-dashboard";

const STORAGE_KEY = "github-actions-manager-regex-presets";

const generateId = () =>
  `preset-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

export const DEFAULT_PRESETS: RegexPreset[] = [
  {
    id: "builtin-package-version",
    name: "Package Version",
    description: 'Replace package version (e.g., "package": "1.0.0")',
    searchPattern: '("[@a-zA-Z0-9_-]+/[a-zA-Z0-9_-]+":\\s*")[^"]+(")',
    replaceWith: "$1NEW_VERSION$2",
    isBuiltIn: true,
    createdAt: "2024-01-01T00:00:00Z",
  },
  {
    id: "builtin-env-variable",
    name: "Environment Variable",
    description: "Replace environment variable values",
    searchPattern: "(ENV_[A-Z_]+=)(.+)",
    replaceWith: "$1new_value",
    isBuiltIn: true,
    createdAt: "2024-01-01T00:00:00Z",
  },
  {
    id: "builtin-json-key",
    name: "JSON Key Value",
    description: "Replace a specific JSON key's value",
    searchPattern: '("keyName":\\s*")[^"]+(")',
    replaceWith: "$1newValue$2",
    isBuiltIn: true,
    createdAt: "2024-01-01T00:00:00Z",
  },
  {
    id: "builtin-npm-version",
    name: "NPM Package Version",
    description: 'Replace npm package version like "package": "^1.0.0"',
    searchPattern: '("@[a-zA-Z0-9_-]+/[a-zA-Z0-9_-]+":\\s*")[^"]+(")',
    replaceWith: "$1^NEW_VERSION$2",
    isBuiltIn: true,
    createdAt: "2024-01-01T00:00:00Z",
  },
  {
    id: "builtin-semver",
    name: "Semantic Version",
    description: "Replace semantic version numbers (x.y.z)",
    searchPattern: "\\d+\\.\\d+\\.\\d+(-[a-zA-Z0-9.]+)?",
    replaceWith: "1.0.0",
    isBuiltIn: true,
    createdAt: "2024-01-01T00:00:00Z",
  },
  {
    id: "builtin-url",
    name: "URL Replacement",
    description: "Replace URLs in configuration",
    searchPattern: "https?://[a-zA-Z0-9.-]+(?:/[^\\s]*)?",
    replaceWith: "https://new-url.example.com",
    isBuiltIn: true,
    createdAt: "2024-01-01T00:00:00Z",
  },
  {
    id: "builtin-import-path",
    name: "Import Path",
    description: "Replace import/require paths",
    searchPattern: "(from\\s+['\"]|require\\(['\"])[^'\"]+(['\"])",
    replaceWith: "$1new/path$2",
    isBuiltIn: true,
    createdAt: "2024-01-01T00:00:00Z",
  },
];

export const loadPresets = (): RegexPreset[] => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const data: RegexPresetsStorage = JSON.parse(stored);
      // Merge default presets with user presets, avoiding duplicates
      const userPresetIds = new Set(data.presets.map((p) => p.id));
      const filteredDefaults = DEFAULT_PRESETS.filter(
        (dp) => !userPresetIds.has(dp.id),
      );
      return [...filteredDefaults, ...data.presets];
    }
  } catch (error) {
    console.error("Failed to load regex presets:", error);
  }
  return [...DEFAULT_PRESETS];
};

export const savePreset = (
  preset: Omit<RegexPreset, "id" | "isBuiltIn" | "createdAt">,
): RegexPreset => {
  const newPreset: RegexPreset = {
    ...preset,
    id: generateId(),
    isBuiltIn: false,
    createdAt: new Date().toISOString(),
  };

  const presets = loadPresets();
  presets.push(newPreset);
  persistPresets(presets);
  return newPreset;
};

export const updatePreset = (
  id: string,
  updates: Partial<Omit<RegexPreset, "id" | "isBuiltIn" | "createdAt">>,
): RegexPreset | null => {
  const presets = loadPresets();
  const index = presets.findIndex((p) => p.id === id);

  if (index === -1 || presets[index].isBuiltIn) {
    return null;
  }

  presets[index] = { ...presets[index], ...updates };
  persistPresets(presets);
  return presets[index];
};

export const deletePreset = (id: string): boolean => {
  const presets = loadPresets();
  const preset = presets.find((p) => p.id === id);

  if (!preset || preset.isBuiltIn) {
    return false;
  }

  const filtered = presets.filter((p) => p.id !== id);
  persistPresets(filtered);
  return true;
};

const persistPresets = (presets: RegexPreset[]): void => {
  try {
    const userPresets = presets.filter((p) => !p.isBuiltIn);
    const data: RegexPresetsStorage = {
      presets: userPresets,
      lastUpdated: new Date().toISOString(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (error) {
    console.error("Failed to save regex presets:", error);
  }
};

export const testPreset = (
  preset: RegexPreset,
  sampleContent: string,
): {
  isValid: boolean;
  matches: string[];
  preview: string | null;
  error?: string;
} => {
  try {
    const regex = new RegExp(preset.searchPattern, "g");
    const matches = sampleContent.match(regex) || [];

    if (matches.length === 0) {
      return {
        isValid: true,
        matches: [],
        preview: null,
      };
    }

    const preview = sampleContent.replace(regex, preset.replaceWith);
    return {
      isValid: true,
      matches,
      preview,
    };
  } catch (error) {
    return {
      isValid: false,
      matches: [],
      preview: null,
      error: error instanceof Error ? error.message : "Invalid regex pattern",
    };
  }
};
