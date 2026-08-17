import { tagLabel } from './tags'

/**
 * Writing a saved file back onto the copy the page is showing.
 *
 * A save answers with `MediaFileEditDto` — every language at once, tags as whole
 * entities — while the page holds `MediaFileDto`, already flattened to one
 * language by the server. Projecting one onto the other is what lets a title,
 * a description or a tag appear under the photograph the moment the dialog
 * closes, instead of the page fetching the day again to learn what it just sent.
 *
 * Only what an edit can change is copied. The URLs, the miniature and the
 * proportions describe the file itself, which no edit touches — and the edit
 * model's copies are not always the ones the page was given, so writing them
 * across would be swapping good data for data that merely looks like it.
 */

/**
 * The row the server would have flattened to.
 *
 * The reader's language when it has anything in it, otherwise the first that
 * does — which is the same rule behind the "showing the original" notice, and
 * `languageCode` is set to whichever row won so that notice keeps telling the
 * truth after a save.
 */
function bestRow(rows, locale) {
  const list = Array.isArray(rows) ? rows.filter(Boolean) : []
  const filled = (row) => Boolean(row.title?.trim() || row.description?.trim())

  const own = list.find((row) => row.languageCode === locale)
  if (own && filled(own)) return own
  return list.find(filled) ?? own ?? null
}

/**
 * @param {object} target A `MediaFileDto` held by a page or a store; mutated in
 *   place, because every view showing this file is showing this same object.
 * @param {object} saved The `MediaFileEditDto` the save answered with.
 * @param {string} locale The language the page is being read in.
 */
export function applySavedMedia(target, saved, locale) {
  if (!target || !saved) return target

  const row = bestRow(saved.translations, locale)

  target.title = row?.title ?? ''
  target.description = row?.description ?? ''
  target.languageCode = row?.languageCode ?? locale
  target.tags = (saved.tags ?? []).map((tag) => ({ slug: tag.slug, value: tagLabel(tag, locale) }))
  target.latitude = saved.latitude ?? null
  target.longitude = saved.longitude ?? null
  target.favorite = saved.favorite ?? null
  target.private = saved.private ?? null

  return target
}

/**
 * Writes a tag onto a file the page is already showing.
 *
 * `POST /tags/{id}/media` answers with a count and nothing else — it has no
 * reason to send back every file it touched — so the tag exists on the server
 * and nowhere on screen until something says otherwise. This is that something:
 * the media objects handed to a bulk operation are the very ones in the grid
 * behind it, so putting the tag on them is what makes it appear.
 *
 * @param {object} media a `MediaFileDto` or `MediaFileEditDto`
 * @param {object} tag the full `TagDto` from the dictionary
 * @param {string} locale the language the page is being read in
 */
export function addTagLocally(media, tag, locale) {
  if (!media || !tag?.slug) return media

  const rows = Array.isArray(media.tags) ? media.tags : []
  if (rows.some((row) => row?.slug === tag.slug)) return media

  // Replaced rather than pushed into: a bare `push` on a plain array reaches no
  // watcher that is only tracking the property.
  media.tags = [...rows, { slug: tag.slug, value: tagLabel(tag, locale) }]
  return media
}
