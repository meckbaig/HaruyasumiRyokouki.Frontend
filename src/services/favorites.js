import { setFavorite } from '@/api/media'

/**
 * Marks a file for the front page, or takes the mark off. Written straight onto
 * the media object, which every view shares, so one write updates all of them.
 * Throws what the API threw; nothing is written locally unless it succeeded.
 *
 * @returns {Promise<boolean|null>} The state it settled on, null if there was no file.
 */
export async function toggleFavorite(media) {
  // `== null`: ids are integers and 0 is a valid one.
  if (media?.id == null) return null

  const next = !media.favorite
  await setFavorite(media.id, next)
  media.favorite = next
  return next
}
