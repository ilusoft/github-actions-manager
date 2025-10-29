import { useCallback, useMemo, useState } from "react";

export interface RepositorySelectionHookResult {
  selectedRepositories: Set<string>;
  selectedRepositoriesArray: string[];
  handleRepositorySelectionChange: (repository: string, checked: boolean) => void;
  clearSelection: () => void;
}

export function useRepositorySelection(): RepositorySelectionHookResult {
  const [selectedRepositories, setSelectedRepositories] = useState<Set<string>>(
    () => new Set()
  );

  const handleRepositorySelectionChange = useCallback(
    (repository: string, checked: boolean) => {
      setSelectedRepositories((previous) => {
        const next = new Set(previous);
        if (checked) {
          next.add(repository);
        } else {
          next.delete(repository);
        }
        return next;
      });
    },
    []
  );

  const clearSelection = useCallback(() => {
    setSelectedRepositories((previous) =>
      previous.size === 0 ? previous : new Set()
    );
  }, []);

  const selectedRepositoriesArray = useMemo(
    () => Array.from(selectedRepositories),
    [selectedRepositories]
  );

  return {
    selectedRepositories,
    selectedRepositoriesArray,
    handleRepositorySelectionChange,
    clearSelection,
  };
}
