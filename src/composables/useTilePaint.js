import { onBeforeUnmount } from 'vue'

/**
 * Press-and-drag selection across a wall of tiles ("painting"). The gesture
 * belongs to the container, because it spans several tiles. Knows only ids and
 * hands the whole new selection back through `apply`.
 * See docs/features/media-grid-and-selection.md.
 *
 * @param {object} options
 * @param {import('vue').Ref<HTMLElement|null>} options.container the wall
 * @param {(index: number) => (number|string|null)} options.idAt id of a tile
 * @param {() => Array<number|string>} options.snapshot what is selected now
 * @param {(id) => boolean} options.isSelected
 * @param {(ids: Array) => void} options.apply receives the whole new selection
 * @param {() => boolean} [options.enabled]
 * @param {() => boolean} [options.armed] whether a sideways drag alone starts a
 *   stroke. True once a selection is already open.
 */
export function useTilePaint({
  container,
  idAt,
  snapshot,
  isSelected,
  apply,
  enabled = () => true,
  armed = () => false,
}) {
  const LONG_PRESS_MS = 450
  const DRAG_THRESHOLD = 8
  /** Fingers wander: a press held still on a phone still drifts several pixels. */
  const TOUCH_THRESHOLD = 24

  let gesture = null
  let suppressClick = false

  function tileIndexAt(target) {
    const el = target?.closest?.('[data-tile-index]')
    if (!el || !container.value?.contains(el)) return null
    const index = Number(el.dataset.tileIndex)
    return Number.isInteger(index) ? index : null
  }

  function dedupe(ids) {
    const seen = new Set()
    const result = []
    for (const id of ids) {
      if (id == null || seen.has(id)) continue
      seen.add(id)
      result.push(id)
    }
    return result
  }

  function paintTo(index) {
    if (!gesture) return
    const lo = Math.min(gesture.originIndex, index)
    const hi = Math.max(gesture.originIndex, index)

    const range = []
    for (let at = lo; at <= hi; at += 1) {
      const id = idAt(at)
      if (id != null) range.push(id)
    }

    if (gesture.mode === 'remove') {
      // Painting from an already-marked tile clears the dragged range instead.
      const inRange = new Set(range)
      apply(gesture.base.filter((id) => !inRange.has(id)))
    } else {
      apply(dedupe([...gesture.base, ...range]))
    }
  }

  function clearLongPress() {
    if (gesture?.longPressTimer) {
      clearTimeout(gesture.longPressTimer)
      gesture.longPressTimer = null
    }
  }

  function beginPaint() {
    if (!gesture || gesture.painting) return
    gesture.painting = true
    clearLongPress()
    // The origin tile's state decides the whole stroke: start on a marked tile
    // to erase a range, on an empty one to add.
    gesture.mode = isSelected(gesture.originId) ? 'remove' : 'add'
    paintTo(gesture.originIndex)
  }

  function startGesture(target, x, y) {
    // A drag ending on another tile fires no click, so a stale flag would eat
    // the next real tap. Cleared as each gesture starts.
    suppressClick = false

    const originIndex = tileIndexAt(target)
    if (originIndex == null) return false

    gesture = {
      originIndex,
      originId: idAt(originIndex),
      startX: x,
      startY: y,
      base: [...snapshot()],
      painting: false,
      mode: 'add',
      longPressTimer: null,
    }

    // A held press with no movement still enters selection - the touch way in.
    gesture.longPressTimer = setTimeout(beginPaint, LONG_PRESS_MS)
    return true
  }

  function onPointerDown(event) {
    // Touch runs on the touch events below; pointer events would duplicate it.
    if (!enabled() || event.button > 0 || event.pointerType !== 'mouse') return
    if (!startGesture(event.target, event.clientX, event.clientY)) return

    document.addEventListener('pointermove', onPointerMove)
    document.addEventListener('pointerup', onPointerUp)
    document.addEventListener('pointercancel', onPointerUp)
  }

  /**
   * Touch takes its own path: the browser cancels the pointer stream once it
   * claims the gesture, and only a touchmove can `preventDefault` the scroll.
   * See docs/features/media-grid-and-selection.md.
   */
  function onTouchStart(event) {
    if (!enabled() || event.touches.length !== 1) return
    const touch = event.touches[0]
    if (!startGesture(event.target, touch.clientX, touch.clientY)) return

    document.addEventListener('touchmove', onTouchMove, { passive: false })
    document.addEventListener('touchend', onTouchEnd)
    document.addEventListener('touchcancel', onTouchEnd)
  }

  function onTouchMove(event) {
    if (!gesture) return
    const touch = event.touches[0]
    if (!touch) return

    if (!gesture.painting) {
      const dx = touch.clientX - gesture.startX
      const dy = touch.clientY - gesture.startY
      if (Math.hypot(dx, dy) <= TOUCH_THRESHOLD) return

      // Sideways marks, downwards hands the page back - or a wall of tiles
      // would be a region that cannot be scrolled past.
      if (armed() && Math.abs(dx) > Math.abs(dy)) beginPaint()
      else {
        endGesture()
        return
      }
    }

    if (event.cancelable) event.preventDefault()

    const under = document.elementFromPoint(touch.clientX, touch.clientY)
    const index = tileIndexAt(under)
    if (index != null) paintTo(index)
  }

  function onTouchEnd() {
    if (!gesture) return
    if (gesture.painting) suppressClick = true
    endGesture()
  }

  function onPointerMove(event) {
    if (!gesture) return

    if (!gesture.painting) {
      // Mouse: a drag beyond the threshold starts painting immediately.
      const dist = Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY)
      if (dist > DRAG_THRESHOLD) beginPaint()
      else return
    }

    // Stop the drag from selecting text while painting.
    event.preventDefault()

    const under = document.elementFromPoint(event.clientX, event.clientY)
    const index = tileIndexAt(under)
    if (index != null) paintTo(index)
  }

  function onPointerUp() {
    if (!gesture) return
    // A gesture that painted must eat the click that browsers fire afterwards.
    if (gesture.painting) suppressClick = true
    endGesture()
  }

  function endGesture() {
    clearLongPress()
    gesture = null
    document.removeEventListener('pointermove', onPointerMove)
    document.removeEventListener('pointerup', onPointerUp)
    document.removeEventListener('pointercancel', onPointerUp)
    document.removeEventListener('touchmove', onTouchMove)
    document.removeEventListener('touchend', onTouchEnd)
    document.removeEventListener('touchcancel', onTouchEnd)
  }

  function onClickCapture(event) {
    if (!suppressClick) return
    event.stopPropagation()
    event.preventDefault()
    suppressClick = false
  }

  onBeforeUnmount(endGesture)

  /** Bind all four to the container element; tiles carry `data-tile-index`. */
  return { onPointerDown, onTouchStart, onClickCapture, endGesture }
}
