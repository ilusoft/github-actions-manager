import { useCallback, useEffect, useMemo, useState } from "react";

export type DeploymentGridPreferences = {
  order: string[];
  hidden: string[];
};

const STORAGE_PREFIX = "github-actions-manager.deployment-grid";
const defaultPreferences: DeploymentGridPreferences = {
  order: [],
  hidden: [],
};

const sanitizePreferences = (
  preferences: DeploymentGridPreferences
): DeploymentGridPreferences => {
  const uniqueOrder: string[] = [];
  const seenOrder = new Set<string>();
  preferences.order.forEach((key) => {
    const normalized = key.trim().toLowerCase();
    if (!normalized || seenOrder.has(normalized)) {
      return;
    }
    seenOrder.add(normalized);
    uniqueOrder.push(normalized);
  });

  const uniqueHidden: string[] = [];
  const seenHidden = new Set<string>();
  preferences.hidden.forEach((key) => {
    const normalized = key.trim().toLowerCase();
    if (!normalized || seenHidden.has(normalized)) {
      return;
    }
    seenHidden.add(normalized);
    uniqueHidden.push(normalized);
  });

  return {
    order: uniqueOrder,
    hidden: uniqueHidden,
  };
};

const isDefaultPreferences = (preferences: DeploymentGridPreferences) =>
  preferences.order.length === 0 && preferences.hidden.length === 0;

const getStorageKey = (organization?: string) => {
  if (!organization) {
    return null;
  }

  return `${STORAGE_PREFIX}.${organization.toLowerCase()}`;
};

const readPreferences = (organization?: string): DeploymentGridPreferences => {
  if (typeof window === "undefined") {
    return defaultPreferences;
  }

  const storageKey = getStorageKey(organization);
  if (!storageKey) {
    return defaultPreferences;
  }

  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) {
      return defaultPreferences;
    }

    const parsed = JSON.parse(raw) as DeploymentGridPreferences | null;
    if (!parsed || typeof parsed !== "object") {
      return defaultPreferences;
    }

    const sanitized = sanitizePreferences(parsed);
    return sanitized;
  } catch (error) {
    console.warn("Failed to read deployment grid preferences", error);
    return defaultPreferences;
  }
};

const writePreferences = (organization: string | undefined, preferences: DeploymentGridPreferences) => {
  if (typeof window === "undefined") {
    return;
  }

  const storageKey = getStorageKey(organization);
  if (!storageKey) {
    return;
  }

  const sanitized = sanitizePreferences(preferences);

  try {
    if (isDefaultPreferences(sanitized)) {
      window.localStorage.removeItem(storageKey);
      return;
    }

    window.localStorage.setItem(storageKey, JSON.stringify(sanitized));
  } catch (error) {
    console.warn("Failed to write deployment grid preferences", error);
  }
};

export function useDeploymentGridPreferences(organization?: string) {
  const [preferences, setPreferences] = useState<DeploymentGridPreferences>(() =>
    readPreferences(organization)
  );

  useEffect(() => {
    setPreferences(readPreferences(organization));
  }, [organization]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const storageKey = getStorageKey(organization);
    if (!storageKey) {
      return;
    }

    const handleStorage = (event: StorageEvent) => {
      if (event.key === storageKey) {
        setPreferences(readPreferences(organization));
      }
    };

    window.addEventListener("storage", handleStorage);

    return () => {
      window.removeEventListener("storage", handleStorage);
    };
  }, [organization]);

  const updatePreferences = useCallback(
    (updater: (prev: DeploymentGridPreferences) => DeploymentGridPreferences) => {
      setPreferences((previous) => {
        const next = sanitizePreferences(updater(previous));

        if (
          previous.order.length === next.order.length &&
          previous.hidden.length === next.hidden.length &&
          previous.order.every((value, index) => value === next.order[index]) &&
          previous.hidden.every((value, index) => value === next.hidden[index])
        ) {
          return previous;
        }

        writePreferences(organization, next);
        return next;
      });
    },
    [organization]
  );

  const resetPreferences = useCallback(() => {
    setPreferences((previous) => {
      if (
        previous.order.length === 0 &&
        previous.hidden.length === 0
      ) {
        return previous;
      }

      writePreferences(organization, defaultPreferences);
      return defaultPreferences;
    });
  }, [organization]);

  const helpers = useMemo(
    () => ({
      preferences,
      updatePreferences,
      resetPreferences,
    }),
    [preferences, updatePreferences, resetPreferences]
  );

  return helpers;
}
