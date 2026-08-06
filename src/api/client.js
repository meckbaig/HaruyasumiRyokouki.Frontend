import { getAuthHeader, notifyUnauthorized } from './authState'
import { currentLocale } from '@/i18n'
import { displayHeader } from '@/services/display'

const BASE_URL = import.meta.env.VITE_API_BASE_URL || '/v1'

/**
 * Normalised transport error. `status === 0` means the request never reached
 * the server (offline, DNS failure, backend down).
 */
export class ApiError extends Error {
  constructor({ status, title, detail, problem }) {
    super(detail || title || `HTTP ${status}`)
    this.name = 'ApiError'
    this.status = status
    this.title = title
    this.detail = detail
    this.problem = problem
  }

  get isNetworkError() {
    return this.status === 0
  }

  /** i18n key for a generic fallback message when the server said nothing useful. */
  get fallbackKey() {
    if (this.status === 0) return 'errors.network'
    if (this.status === 401) return 'errors.unauthorized'
    if (this.status === 403) return 'errors.forbidden'
    if (this.status === 404) return 'errors.notFound'
    return 'errors.generic'
  }
}

function buildUrl(path, query) {
  const url = `${BASE_URL}${path}`
  if (!query) return url

  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue
    // Arrays become repeated params (`ids=1&ids=2`), which is how ASP.NET binds
    // an array query parameter — not a single comma-joined value.
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item !== undefined && item !== null && item !== '') params.append(key, item)
      }
    } else {
      params.append(key, value)
    }
  }
  const qs = params.toString()
  return qs ? `${url}?${qs}` : url
}

/** Parses an RFC 9457 ProblemDetails body; tolerates empty or non-JSON responses. */
async function readProblem(response) {
  const text = await response.text().catch(() => '')
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return { detail: text }
  }
}

/**
 * Single entry point for every backend call.
 *
 * @param {string} path      Path below the API base, e.g. `/days`.
 * @param {object} [options]
 * @param {string} [options.method]        Defaults to GET.
 * @param {object} [options.query]         Query parameters; empty values are dropped.
 * @param {*}      [options.body]          Serialised as JSON when present.
 * @param {boolean}[options.requiresAuth]  Marks an editor-only call, so a 401
 *   drops the session and bounces to the login page. Public pages must leave
 *   this off — an anonymous 401 there should surface as a plain error instead
 *   of yanking the visitor away from the content.
 * @param {string} [options.authHeader]    Overrides the stored credentials, used
 *   while verifying a login that has not been saved to the session yet.
 * @param {AbortSignal} [options.signal]
 */
export async function request(path, options = {}) {
  const { method = 'GET', query, body, requiresAuth = false, signal } = options

  const headers = {
    Accept: 'application/json',
    'Accept-Language': currentLocale(),
    // Lets the server pick the right image renditions for this screen.
    'X-Display': displayHeader(),
  }

  const authHeader = options.authHeader ?? getAuthHeader()
  if (authHeader) headers.Authorization = authHeader
  if (body !== undefined) headers['Content-Type'] = 'application/json'

  let response
  try {
    response = await fetch(buildUrl(path, query), {
      method,
      headers,
      signal,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch (error) {
    if (error.name === 'AbortError') throw error
    throw new ApiError({ status: 0, title: 'Network error', detail: error.message })
  }

  if (!response.ok) {
    const problem = await readProblem(response)
    if (response.status === 401 && requiresAuth) notifyUnauthorized()
    throw new ApiError({
      status: response.status,
      title: problem?.title,
      detail: problem?.detail,
      problem,
    })
  }

  if (response.status === 204) return null

  const text = await response.text()
  if (!text) return null
  return JSON.parse(text)
}
