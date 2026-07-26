/**
 * Tiny holder for the Basic auth header, shared between the auth store and the
 * HTTP client. It exists purely to keep `api/client.js` free of a circular
 * import back into the Pinia store.
 */
const state = {
  header: null,
  /** Called by the router setup so an expired session can bounce to /login. */
  onUnauthorized: null,
}

export function setAuthHeader(header) {
  state.header = header
}

export function getAuthHeader() {
  return state.header
}

export function setUnauthorizedHandler(handler) {
  state.onUnauthorized = handler
}

export function notifyUnauthorized() {
  state.onUnauthorized?.()
}

/** Encodes credentials the way an `Authorization: Basic` header expects. */
export function encodeBasic(login, password) {
  // btoa only handles latin1, so percent-encode first to survive non-ASCII input.
  const bytes = new TextEncoder().encode(`${login}:${password}`)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return `Basic ${btoa(binary)}`
}
