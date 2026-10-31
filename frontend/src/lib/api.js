const configuredBase = import.meta.env.VITE_API_URL?.trim().replace("//localhost", "//127.0.0.1")

function normalizeBase(value) {
  if (!value) return "/api"
  const base = value.replace(/\/+$/, "").replace(/\/api$/, "")
  return `${base}/api`
}

const localApiOrigin = `http://127.0.0.1:${import.meta.env.VITE_API_PORT || "8001"}`
export const API = normalizeBase(import.meta.env.DEV ? localApiOrigin : (configuredBase || localApiOrigin))

export async function getAuthStatus(signal) {
  const response = await fetch(`${API}/auth/status`, { signal, credentials: "include" })
  if (!response.ok) throw new Error(`Account status request failed (${response.status})`)
  return response.json()
}

export async function postAuth(action, payload) {
  const response = await fetch(`${API}/auth/${action}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    ...(payload ? { body: JSON.stringify(payload) } : {}),
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.detail || `Account action failed (${response.status})`)
  return data
}

export async function getState(signal) {
  const response = await fetch(`${API}/state`, { signal, credentials: "include" })
  if (!response.ok) throw new Error(`State request failed (${response.status})`)
  return response.json()
}

export async function postAction(endpoint, payload) {
  const response = await fetch(`${API}/${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    ...(payload ? { body: JSON.stringify(payload) } : {}),
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.detail || `Request failed (${response.status})`)
  return data
}
