import { nextTick } from 'vue'

/**
 * Brings the file a link singled out into view.
 *
 * Found by the id each tile stamps on itself rather than through a chain of
 * template refs, because the tile may be several components deep — inside a
 * search group, inside a grid — and only one page at a time is ever asking.
 *
 * Two ticks: the first lets the grid render the id it was just given, and the
 * grid may also have to reveal further chunks to reach a file far down a long
 * day, which is a second render of its own.
 *
 * Scrolling on load is normally worth avoiding — it costs the reader the place
 * they were put. Here it is the entire point of the link: someone followed it to
 * this picture, and leaving it off screen would be answering a different
 * request. Centred rather than aligned to the top, so the pictures around it
 * come along and it reads as a file among its neighbours.
 */
export async function scrollToMedia(id) {
  if (id == null) return

  await nextTick()
  await nextTick()

  const element = document.querySelector(`[data-media-id="${CSS.escape(String(id))}"]`)
  element?.scrollIntoView({ block: 'center' })
}
