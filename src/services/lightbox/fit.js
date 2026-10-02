import { SLIDE_MS } from '@/services/motion'

/*
  Placement and zoom arithmetic for the media viewer, kept framework-free so the
  filmstrip, the chrome fit and the closing flight all work from one set of sums.
  See docs/features/media-viewer.md.
*/

const ANIM_MS = SLIDE_MS
/** Floor for a velocity-shortened slide, so a fast fling is not a snap. */
const MIN_SLIDE_MS = 70

export const MAX_SCALE = 6
export const TAP_ZOOM = 2

/**
 * Slide length from release speed: a swipe fast enough to cross the frame in
 * less than one `ANIM_MS` shortens the turn, so a fast fling is not left running
 * at full length once the reader is already starting the next.
 */
export function slideMs(speed, width) {
  const neutral = width / ANIM_MS
  const ms = (ANIM_MS * neutral) / Math.max(speed, neutral / 4)
  return Math.round(Math.min(ANIM_MS, Math.max(MIN_SLIDE_MS, ms)))
}

/** Whether a bar's contents run past the height it is allowed. */
export function overflows(element, expanded) {
  return Boolean(element) && (expanded || element.scrollHeight > element.clientHeight + 1)
}

/**
 * Insets, but only when the bars actually bind - a landscape file runs out of
 * width first and never meets them. Null hands the caller back to the
 * approximate route. The bar edges are passed in, never read from a ref.
 */
export function exactBand(top, bottom, ratio) {
  if (!ratio) return null
  if (top + bottom <= 0) return null

  const barsDifference = Math.abs(top - bottom)
  const available = window.innerHeight - (top + bottom) - barsDifference
  if (available <= 0) return null
  if (ratio >= window.innerWidth / available) return null

  return { top, bottom }
}

/**
 * The scale and the shift that put a file of these proportions where it rests:
 * pulled back far enough to clear the bars, and moved into the middle of what
 * they leave. Pure - which is what lets the neighbours in the filmstrip be
 * placed by the very same sum.
 */
export function fitWithin(insets, ratio) {
  const top = insets?.top ?? 0
  const bottom = insets?.bottom ?? 0

  const height = window.innerHeight
  const width = window.innerWidth
  const band = height - top - bottom

  if (!ratio || band <= 0) return { scale: 1, offsetY: 0 }

  // Widths of the picture fitted to the window and fitted to the band; their
  // ratio is what the bars cost.
  const toWindow = Math.min(width, height * ratio)
  const toBand = Math.min(width, band * ratio)

  return {
    scale: toWindow > 0 ? toBand / toWindow : 1,
    offsetY: (top - bottom) / 2,
  }
}

/**
 * What a double tap magnifies to: `TAP_ZOOM` at the least, and further when the
 * file is wider than the window, so a panorama on a tall phone ends against the
 * top and bottom edges. A file at or under the window's own ratio already meets
 * them at rest, where the sum falls below `TAP_ZOOM`.
 */
export function tapZoomScale(width, height, ratio) {
  if (!ratio || width <= 0) return TAP_ZOOM
  return Math.max(TAP_ZOOM, (ratio * height) / width)
}

/** Whether a screen point lands on the picture itself rather than beside it. */
export function isOnPicture(rect, clientX, clientY) {
  if (!rect) return false
  return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom
}

/** A point in frame coordinates, measured from its centre. */
export function toFramePoint(rect, clientX, clientY) {
  if (!rect) return { x: 0, y: 0 }
  return {
    x: clientX - rect.left - rect.width / 2,
    y: clientY - rect.top - rect.height / 2,
  }
}
