import { onBeforeUnmount } from 'vue'

/**
 * Press-and-drag selection across a wall of tiles ("painting").
 *
 * The gesture belongs to the container rather than to a tile, because it spans
 * several: a pointer pressed on one and dragged across others must keep marking
 * the ones it passes. On a mouse a small drag starts it; on a touchscreen a long
 * press does, so an ordinary swipe still scrolls the page. Each move recomputes
 * the selection from the snapshot taken at press time plus the origin→current
 * range, so dragging back shrinks it again.
 *
 * Every caller keeps its own idea of what "selected" means — a Pinia store of
 * media objects in one place, a plain Set of ids in another — so this knows only
 * ids and hands the whole resulting list back through `apply`.
 *
 * @param {object} options
 * @param {import('vue').Ref<HTMLElement|null>} options.container the wall
 * @param {(index: number) => (number|string|null)} options.idAt id of a tile
 * @param {() => Array<number|string>} options.snapshot what is selected now
 * @param {(id) => boolean} options.isSelected
 * @param {(ids: Array) => void} options.apply receives the whole new selection
 * @param {() => boolean} [options.enabled]
 * @param {() => boolean} [options.armed] whether a sideways drag alone starts a
 *   stroke, without a long press first. True once a selection is already open:
 *   the finger is in that mode, and the long press is the way *into* it rather
 *   than a toll on every stroke afterwards.
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
    // A drag that ended on a different tile fires no click, so a suppress flag
    // set then would linger and eat the next real tap. Clear it as each starts.
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

    // A held press with no movement still enters selection — the touch way in,
    // and a mouse shortcut for marking a single tile.
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

  /*
    Touch takes its own path rather than sharing the pointer one.

    A browser hands out pointer events only until it decides the gesture belongs
    to it — the moment it starts scrolling the page it cancels the stream and
    sends nothing more. A press held still on a phone is exactly the case it
    guesses wrong, which is why the long press worked with a mouse and inside a
    devtools emulator, where nothing competes for the gesture, and never on a
    real device. Touch events keep arriving throughout, and `preventDefault` on a
    touchmove genuinely stops the page from scrolling once painting has begun —
    something a pointermove cannot do.
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

      // Sideways means marking, downwards means scrolling — and the page is
      // handed straight back for the second, or a wall of tiles would be a
      // region of the page that cannot be scrolled past.
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
