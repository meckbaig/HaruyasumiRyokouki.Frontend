/**
 * Helpers for the two shapes the API uses for translated content.
 *
 * Read models (`MediaFileDto`, `DayDto`) are already flattened to one language
 * by the server based on `Accept-Language`. Edit models (`MediaFileEditDto`,
 * `DayEditDto`) instead carry a `translations` array with every language, so
 * the editor has to pick the right row itself.
 */

/** Empty translation, so callers never have to null-check the result. */
const EMPTY = { languageCode: null, title: '', description: '', tags: [], note: '' }

/**
 * Returns the translation for `locale`, falling back to whatever the object
 * already has: the flattened read-model fields, then the first available row.
 */
export function pickTranslation(entity, locale) {
  if (!entity) return { ...EMPTY }

  const rows = entity.translations
  if (Array.isArray(rows) && rows.length > 0) {
    const exact = rows.find((row) => row?.languageCode === locale)
    return { ...EMPTY, ...(exact ?? rows[0]) }
  }

  // Read model: the fields sit directly on the object.
  return {
    ...EMPTY,
    languageCode: entity.languageCode ?? null,
    title: entity.title ?? '',
    description: entity.description ?? '',
    tags: entity.tags ?? [],
    note: entity.note ?? '',
  }
}

/**
 * True when the server answered in a different language than the one asked for,
 * which is what the "showing the original" notice is based on.
 */
export function isFallbackLanguage(entity, locale) {
  const code = entity?.languageCode
  return Boolean(code) && code !== locale
}

/** `"a, b, c"` -> `['a', 'b', 'c']`, dropping blanks and duplicates. */
export function parseTags(input) {
  if (Array.isArray(input)) return input
  const seen = new Set()
  for (const tag of String(input ?? '').split(',')) {
    const trimmed = tag.trim()
    if (trimmed) seen.add(trimmed)
  }
  return [...seen]
}

export function formatTags(tags) {
  return Array.isArray(tags) ? tags.join(', ') : ''
}
