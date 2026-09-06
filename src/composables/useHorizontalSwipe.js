/**
 * Horizontal swipe navigation. **Touch events, not pointer events** - the browser
 * cancels the pointer stream as soon as it decides the page is scrolling.
 * Anything inside `[data-no-swipe]` is left alone.
 * See docs/features/days-and-calendar.md.
 */
const MIN_DISTANCE = 60
const MAX_DURATION = 800
/** How much longer the horizontal travel must be than the vertical. */
const DOMINANCE = 1.5

export function useHorizontalSwipe({ onLeft, onRight, isEnabled } = {}) {
  let start = null

  function onTouchStart(event) {
    start = null
    // Two fingers mean a pinch or a zoom, never a page turn.
    if (event.touches?.length !== 1) return
    if (isEnabled && !isEnabled()) return
    if (event.target?.closest?.('[data-no-swipe]')) return

    const touch = event.touches[0]
    start = { x: touch.clientX, y: touch.clientY, time: Date.now() }
  }

  function onTouchEnd(event) {
    if (!start) return
    const touch = event.changedTouches?.[0]
    const from = start
    start = null
    if (!touch) return

    const dx = touch.clientX - from.x
    const dy = touch.clientY - from.y

    if (Date.now() - from.time > MAX_DURATION) return
    if (Math.abs(dx) < MIN_DISTANCE) return
    if (Math.abs(dx) < Math.abs(dy) * DOMINANCE) return

    if (dx < 0) onLeft?.()
    else onRight?.()
  }

  function onTouchCancel() {
    start = null
  }

  return { onTouchStart, onTouchEnd, onTouchCancel }
}
