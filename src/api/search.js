import { request } from './client'

/**
 * GET /v1/search?text= -> DayDto[].
 *
 * Result shape worth remembering: when a day matches through its media, `media`
 * holds *only* the matching files. When it matches through the day note alone,
 * `media` comes back empty. Splitting those into the two result tabs is done on
 * the client — see `services/searchResults.js`.
 */
export async function search(text, signal) {
  const data = await request('/search', { query: { text }, signal })
  return data?.items ?? []
}
