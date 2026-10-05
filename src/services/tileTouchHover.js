/**
 * A finger takes the cursor's place on a touch screen: the tile under it shows
 * what a hover shows, without the long press that also began a selection. The
 * mark follows the finger across the wall, so a page-scroll swipe reveals each
 * tile it crosses. See docs/features/media-grid-and-selection.md.
 */

/** Only re-read the tile once the finger has moved this far, not every event. */
const SAMPLE_SLOP = 4

let current = null
let lastX = 0
let lastY = 0

/** The tile under a point, marked by `[data-touch-hover]` on its root. */
function tileAt(x, y) {
  const under = document.elementFromPoint(x, y)
  return under?.closest?.('[data-touch-hover]') ?? null
}

/** Moves the reveal to one tile, leaving the previous one. */
function setCurrent(element) {
  if (current === element) return
  current?.classList.remove('touch-hover')
  current = element
  current?.classList.add('touch-hover')
}

function sample(x, y) {
  lastX = x
  lastY = y
  setCurrent(tileAt(x, y))
}

function onTouchStart(event) {
  // Two fingers mean a pinch or a zoom, never a hover.
  if (event.touches.length !== 1) {
    setCurrent(null)
    return
  }
  const touch = event.touches[0]
  sample(touch.clientX, touch.clientY)
}

function onTouchMove(event) {
  const touch = event.touches[0]
  if (!touch) return
  if (Math.hypot(touch.clientX - lastX, touch.clientY - lastY) < SAMPLE_SLOP) return
  sample(touch.clientX, touch.clientY)
}

function clear() {
  setCurrent(null)
}

/** Binds the finger's "hover" to the document once, at app start. */
export function installTouchHover() {
  document.addEventListener('touchstart', onTouchStart, { passive: true })
  document.addEventListener('touchmove', onTouchMove, { passive: true })
  document.addEventListener('touchend', clear)
  document.addEventListener('touchcancel', clear)
}
