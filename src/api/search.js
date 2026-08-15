import { request } from './client'

/**
 * GET /v1/search -> DayDto[].
 *
 * Two modes, and exactly one of them at a time:
 *
 *   text=…  free search over titles, descriptions, day notes, tag captions and
 *           tag aliases — everything a visitor might type;
 *   tag=…   the exact set of files carrying one tag, named by its slug.
 *
 * Sending neither is a 400, so the caller decides which it is asking.
 *
 * Result shape worth remembering: when a day matches through its media, `media`
 * holds *only* the matching files. When it matches through the day note alone,
 * `media` comes back empty. Splitting those into the two result tabs is done on
 * the client — see `services/searchResults.js`.
 */
export async function search({ text, tag }, signal) {
  const query = tag ? { tag } : { text }
  const data = await request('/search', { query, signal })
  return data?.items ?? []
}
