import { setPrivate } from '@/api/media'

/**
 * Whether a file is kept out of public view. `=== true`, not truthiness: the API
 * fills `private` in for an editor only, and null means "not being told".
 * See docs/features/media-grid-and-selection.md.
 */
export function isPrivate(media) {
  return media?.private === true
}

/**
 * Hides a file or shows it again, writing the answer straight onto the object the
 * page holds - the same arrangement the star uses (`services/favorites.js`).
 *
 * @returns {Promise<boolean|null>} the state it settled on, null if there was no file.
 */
export async function togglePrivate(media) {
  if (media?.id == null) return null

  const next = !isPrivate(media)
  await setPrivate(media.id, next)
  media.private = next
  return next
}
