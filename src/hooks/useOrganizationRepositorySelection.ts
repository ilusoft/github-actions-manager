import { useCallback, useEffect, useMemo, useState } from "react"

import { GITHUB_ACCESS_TOKEN_EVENT } from "./useGithubAccessToken"

const STORAGE_KEY = "github-actions-manager.selection"

type RepositorySelection = {
  name: string
  enabled: boolean
}

type SelectionState = {
  organization: string
  repositories: RepositorySelection[]
}

const defaultState: SelectionState = {
  organization: "",
  repositories: [],
}

const normalizeOrganization = (value: string) => value.trim()

const readState = (): SelectionState => {
  if (typeof window === "undefined") {
    return defaultState
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return defaultState
    }

    const parsed = JSON.parse(raw) as SelectionState
    if (!parsed || typeof parsed !== "object") {
      return defaultState
    }

    const organization =
      typeof parsed.organization === "string" ? normalizeOrganization(parsed.organization) : ""
    const repositories = Array.isArray(parsed.repositories)
      ? parsed.repositories
          .filter((item): item is RepositorySelection =>
            Boolean(item && typeof item.name === "string" && typeof item.enabled === "boolean")
          )
          .map((item) => ({ name: item.name, enabled: item.enabled }))
      : []

    return {
      organization,
      repositories,
    }
  } catch (error) {
    console.warn("Failed to read stored selection", error)
    return defaultState
  }
}

const writeState = (state: SelectionState) => {
  if (typeof window === "undefined") {
    return
  }

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch (error) {
    console.warn("Failed to persist selection", error)
  }
}

export function useOrganizationRepositorySelection() {
  const [state, setState] = useState<SelectionState>(() => readState())

  const setOrganization = useCallback((organization: string) => {
    const normalized = normalizeOrganization(organization)
    setState((prev) => {
      if (prev.organization === normalized) {
        writeState(prev)
        return prev
      }

      const next: SelectionState = normalized
        ? { organization: normalized, repositories: [] }
        : defaultState

      writeState(next)
      return next
    })
  }, [])

  const addRepository = useCallback((name: string) => {
    const trimmed = name.trim()
    if (!trimmed) {
      return
    }

    setState((prev) => {
      if (!prev.organization) {
        return prev
      }

      if (prev.repositories.some((repo) => repo.name.toLowerCase() === trimmed.toLowerCase())) {
        return prev
      }

      const next = {
        ...prev,
        repositories: [...prev.repositories, { name: trimmed, enabled: true }],
      }
      writeState(next)
      return next
    })
  }, [])

  const toggleRepository = useCallback((name: string, enabled: boolean) => {
    setState((prev) => {
      const next = {
        ...prev,
        repositories: prev.repositories.map((repo) =>
          repo.name === name ? { ...repo, enabled } : repo
        ),
      }
      writeState(next)
      return next
    })
  }, [])

  const removeRepository = useCallback((name: string) => {
    setState((prev) => {
      const next = {
        ...prev,
        repositories: prev.repositories.filter((repo) => repo.name !== name),
      }
      writeState(next)
      return next
    })
  }, [])

  const reorderRepositories = useCallback((orderedNames: string[]) => {
    setState((prev) => {
      if (!prev.organization) {
        return prev
      }

      const nameSet = new Set(orderedNames)
      const mapped = orderedNames
        .map((name) => prev.repositories.find((repo) => repo.name === name))
        .filter((repo): repo is RepositorySelection => Boolean(repo))

      const remaining = prev.repositories.filter((repo) => !nameSet.has(repo.name))
      const nextRepositories = [...mapped, ...remaining]

      if (arraysHaveSameOrder(prev.repositories, nextRepositories)) {
        return prev
      }

      const nextState: SelectionState = {
        ...prev,
        repositories: nextRepositories,
      }

      writeState(nextState)
      return nextState
    })
  }, [])

  const clearAll = useCallback(() => {
    setState(() => {
      writeState(defaultState)
      return defaultState
    })
  }, [])

  useEffect(() => {
    if (typeof window === "undefined") {
      return
    }

    const handleStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) {
        setState(readState())
      }
    }

    const handleTokenChange = () => {
      setState(() => {
        writeState(defaultState)
        return defaultState
      })
    }

    window.addEventListener("storage", handleStorage)
    window.addEventListener(GITHUB_ACCESS_TOKEN_EVENT, handleTokenChange)

    return () => {
      window.removeEventListener("storage", handleStorage)
      window.removeEventListener(GITHUB_ACCESS_TOKEN_EVENT, handleTokenChange)
    }
  }, [])

  const selectedRepositories = useMemo(
    () => state.repositories.filter((repo) => repo.enabled).map((repo) => repo.name),
    [state.repositories]
  )

  return {
    organization: state.organization,
    repositories: state.repositories,
    selectedRepositories,
    setOrganization,
    addRepository,
    toggleRepository,
    removeRepository,
    reorderRepositories,
    clearAll,
  }
}

const arraysHaveSameOrder = (
  left: RepositorySelection[],
  right: RepositorySelection[]
) => {
  if (left.length !== right.length) {
    return false
  }

  for (let index = 0; index < left.length; index += 1) {
    if (left[index].name !== right[index].name) {
      return false
    }
  }

  return true
}
