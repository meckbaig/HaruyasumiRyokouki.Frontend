import { request, ApiError } from './client'
import { encodeBasic } from './authState'

/**
 * Verifies credentials against GET /v1/admin/login.
 *
 * Credentials travel in the `Authorization` header, never in the URL — a query
 * string would leak the password into server logs, browser history and Referer.
 * The endpoint takes no parameters and simply answers 200 (accepted) or
 * 401/403 (rejected).
 *
 * @returns {Promise<boolean>} true when accepted, false when rejected.
 * @throws {ApiError} for anything that is not an authentication verdict.
 */
export async function verifyCredentials(login, password) {
  const authHeader = encodeBasic(login, password)

  try {
    await request('/admin/login', { authHeader })
    return true
  } catch (error) {
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
      return false
    }
    throw error
  }
}
