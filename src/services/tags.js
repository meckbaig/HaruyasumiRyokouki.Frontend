/**
 * Reading a tag: an entity with an id, one caption per language, and aliases
 * that are searched and never rendered. **The slug is its public name** - the
 * numeric id lives in `TagDto` alone. See docs/features/tags.md.
 */

/** Comparison form: case and diacritics folded away, so `ё` finds `е`. */
export function fold(text) {
  return String(text ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
}

function rows(list) {
  return Array.isArray(list) ? list.filter(Boolean) : []
}

/**
 * The caption to put on screen. Falls back rather than fails: a chip with
 * nothing written on it is worse than one in the wrong language.
 */
export function tagLabel(tag, locale) {
  if (!tag) return ''
  // Public model: the server already picked the language.
  if (typeof tag.value === 'string' && tag.value) return tag.value

  const translations = rows(tag.translations)
  const exact = translations.find((row) => row.languageCode === locale)
  return exact?.text || translations[0]?.text || tag.slug || ''
}

/** Every word that can lead to this tag, captions and aliases alike. */
export function tagWords(tag) {
  if (!tag) return []
  const words = [...rows(tag.translations), ...rows(tag.aliases)]
    .map((row) => row.text)
    .filter(Boolean)
  if (tag.value) words.push(tag.value)
  if (tag.slug) words.push(tag.slug)
  return words
}

/** Whether a tag answers to what was typed - every language and alias at once. */
export function tagMatches(tag, needle) {
  const wanted = fold(needle).trim()
  if (!wanted) return true
  return tagWords(tag).some((word) => fold(word).includes(wanted))
}

/** Commonest first, caption as a tiebreak. Order is the point - see the feature doc. */
export function compareTags(a, b, locale) {
  const usage = (b?.usageCount ?? 0) - (a?.usageCount ?? 0)
  if (usage !== 0) return usage
  return tagLabel(a, locale).localeCompare(tagLabel(b, locale))
}

/**
 * What to call a tag known only by its slug: `fetched` out of a response first,
 * then the dictionary entry, then the slug - a name, if not a caption.
 */
export function captionForSlug(slug, locale, { known = null, fetched = '' } = {}) {
  if (!slug) return ''
  return fetched || tagLabel(known, locale) || slug
}

/** Slugs of the tags on a media file, in either shape. */
export function tagSlugsOf(media) {
  return rows(media?.tags)
    .map((tag) => tag.slug)
    .filter(Boolean)
}
