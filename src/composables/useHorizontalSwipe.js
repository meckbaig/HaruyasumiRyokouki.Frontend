/**
 * Horizontal swipe navigation for touch.
 *
 * Deliberately touch-only: a mouse has the arrow buttons and the keyboard, and
 * treating mouse drags as swipes would fight text selection. A gesture counts
 * only when it is decisively sideways and quick, so a diagonal flick while
 * scrolling the page does not page through content by accident.
 *
 * Anything inside an element marked `data-no-swipe` is left alone — that is how
 * the calendar ribbon and the map keep their own horizontal drags.
 */
const MIN_DISTANCE = 60
const MAX_DURATION = 800
/** How much longer the horizontal travel must be than the vertical. */
const DOMINANCE = 1.5

export function useHorizontalSwipe({ onLeft, onRight, isEnabled } = {}) {
  let start = null

  function onPointerDown(event) {
    start = null
    if (event.pointerType === 'mouse') return
    if (isEnabled && !isEnabled()) return
    if (event.target?.closest?.('[data-no-swipe]')) return
    start = { x: event.clientX, y: event.clientY, time: Date.now() }
  }

  function onPointerUp(event) {
    if (!start) return
    const dx = event.clientX - start.x
    const dy = event.clientY - start.y
    const elapsed = Date.now() - start.time
    start = null

    if (elapsed > MAX_DURATION) return
    if (Math.abs(dx) < MIN_DISTANCE) return
    if (Math.abs(dx) < Math.abs(dy) * DOMINANCE) return

    if (dx < 0) onLeft?.()
    else onRight?.()
  }

  function onPointerCancel() {
    start = null
  }

  return { onPointerDown, onPointerUp, onPointerCancel }
}
