import { useCallback, useMemo, useState } from "react";

export interface PullRequestSelectionEntry {
  repository: string;
  number: number;
  title: string;
  url: string;
  headSha?: string;
}

interface PullRequestSelectionHookResult {
  selectedMap: Map<string, Map<number, PullRequestSelectionEntry>>;
  selectedIdsByRepository: Map<string, Set<number>>;
  selectedEntries: PullRequestSelectionEntry[];
  selectedCount: number;
  handlePullRequestSelectionChange: (
    repository: string,
    pullRequest: PullRequestSelectionEntry,
    checked: boolean
  ) => void;
  clearSelectedPullRequests: () => void;
  ensureSelectionWithinRepositories: (repositories: string[]) => void;
}

const createEmptySelection = () => new Map<string, Map<number, PullRequestSelectionEntry>>();

export function usePullRequestSelection(): PullRequestSelectionHookResult {
  const [selectedMap, setSelectedMap] = useState(createEmptySelection);

  const handlePullRequestSelectionChange = useCallback<
    PullRequestSelectionHookResult["handlePullRequestSelectionChange"]
  >((repository, pullRequest, checked) => {
    setSelectedMap((previous) => {
      const current = new Map(previous);
      const repositoryMap = new Map(current.get(repository) ?? []);

      if (checked) {
        repositoryMap.set(pullRequest.number, pullRequest);
        current.set(repository, repositoryMap);
        return current;
      }

      if (!repositoryMap.has(pullRequest.number)) {
        return previous;
      }

      repositoryMap.delete(pullRequest.number);
      if (repositoryMap.size === 0) {
        current.delete(repository);
      } else {
        current.set(repository, repositoryMap);
      }

      return current;
    });
  }, []);

  const clearSelectedPullRequests = useCallback(() => {
    setSelectedMap((previous) => (previous.size === 0 ? previous : createEmptySelection()));
  }, []);

  const ensureSelectionWithinRepositories = useCallback(
    (repositories: string[]) => {
      const allowed = new Set(repositories);
      setSelectedMap((previous) => {
        if (previous.size === 0) {
          return previous;
        }

        let changed = false;
        const next = new Map<string, Map<number, PullRequestSelectionEntry>>();

        previous.forEach((prMap, repository) => {
          if (!allowed.has(repository)) {
            changed = true;
            return;
          }

          next.set(repository, prMap);
        });

        return changed ? next : previous;
      });
    },
    []
  );

  const selectedEntries = useMemo(() => {
    const entries: PullRequestSelectionEntry[] = [];
    selectedMap.forEach((prMap) => {
      prMap.forEach((entry) => {
        entries.push(entry);
      });
    });

    return entries.sort((a, b) => {
      if (a.repository === b.repository) {
        return a.number - b.number;
      }
      return a.repository.localeCompare(b.repository);
    });
  }, [selectedMap]);

  const selectedIdsByRepository = useMemo(() => {
    const result = new Map<string, Set<number>>();
    selectedMap.forEach((prMap, repository) => {
      result.set(repository, new Set(prMap.keys()));
    });
    return result;
  }, [selectedMap]);

  return {
    selectedMap,
    selectedIdsByRepository,
    selectedEntries,
    selectedCount: selectedEntries.length,
    handlePullRequestSelectionChange,
    clearSelectedPullRequests,
    ensureSelectionWithinRepositories,
  };
}
