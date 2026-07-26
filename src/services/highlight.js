/**
 * Client-side match finding and snippet extraction for search results.
 *
 * The API returns whole day notes without telling us which part matched, so the
 * frontend locates the occurrences itself. This is the permanent arrangement,
 * not a stand-in: search results are small enough that doing it here is cheaper
 * than teaching the backend to emit snippets.
 *
 * Every range this module returns is expressed in *original* text coordinates,
 * so the caller can slice the untouched string and never has to render HTML
 * built by string concatenation.
 */

/** How much context to keep on each side of a match inside a snippet. */
const DEFAULT_RADIUS = 90

/**
 * Normalises one character for comparison and reports how many characters that
 * produced. Diacritics are stripped, so `ё` matches `е` and `ü` matches `u`.
 */
function normalizeChar(char) {
  return char
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
}

/**
 * Builds a normalised copy of `text` together with an index map back into the
 * original. Normalisation can change length (ligatures expand, diacritics
 * vanish), so a naive `indexOf` on the normalised string would report offsets
 * that no longer line up with what we display.
 *
 * @returns {{normalized: string, map: number[]}} `map[i]` is the index in the
 *   original string that produced `normalized[i]`.
 */
function normalizeWithMap(text) {
  let normalized = ''
  const map = []

  for (let i = 0; i < text.length; i += 1) {
    const piece = normalizeChar(text[i])
    for (let j = 0; j < piece.length; j += 1) {
      normalized += piece[j]
      map.push(i)
    }
  }

  return { normalized, map }
}

/** Splits a query into normalised search tokens, dropping punctuation and noise. */
export function tokenize(query) {
  if (!query) return []

  return String(query)
    .split(/[\s,.;:!?"'`«»()[\]{}<>/\\|—–-]+/u)
    .map((token) => normalizeChar(token))
    .filter((token) => token.length > 0)
}

/** Merges overlapping or touching `[start, end)` ranges into a sorted list. */
function mergeRanges(ranges) {
  if (ranges.length === 0) return []

  const sorted = [...ranges].sort((a, b) => a[0] - b[0] || a[1] - b[1])
  const merged = [sorted[0]]

  for (const [start, end] of sorted.slice(1)) {
    const last = merged[merged.length - 1]
    if (start <= last[1]) {
      last[1] = Math.max(last[1], end)
    } else {
      merged.push([start, end])
    }
  }

  return merged
}

/**
 * Finds every occurrence of every token inside `text`.
 *
 * @returns {Array<[number, number]>} merged `[start, end)` ranges in original
 *   coordinates, sorted by position.
 */
export function findRanges(text, tokens) {
  if (!text || !tokens?.length) return []

  const { normalized, map } = normalizeWithMap(String(text))
  const ranges = []

  for (const token of tokens) {
    if (!token) continue
    let from = 0
    for (;;) {
      const index = normalized.indexOf(token, from)
      if (index === -1) break

      const start = map[index]
      // `end` is exclusive, so take the original index of the last matched
      // character and step one past it.
      const end = map[index + token.length - 1] + 1
      ranges.push([start, end])
      from = index + token.length
    }
  }

  return mergeRanges(ranges)
}

/** Cheap existence check that avoids building the full range list. */
export function hasMatch(text, tokens) {
  if (!text || !tokens?.length) return false
  const { normalized } = normalizeWithMap(String(text))
  return tokens.some((token) => token && normalized.includes(token))
}

/**
 * Nudges a snippet edge onto a word boundary so it does not open or close
 * mid-word. Gives up after a short search, which is what keeps this sane for
 * Japanese text where there is no whitespace to find.
 */
function snapToBoundary(text, index, direction) {
  const MAX_SEARCH = 24

  if (direction === 'forward') {
    if (index <= 0) return 0
    for (let offset = 0; offset < MAX_SEARCH; offset += 1) {
      const cursor = index + offset
      if (cursor >= text.length) return text.length
      if (/\s/.test(text[cursor])) return cursor + 1
    }
    return index
  }

  if (index >= text.length) return text.length
  for (let offset = 0; offset < MAX_SEARCH; offset += 1) {
    const cursor = index - offset
    if (cursor <= 0) return 0
    if (/\s/.test(text[cursor - 1])) return cursor - 1
  }
  return index
}

/**
 * Cuts `text` down to the neighbourhoods of its matches.
 *
 * @param {string} text
 * @param {string[]} tokens
 * @param {{radius?: number, maxSnippets?: number}} [options]
 * @returns {Array<{text: string, ranges: Array<[number, number]>, hasPrefix: boolean, hasSuffix: boolean}>}
 *   Each snippet's ranges are relative to that snippet's own `text`.
 */
export function buildSnippets(text, tokens, options = {}) {
  const { radius = DEFAULT_RADIUS, maxSnippets = 3 } = options

  const source = String(text ?? '')
  const matches = findRanges(source, tokens)
  if (matches.length === 0) return []

  // Grow each match into a window, then merge windows that ran into each other.
  const windows = mergeRanges(
    matches.map(([start, end]) => [
      Math.max(0, start - radius),
      Math.min(source.length, end + radius),
    ]),
  )

  return windows.slice(0, maxSnippets).map(([rawStart, rawEnd]) => {
    const firstMatch = matches.find(([, end]) => end > rawStart)
    const lastMatch = [...matches].reverse().find(([start]) => start < rawEnd)

    // Snap to whitespace, but never past the matches the window exists to show.
    const start = Math.min(
      snapToBoundary(source, rawStart, 'forward'),
      firstMatch ? firstMatch[0] : rawStart,
    )
    const end = Math.max(
      snapToBoundary(source, rawEnd, 'backward'),
      lastMatch ? lastMatch[1] : rawEnd,
    )

    const slice = source.slice(start, end)
    const ranges = matches
      .filter(([mStart, mEnd]) => mEnd > start && mStart < end)
      .map(([mStart, mEnd]) => [
        Math.max(0, mStart - start),
        Math.min(slice.length, mEnd - start),
      ])

    return {
      text: slice,
      ranges,
      hasPrefix: start > 0,
      hasSuffix: end < source.length,
    }
  })
}

/**
 * Splits text into alternating plain and highlighted parts, ready for a
 * `v-for` render. Avoids `v-html` entirely.
 *
 * @returns {Array<{text: string, match: boolean}>}
 */
export function toParts(text, ranges) {
  const source = String(text ?? '')
  if (!ranges?.length) return source ? [{ text: source, match: false }] : []

  const parts = []
  let cursor = 0

  for (const [start, end] of ranges) {
    if (start > cursor) parts.push({ text: source.slice(cursor, start), match: false })
    parts.push({ text: source.slice(start, end), match: true })
    cursor = end
  }

  if (cursor < source.length) parts.push({ text: source.slice(cursor), match: false })
  return parts
}
