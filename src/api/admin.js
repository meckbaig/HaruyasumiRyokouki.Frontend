import { request } from './client'

/**
 * GET /v1/admin/pending -> everything still waiting to be filled in:
 * media without a description and days whose note is not marked ready.
 */
export async function fetchPending(signal) {
  const data = await request('/admin/pending', { requiresAuth: true, signal })
  return {
    media: data?.media ?? [],
    days: data?.days ?? [],
  }
}
