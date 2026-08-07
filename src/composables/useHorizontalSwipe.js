/**
 * Horizontal swipe navigation for touch.
 *
 * Built on touch events rather than pointer events on purpose. The browser
 * claims a gesture the moment it decides the page is being scrolled, and from
 * then on it cancels the pointer stream instead of completing it — so a swipe
 * across ordinary page background never reported its end, and only worked over
 * the media tiles, which restrict `touch-action` and so keep the pointer alive.
 * Touch events keep arriving either way.
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
