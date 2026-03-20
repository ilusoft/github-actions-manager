import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "github-actions-manager.repository-groups";

export interface RepositoryGroupItem {
  name: string;
  enabled: boolean;
}

export interface RepositoryGroup {
  id: string;
  name: string;
  enabled: boolean;
  repositories: RepositoryGroupItem[];
}

export interface RepositoryGroupsState {
  organization: string;
  groups: RepositoryGroup[];
}

const defaultState: RepositoryGroupsState = {
  organization: "",
  groups: [],
};

// Module-level state to share across all hook instances
let sharedState: RepositoryGroupsState = defaultState;
let stateListeners: Array<{
  listener: (state: RepositoryGroupsState) => void;
  scheduled: boolean;
}> = [];

// Defer state updates to avoid "update while rendering" error
const notifyListeners = () => {
  // Mark all listeners as needing an update
  stateListeners.forEach((item) => {
    item.scheduled = true;
  });

  // Schedule the actual updates in a microtask
  queueMicrotask(() => {
    stateListeners.forEach((item) => {
      if (item.scheduled) {
        item.scheduled = false;
        item.listener(sharedState);
      }
    });
  });
};

const generateId = () => Math.random().toString(36).substring(2, 15);

const normalizeOrganization = (value: string) => value.trim();

const readState = (): RepositoryGroupsState => {
  if (typeof window === "undefined") {
    return defaultState;
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return defaultState;
    }

    const parsed = JSON.parse(raw) as RepositoryGroupsState;
    if (!parsed || typeof parsed !== "object") {
      return defaultState;
    }

    const organization =
      typeof parsed.organization === "string"
        ? normalizeOrganization(parsed.organization)
        : "";
    const groups = Array.isArray(parsed.groups)
      ? parsed.groups
          .filter((group): group is RepositoryGroup =>
            Boolean(
              group &&
              typeof group.id === "string" &&
              typeof group.name === "string",
            ),
          )
          .map((group) => ({
            id: group.id,
            name: group.name,
            enabled: Boolean(group.enabled),
            repositories: Array.isArray(group.repositories)
              ? group.repositories
                  .filter((repo): repo is RepositoryGroupItem =>
                    Boolean(repo && typeof repo.name === "string"),
                  )
                  .map((repo) => ({
                    name: repo.name,
                    enabled: Boolean(repo.enabled),
                  }))
              : [],
          }))
      : [];

    return { organization, groups };
  } catch (error) {
    console.warn("Failed to parse repository groups from storage", error);
    return defaultState;
  }
};

const writeState = (state: RepositoryGroupsState) => {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.warn("Failed to save repository groups to storage", error);
  }
};

interface UseRepositoryGroupsOptions {
  externalOrganization?: string;
}

interface UseRepositoryGroupsReturn {
  organization: string;
  groups: RepositoryGroup[];
  setOrganization: (organization: string) => void;
  createGroup: (name: string) => void;
  updateGroupName: (groupId: string, name: string) => void;
  toggleGroupEnabled: (groupId: string) => void;
  deleteGroup: (groupId: string) => void;
  addRepositoryToGroup: (groupId: string, repositoryName: string) => void;
  removeRepositoryFromGroup: (groupId: string, repositoryName: string) => void;
  toggleRepositoryInGroup: (groupId: string, repositoryName: string) => void;
  getEnabledRepositories: () => string[];
  getEnabledRepositoriesInGroup: (groupId: string) => string[];
  exportConfiguration: () => string;
  importConfiguration: (json: string) => boolean;
  clearAll: () => void;
}

export function useRepositoryGroups(
  options: UseRepositoryGroupsOptions = {},
): UseRepositoryGroupsReturn {
  const { externalOrganization } = options;

  // Initialize state from shared state or storage
  const [state, setState] = useState<RepositoryGroupsState>(() => {
    // If we have shared state with data, use it
    if (sharedState.organization || sharedState.groups.length > 0) {
      return sharedState;
    }
    // Otherwise read from storage
    const stored = readState();
    sharedState = stored;
    return stored;
  });

  // Subscribe to state changes
  useEffect(() => {
    const listener = (newState: RepositoryGroupsState) => {
      setState(newState);
    };
    const wrappedListener = { listener, scheduled: false };
    stateListeners.push(wrappedListener);

    return () => {
      stateListeners = stateListeners.filter((l) => l !== wrappedListener);
    };
  }, []);

  // Sync with external organization when it changes
  useEffect(() => {
    if (externalOrganization && state.organization !== externalOrganization) {
      const newState = { ...state, organization: externalOrganization };
      sharedState = newState;
      writeState(newState);
      notifyListeners();
      setState(newState);
    }
  }, [externalOrganization, state.organization]);

  // Update organization and clear groups when org changes
  const setOrganization = useCallback((organization: string) => {
    const normalized = normalizeOrganization(organization);
    const newState =
      sharedState.organization === normalized
        ? sharedState
        : normalized
          ? { organization: normalized, groups: sharedState.groups }
          : defaultState;

    sharedState = newState;
    writeState(newState);
    notifyListeners();
    setState(newState);
  }, []);

  // Create a new group
  const createGroup = useCallback((name: string) => {
    const trimmed = name.trim();
    if (!trimmed) {
      return;
    }

    setState((prev) => {
      if (!prev.organization) {
        return prev;
      }

      // Check if group with same name exists
      if (
        prev.groups.some((g) => g.name.toLowerCase() === trimmed.toLowerCase())
      ) {
        return prev;
      }

      const newGroup: RepositoryGroup = {
        id: generateId(),
        name: trimmed,
        enabled: false,
        repositories: [],
      };

      const next = { ...prev, groups: [...prev.groups, newGroup] };
      sharedState = next;
      writeState(next);
      notifyListeners();
      return next;
    });
  }, []);

  // Update group name
  const updateGroupName = useCallback((groupId: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) {
      return;
    }

    setState((prev) => {
      const next: RepositoryGroupsState = {
        ...prev,
        groups: prev.groups.map((g) =>
          g.id === groupId ? { ...g, name: trimmed } : g,
        ),
      };
      sharedState = next;
      writeState(next);
      notifyListeners();
      return next;
    });
  }, []);

  // Toggle group enabled state
  const toggleGroupEnabled = useCallback((groupId: string) => {
    setState((prev) => {
      const next: RepositoryGroupsState = {
        ...prev,
        groups: prev.groups.map((g) =>
          g.id === groupId ? { ...g, enabled: !g.enabled } : g,
        ),
      };
      sharedState = next;
      writeState(next);
      notifyListeners();
      return next;
    });
  }, []);

  // Delete a group
  const deleteGroup = useCallback((groupId: string) => {
    setState((prev) => {
      const next: RepositoryGroupsState = {
        ...prev,
        groups: prev.groups.filter((g) => g.id !== groupId),
      };
      sharedState = next;
      writeState(next);
      notifyListeners();
      return next;
    });
  }, []);

  // Add repository to group
  const addRepositoryToGroup = useCallback(
    (groupId: string, repositoryName: string) => {
      const trimmed = repositoryName.trim();
      if (!trimmed) {
        return;
      }

      setState((prev) => {
        const next: RepositoryGroupsState = {
          ...prev,
          groups: prev.groups.map((g) =>
            g.id === groupId
              ? {
                  ...g,
                  repositories: g.repositories.some(
                    (r) => r.name.toLowerCase() === trimmed.toLowerCase(),
                  )
                    ? g.repositories
                    : [
                        ...g.repositories,
                        { name: trimmed, enabled: true } as RepositoryGroupItem,
                      ],
                }
              : g,
          ),
        };
        sharedState = next;
        writeState(next);
        notifyListeners();
        return next;
      });
    },
    [],
  );

  // Remove repository from group
  const removeRepositoryFromGroup = useCallback(
    (groupId: string, repositoryName: string) => {
      setState((prev) => {
        const next: RepositoryGroupsState = {
          ...prev,
          groups: prev.groups.map((g) =>
            g.id === groupId
              ? {
                  ...g,
                  repositories: g.repositories.filter(
                    (r) => r.name !== repositoryName,
                  ),
                }
              : g,
          ),
        };
        sharedState = next;
        writeState(next);
        notifyListeners();
        return next;
      });
    },
    [],
  );

  // Toggle repository enabled state within a group
  const toggleRepositoryInGroup = useCallback(
    (groupId: string, repositoryName: string) => {
      setState((prev) => {
        const next: RepositoryGroupsState = {
          ...prev,
          groups: prev.groups.map((g) =>
            g.id === groupId
              ? {
                  ...g,
                  repositories: g.repositories.map((r) =>
                    r.name === repositoryName
                      ? { ...r, enabled: !r.enabled }
                      : r,
                  ),
                }
              : g,
          ),
        };
        sharedState = next;
        writeState(next);
        notifyListeners();
        return next;
      });
    },
    [],
  );

  // Get all enabled repositories from all enabled groups
  const getEnabledRepositories = useCallback(() => {
    return state.groups
      .filter((g) => g.enabled)
      .flatMap((g) =>
        g.repositories.filter((r) => r.enabled).map((r) => r.name),
      );
  }, [state.groups]);

  // Get all enabled repositories from a specific group
  const getEnabledRepositoriesInGroup = useCallback(
    (groupId: string) => {
      const group = state.groups.find((g) => g.id === groupId);
      if (!group || !group.enabled) {
        return [];
      }
      return group.repositories.filter((r) => r.enabled).map((r) => r.name);
    },
    [state.groups],
  );

  // Export configuration
  const exportConfiguration = useCallback(() => {
    return JSON.stringify(state, null, 2);
  }, [state]);

  // Import configuration
  const importConfiguration = useCallback((json: string) => {
    try {
      const parsed = JSON.parse(json) as RepositoryGroupsState;
      if (!parsed || typeof parsed !== "object") {
        return false;
      }

      const organization =
        typeof parsed.organization === "string"
          ? normalizeOrganization(parsed.organization)
          : "";
      const groups = Array.isArray(parsed.groups)
        ? parsed.groups
            .filter((g): g is RepositoryGroup =>
              Boolean(
                g && typeof g.id === "string" && typeof g.name === "string",
              ),
            )
            .map((g) => ({
              id: g.id,
              name: g.name,
              enabled: Boolean(g.enabled),
              repositories: Array.isArray(g.repositories)
                ? g.repositories
                    .filter((r): r is RepositoryGroupItem =>
                      Boolean(r && typeof r.name === "string"),
                    )
                    .map((r) => ({
                      name: r.name,
                      enabled: Boolean(r.enabled),
                    }))
                : [],
            }))
        : [];

      const next = { organization, groups };
      sharedState = next;
      writeState(next);
      notifyListeners();
      setState(next);
      return true;
    } catch (error) {
      console.warn("Failed to import repository groups", error);
      return false;
    }
  }, []);

  // Clear all
  const clearAll = useCallback(() => {
    sharedState = defaultState;
    writeState(defaultState);
    notifyListeners();
    setState(defaultState);
  }, []);

  // Sync from localStorage when it changes (from other tabs)
  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY && event.newValue) {
        try {
          const parsed = JSON.parse(event.newValue) as RepositoryGroupsState;
          if (parsed && parsed.organization === state.organization) {
            sharedState = parsed;
            notifyListeners();
            setState(parsed);
          }
        } catch (error) {
          console.warn("Failed to sync repository groups from storage", error);
        }
      }
    };

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [state.organization]);

  return {
    organization: state.organization,
    groups: state.groups,
    setOrganization,
    createGroup,
    updateGroupName,
    toggleGroupEnabled,
    deleteGroup,
    addRepositoryToGroup,
    removeRepositoryFromGroup,
    toggleRepositoryInGroup,
    getEnabledRepositories,
    getEnabledRepositoriesInGroup,
    exportConfiguration,
    importConfiguration,
    clearAll,
  };
}
