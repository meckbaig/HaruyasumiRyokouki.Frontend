import { tokenize, hasMatch, buildSnippets } from './highlight'

/**
 * Splits a raw search response into the two result tabs.
 *
 * The backend returns days without saying *why* each one matched, but the shape
 * of the response carries enough:
 *
 * - a day that matched through its media comes back with `media` holding only
 *   the matching files;
 * - a day that matched through its note alone comes back with `media` empty.
 *
 * A day can legitimately land in both tabs, and that is not a duplicate — it
 * matched in both places.
 *
 * @param {Array} items DayDto[] straight from `GET /v1/search`.
 * @param {string} query Raw query text.
 */
export function splitSearchResults(items, query) {
  const tokens = tokenize(query)
  const days = Array.isArray(items) ? items : []

  const mediaDays = days
    .filter((day) => day?.media?.length)
    .map((day) => ({
      date: day.date,
      isReady: day.isReady,
      languageCode: day.languageCode,
      matched: day.media,
    }))
    .sort((a, b) => a.date.localeCompare(b.date))

  const noteDays = days
    .filter((day) => day?.note && hasMatch(day.note, tokens))
    .map((day) => ({
      date: day.date,
      isReady: day.isReady,
      languageCode: day.languageCode,
      note: day.note,
      snippets: buildSnippets(day.note, tokens),
    }))
    .sort((a, b) => a.date.localeCompare(b.date))

  return { tokens, mediaDays, noteDays }
}

/**
 * Everything of a day that was *not* already shown as a match.
 *
 * Used by "show the rest of this day": the full day is fetched separately and
 * the already-visible files are subtracted by id, so nothing renders twice.
 */
export function restOfDay(fullDay, matchedMedia) {
  const shown = new Set((matchedMedia ?? []).map((media) => media.id))
  return (fullDay?.media ?? []).filter((media) => !shown.has(media.id))
}
