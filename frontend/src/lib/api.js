const configuredBase = import.meta.env.VITE_API_URL?.trim().replace("//localhost", "//127.0.0.1")

function normalizeBase(value) {
  if (!value) return "/api"
  const base = value.replace(/\/+$/, "").replace(/\/api$/, "")
  return `${base}/api`
}

const localApiOrigin = `http://127.0.0.1:${import.meta.env.VITE_API_PORT || "8001"}`
export const API = normalizeBase(
  configuredBase || (import.meta.env.DEV ? localApiOrigin : "/api")
)

const TOKEN_KEY = "freebuf_auth_token"

export function getStoredToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) || ""
  } catch {
    return ""
  }
}

export function setStoredToken(token) {
  try {
    if (token) {
      localStorage.setItem(TOKEN_KEY, token)
    } else {
      localStorage.removeItem(TOKEN_KEY)
    }
  } catch {
    // Ignore storage errors in restricted browser contexts
  }
}

function authHeaders(headers = {}) {
  const token = getStoredToken()
  return {
    ...headers,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

export async function getAuthStatus(signal) {
  const response = await fetch(`${API}/auth/status`, {
    signal,
    headers: authHeaders(),
    credentials: "include",
  })
  if (!response.ok) throw new Error(`Account status request failed (${response.status})`)
  return response.json()
}

export async function postAuth(action, payload) {
  const response = await fetch(`${API}/auth/${action}`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    credentials: "include",
    ...(payload ? { body: JSON.stringify(payload) } : {}),
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.detail || `Account action failed (${response.status})`)
  if (data?.token) {
    setStoredToken(data.token)
  }
  if (action === "logout" || action === "delete") {
    setStoredToken(null)
  }
  return data
}

export async function getState(signal) {
  const response = await fetch(`${API}/state`, {
    signal,
    headers: authHeaders(),
    credentials: "include",
  })
  if (!response.ok) throw new Error(`State request failed (${response.status})`)
  return response.json()
}

export async function postAction(endpoint, payload) {
  const response = await fetch(`${API}/${endpoint}`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    credentials: "include",
    ...(payload ? { body: JSON.stringify(payload) } : {}),
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.detail || `Request failed (${response.status})`)
  return data
}
