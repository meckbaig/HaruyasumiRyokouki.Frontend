/**
 * Reading a tag.
 *
 * A tag is an entity with an id, and its words hang off it: one **caption** per
 * language (`IsPrimary`), and any number of **aliases**. The difference is the
 * whole point of the arrangement. A caption is what a reader sees; an alias is
 * only ever a way in — someone looking for "noodles" finds photographs captioned
 * "ramen", and never learns that "noodles" was written down anywhere.
 *
 * So aliases are searched and never rendered. Nothing in this module returns
 * them for display, and the public read model does not carry them at all.
 *
 * Two shapes arrive from the API and both are handled here:
 *
 *   TagPublicDto  { slug, value }                     on a media file
 *   TagDto        { id, slug, translations[], aliases[], usageCount }
 *
 * The first is already resolved to the reader's language by the server; the
 * second is the editor's model, carrying every language at once.
 *
 * **The slug is the name a tag is known by outside the editor.** It is what
 * public models carry, what a link puts in the address (`/search?tag=ramen`) and
 * what everything here keys on. The numeric `id` exists only in the editor's
 * model and only for one purpose — `changes.tagIds` on a save — so it is
 * resolved from the dictionary at that one moment and nowhere else.
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
 * The caption to put on screen.
 *
 * Asked for a language and falling back rather than failing: a tag mid-edit may
 * have no caption in the reader's language yet, and a chip with nothing written
 * on it is worse than a chip in the wrong language. Last resort is the slug,
 * which is not a caption but is at least a name.
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

/**
 * Whether a tag answers to what has been typed.
 *
 * Every language and every alias at once, deliberately: an editor typing
 * "temple" in a Russian interface is naming a tag they know by its English
 * caption, and refusing them because the interface is in another language would
 * be pedantry. The dictionary is small enough that the whole of it is compared
 * on every keystroke.
 */
export function tagMatches(tag, needle) {
  const wanted = fold(needle).trim()
  if (!wanted) return true
  return tagWords(tag).some((word) => fold(word).includes(wanted))
}

/**
 * Commonest first.
 *
 * A tag already used two hundred times is far likelier to be the one meant than
 * one used twice, and offering them alphabetically would bury the working
 * vocabulary under everything ever coined. Ties fall back to the caption so the
 * order is at least stable between renders.
 */
export function compareTags(a, b, locale) {
  const usage = (b?.usageCount ?? 0) - (a?.usageCount ?? 0)
  if (usage !== 0) return usage
  return tagLabel(a, locale).localeCompare(tagLabel(b, locale))
}

/** Slugs of the tags on a media file, in either shape. */
export function tagSlugsOf(media) {
  return rows(media?.tags)
    .map((tag) => tag.slug)
    .filter(Boolean)
}
