import { setPrivate } from '@/api/media'

/**
 * Files kept out of public view.
 *
 * `private` is one of the fields the API only fills in for an editor — an
 * anonymous reader gets null, and never sees the file at all. So the test is
 * against `true` rather than truthiness: null means "not being told", not "no",
 * and the difference matters at the one place it is asked, which is whether to
 * put a mark on the screen.
 *
 * The mark exists because the file looks exactly like every other one. An editor
 * scrolling a day has no way of telling which of these are for everyone and
 * which are not, and the one thing worse than a hidden file nobody remembers is
 * a hidden file somebody shares.
 */
export function isPrivate(media) {
  return media?.private === true
}

/**
 * Hides a file or shows it again, writing the answer straight back onto the
 * object the page is holding — the same one-write-updates-every-view arrangement
 * the star uses (`services/favorites.js`).
 *
 * @returns {Promise<boolean|null>} the state it settled on, or null if there was
 *   no file to mark.
 */
export async function togglePrivate(media) {
  if (media?.id == null) return null

  const next = !isPrivate(media)
  await setPrivate(media.id, next)
  media.private = next
  return next
}
