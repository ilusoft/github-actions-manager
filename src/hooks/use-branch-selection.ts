import { useCallback, useMemo, useState } from "react";

export interface BranchSelectionHookResult {
  selectedBranches: Map<string, Set<string>>;
  selectedEntries: { repository: string; branch: string }[];
  selectedCount: number;
  handleBranchSelectionChange: (
    repository: string,
    branch: string,
    checked: boolean
  ) => void;
  clearSelectedBranches: () => void;
  ensureSelectionWithinRepositories: (repositories: string[]) => void;
}

export function useBranchSelection(): BranchSelectionHookResult {
  const [selectedBranchesMap, setSelectedBranchesMap] = useState<
    Map<string, Set<string>>
  >(() => new Map());

  const handleBranchSelectionChange = useCallback(
    (repository: string, branch: string, checked: boolean) => {
      setSelectedBranchesMap((previous) => {
        const current = previous.get(repository);
        const hasBranch = current?.has(branch) ?? false;

        if (checked) {
          if (hasBranch) {
            return previous;
          }

          const next = new Map(previous);
          const nextSet = new Set(current ?? []);
          nextSet.add(branch);
          next.set(repository, nextSet);
          return next;
        }

        if (!hasBranch) {
          return previous;
        }

        const next = new Map(previous);
        const nextSet = new Set(current);
        nextSet.delete(branch);

        if (nextSet.size > 0) {
          next.set(repository, nextSet);
        } else {
          next.delete(repository);
        }

        return next;
      });
    },
    []
  );

  const clearSelectedBranches = useCallback(() => {
    setSelectedBranchesMap((previous) =>
      previous.size === 0 ? previous : new Map()
    );
  }, []);

  const ensureSelectionWithinRepositories = useCallback(
    (repositories: string[]) => {
      setSelectedBranchesMap((previous) => {
        if (previous.size === 0) {
          return previous;
        }

        const allowed = new Set(repositories);
        let changed = false;
        const next = new Map<string, Set<string>>();

        previous.forEach((branches, repository) => {
          if (!allowed.has(repository)) {
            changed = true;
            return;
          }

          next.set(repository, branches);
        });

        return changed ? next : previous;
      });
    },
    []
  );

  const selectedCount = useMemo(() => {
    let count = 0;
    selectedBranchesMap.forEach((branches) => {
      count += branches.size;
    });
    return count;
  }, [selectedBranchesMap]);

  const selectedEntries = useMemo(() => {
    const entries: { repository: string; branch: string }[] = [];
    selectedBranchesMap.forEach((branches, repository) => {
      branches.forEach((branch) => {
        entries.push({ repository, branch });
      });
    });
    return entries.sort((a, b) => {
      if (a.repository === b.repository) {
        return a.branch.localeCompare(b.branch);
      }
      return a.repository.localeCompare(b.repository);
    });
  }, [selectedBranchesMap]);

  return {
    selectedBranches: selectedBranchesMap,
    selectedEntries,
    selectedCount,
    handleBranchSelectionChange,
    clearSelectedBranches,
    ensureSelectionWithinRepositories,
  };
}
