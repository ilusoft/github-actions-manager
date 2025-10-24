import { useCallback, useEffect, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"

const STORAGE_KEY = "github-actions-manager.access-token"
const STORAGE_EVENT = "github-access-token-change"
export const GITHUB_ACCESS_TOKEN_EVENT = STORAGE_EVENT

const readHasToken = () => {
  if (typeof window === "undefined") {
    return false
  }

  const value = window.localStorage.getItem(STORAGE_KEY)
  return Boolean(value)
}

export function useGithubAccessToken() {
  const [hasToken, setHasToken] = useState<boolean>(() => readHasToken())
  const queryClient = useQueryClient()

  const sync = useCallback(() => {
    setHasToken(readHasToken())
  }, [])

  const saveToken = useCallback((token: string) => {
    if (typeof window === "undefined") {
      return
    }

    const trimmed = token.trim()
    if (!trimmed) {
      return
    }

    window.localStorage.setItem(STORAGE_KEY, trimmed)
    setHasToken(true)
    window.dispatchEvent(new Event(STORAGE_EVENT))
    queryClient.invalidateQueries({ queryKey: ["github"] })
  }, [queryClient])

  const clearToken = useCallback(() => {
    if (typeof window === "undefined") {
      return
    }

    window.localStorage.removeItem(STORAGE_KEY)
    setHasToken(false)
    window.dispatchEvent(new Event(STORAGE_EVENT))
    queryClient.invalidateQueries({ queryKey: ["github"] })
  }, [queryClient])

  useEffect(() => {
    if (typeof window === "undefined") {
      return
    }

    sync()

    const handleStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) {
        sync()
      }
    }

    const handleCustomEvent = () => {
      sync()
    }

    window.addEventListener("storage", handleStorage)
    window.addEventListener(STORAGE_EVENT, handleCustomEvent)

    return () => {
      window.removeEventListener("storage", handleStorage)
      window.removeEventListener(STORAGE_EVENT, handleCustomEvent)
    }
  }, [sync])

  return {
    hasToken,
    saveToken,
    clearToken,
  }
}
