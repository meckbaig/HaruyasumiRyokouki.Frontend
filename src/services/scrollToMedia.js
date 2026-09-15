import { nextTick } from 'vue'
import { tileFor } from './mediaTiles'
import { chromeInsets } from './pageChrome'

/** The wall's own row gap (grid `gap-2`), kept when a block is pinned up top. */
const BLOCK_TOP_GAP = 8

/**
 * The page offset the singled-out block should land at, clamped to the page.
 * A block that fits the window is centred; one too tall to take in at once
 * starts at its first record, or centring would push that record off the top.
 * See docs/features/sharing-and-links.md.
 */
export function scrollTargetFor(elements) {
  if (!elements?.length) return null

  const rects = elements.map((element) => element.getBoundingClientRect())
  const top = Math.min(...rects.map((rect) => rect.top))
  const bottom = Math.max(...rects.map((rect) => rect.bottom))
  const height = bottom - top

  const insets = chromeInsets()
  const viewport = window.innerHeight - insets.top
  const from = window.scrollY

  const wanted =
    height <= viewport
      ? from + (top + bottom) / 2 - (insets.top + viewport / 2)
      : from + top - insets.top - BLOCK_TOP_GAP

  const limit = document.documentElement.scrollHeight - window.innerHeight
  return Math.max(0, Math.min(limit, wanted))
}

/**
 * Brings the files a link singled out into view, found by the id each tile
 * stamps on itself. Two ticks: one for the ids, one for any chunk the grid must
 * reveal. Accepts one id or a whole block.
 * See docs/features/sharing-and-links.md.
 */
export async function scrollToMedia(ids) {
  const list = (Array.isArray(ids) ? ids : [ids]).filter((id) => id != null)
  if (!list.length) return

  await nextTick()
  await nextTick()

  const tiles = list.map((id) => tileFor(id)).filter(Boolean)
  const target = scrollTargetFor(tiles)
  if (target == null) return

  // `behavior` is left out on purpose: `html` owns `scroll-behavior`, so reduced
  // motion turns the glide off instead of being overridden here.
  window.scrollTo({ top: target })
}
