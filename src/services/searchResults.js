import { tokenize, hasMatch, buildSnippets } from './highlight'
import { parseRichText } from './richText'

/** The absolute offsets at which a markup token starts or ends. */
function tokenEdges(text) {
  const edges = new Set([0, text.length])
  let offset = 0
  for (const token of parseRichText(text)) {
    edges.add(offset)
    offset += token.raw.length
    edges.add(offset)
  }
  return [...edges].sort((a, b) => a - b)
}

/*
  Widens each snippet so neither edge falls inside a markup token: the slice
  re-parses whole, so a search result never shows half an embed. The match
  ranges shift by the same amount the start moved.
  See docs/features/search.md.
*/
function alignToTokens(note, snippets) {
  const edges = tokenEdges(note)
  const snapBack = (at) => edges.filter((edge) => edge <= at).pop() ?? 0
  const snapForward = (at) => edges.find((edge) => edge >= at) ?? note.length

  return snippets.map((snippet) => {
    const start = snippet.start
    const end = start + snippet.text.length
    const from = edges.includes(start) ? start : snapBack(start)
    const to = edges.includes(end) ? end : snapForward(end)
    const shift = start - from
    const text = note.slice(from, to)
    const ranges = snippet.ranges
      .map(([rangeFrom, rangeTo]) => [
        Math.max(0, rangeFrom + shift),
        Math.min(text.length, rangeTo + shift),
      ])
      .filter(([rangeFrom, rangeTo]) => rangeTo > rangeFrom)

    return { text, ranges, hasPrefix: from > 0, hasSuffix: to < note.length }
  })
}

/**
 * Splits a raw search response into the two result tabs. A day can land in both,
 * and that is not a duplicate. See docs/features/search.md.
 *
 * @param {Array} items DayDto[] straight from `GET /v1/search`.
 */
export function splitSearchResults(items, query) {
  // A tag search has no words in it, so `tokenize('')` is empty and no day can
  // reach the notes tab - the behaviour wanted, with no special case below.
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
      // The matched files, so a reference resolves where the answer carries it.
      // A day matched through its note alone carries none.
      media: day.media ?? [],
      // Snippets stay on whole markup tokens, so each one re-parses as rich
      // text rather than showing half an embed. See docs/features/search.md.
      snippets: alignToTokens(day.note, buildSnippets(day.note, tokens)),
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
