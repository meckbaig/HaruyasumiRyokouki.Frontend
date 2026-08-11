import { setFavorite } from '@/api/media'

/**
 * Marks a file for the front page, or takes the mark off.
 *
 * The new state is written straight back onto the media object instead of
 * reloading the page it came from. Every list holds the very objects the stores
 * cached, so one write makes the star, the edit dialog and any other view of the
 * same file agree at once — and a mark is a single boolean, not worth pulling a
 * whole day back over the wire.
 *
 * Throws whatever the API threw, so the caller can say so; nothing is written
 * locally unless the request succeeded.
 *
 * @param {object} media A file carrying `id` and `favorite`.
 * @returns {Promise<boolean|null>} The state it settled on, or null if there was
 *   no file to mark.
 */
export async function toggleFavorite(media) {
  // `== null`: ids are integers and 0 is a valid one.
  if (media?.id == null) return null

  const next = !media.favorite
  await setFavorite(media.id, next)
  media.favorite = next
  return next
}
