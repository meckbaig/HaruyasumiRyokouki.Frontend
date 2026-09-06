import { tagLabel } from './tags'

/**
 * Writing a saved `MediaFileEditDto` back onto the `MediaFileDto` the page is
 * showing, so an edit appears the moment the dialog closes. Only what an edit
 * can change is copied. See docs/features/media-editor.md.
 */

/** The row the server would have flattened to. See docs/features/media-editor.md. */
function bestRow(rows, locale) {
  const list = Array.isArray(rows) ? rows.filter(Boolean) : []
  const filled = (row) => Boolean(row.title?.trim() || row.description?.trim())

  const own = list.find((row) => row.languageCode === locale)
  if (own && filled(own)) return own
  return list.find(filled) ?? own ?? null
}

/**
 * @param {object} target A `MediaFileDto` a page or store holds; **mutated in
 *   place**, because every view of this file is showing this same object.
 * @param {object} saved The `MediaFileEditDto` the save answered with.
 */
export function applySavedMedia(target, saved, locale) {
  if (!target || !saved) return target

  const row = bestRow(saved.translations, locale)

  target.title = row?.title ?? ''
  target.description = row?.description ?? ''
  target.languageCode = row?.languageCode ?? locale
  target.tags = (saved.tags ?? []).map((tag) => ({ slug: tag.slug, value: tagLabel(tag, locale) }))

  // Only where there were rows to begin with, or a flat read model would stop
  // being flat. See docs/features/media-editor.md.
  if (Array.isArray(target.translations)) {
    target.translations = Array.isArray(saved.translations) ? saved.translations : []
  }
  target.latitude = saved.latitude ?? null
  target.longitude = saved.longitude ?? null
  target.favorite = saved.favorite ?? null
  target.private = saved.private ?? null
  // Only where the page already had the key; not every media shape carries it.
  if ('isApproved' in target) target.isApproved = saved.isApproved === true

  return target
}

/**
 * Writes a tag onto a file the page is already showing. `POST /tags/{id}/media`
 * answers with a count alone, so the tag is nowhere on screen until this runs.
 *
 * @param {object} tag the full `TagDto` from the dictionary
 */
export function addTagLocally(media, tag, locale) {
  if (!media || !tag?.slug) return media

  const rows = Array.isArray(media.tags) ? media.tags : []
  if (rows.some((row) => row?.slug === tag.slug)) return media

  // Replaced, not pushed: a bare push reaches no watcher tracking the property.
  media.tags = [...rows, { slug: tag.slug, value: tagLabel(tag, locale) }]
  return media
}
