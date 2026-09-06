import { nextTick } from 'vue'
import { tileFor } from './mediaTiles'

/**
 * Brings the file a link singled out into view, found by the id its tile stamps
 * on itself. Two ticks: one for the id, one for any chunk the grid must reveal.
 * Centred, so it reads as a file among its neighbours.
 * See docs/features/sharing-and-links.md.
 */
export async function scrollToMedia(id) {
  if (id == null) return

  await nextTick()
  await nextTick()

  tileFor(id)?.scrollIntoView({ block: 'center' })
}
