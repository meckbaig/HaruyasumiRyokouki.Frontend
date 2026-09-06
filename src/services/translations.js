/**
 * Helpers for the two shapes the API uses for translated content: read models
 * arrive flattened to one language, edit models carry every row.
 * See docs/architecture.md.
 */

/**
 * Empty translation, so callers never have to null-check. No tags: a tag hangs
 * off the file rather than off one of its translations. See `services/tags.js`.
 */
const EMPTY = { languageCode: null, title: '', description: '', note: '' }

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
