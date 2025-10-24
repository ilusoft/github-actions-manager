const API_BASE_URL = "https://api.github.com"

const TOKEN_STORAGE_KEY = "github-actions-manager.access-token"

const getAccessToken = (): string | null => {
  if (typeof window === "undefined") {
    return null
  }

  const token = window.localStorage.getItem(TOKEN_STORAGE_KEY)
  return token ? token.trim() : null
}

export class GithubApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = "GithubApiError"
    this.status = status
  }
}

interface FetchGithubOptions extends RequestInit {
  path: string
}

export const fetchGithubJson = async <T>({ path, ...init }: FetchGithubOptions): Promise<T> => {
  const token = getAccessToken()

  if (!token) {
    throw new GithubApiError("Missing GitHub access token", 401)
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init.headers ?? {}),
    },
  })

  if (!response.ok) {
    const message = await response.text()
    throw new GithubApiError(message || response.statusText, response.status)
  }

  if (response.status === 204) {
    return undefined as T
  }

  const text = await response.text()
  if (!text) {
    return undefined as T
  }

  try {
    return JSON.parse(text) as T
  } catch {
    return undefined as T
  }
}
