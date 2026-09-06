import { request } from './client'

/**
 * GET /v1/search -> `DayDto[]`. `text=` or `tag=`, never both and never neither.
 * A day matched through its media carries only the matching files; one matched
 * through its note carries none. See docs/features/search.md.
 */
export async function search({ text, tag }, signal) {
  const query = tag ? { tag } : { text }
  const data = await request('/search', { query, signal })
  return data?.items ?? []
}
