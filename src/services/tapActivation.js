/**
 * Answers a tap from the touch, everywhere, instead of waiting for the click: a
 * browser suppresses the click after a swipe, so a control pressed straight after
 * a picture was flicked away answered nothing. `MediaTile` fixed that for the
 * tiles alone. See docs/features/ui-shell.md.
 */

/** A finger's wander: the same slop the tile and the swipe use. */
const TAP_SLOP = 10
/** Past this it is a press to hold, not a tap; the grid reads those itself. */
const TAP_MAX_MS = 600

/**
 * What the browser must keep: a field the keyboard has to reach, a canvas or a
 * player that reads its own taps, and anything that opts out by attribute.
 */
const NATIVE = [
  'input',
  'textarea',
  'select',
  'canvas',
  'video',
  'audio',
  'iframe',
  '[contenteditable]',
  '[data-native-tap]',
].join(',')

let start = null

function onTouchStart(event) {
  start = null
  // Two fingers mean a pinch or a zoom, never a tap.
  if (event.touches.length !== 1) return
  const touch = event.touches[0]
  start = { x: touch.clientX, y: touch.clientY, time: performance.now(), moved: false }
}

function onTouchMove(event) {
  if (!start) return
  const touch = event.touches[0]
  if (!touch) return
  if (Math.hypot(touch.clientX - start.x, touch.clientY - start.y) > TAP_SLOP) start.moved = true
}

function onTouchCancel() {
  start = null
}

/**
 * A tap that nothing answered: cancel the click the browser may never make, and
 * make one of our own on the element under the finger. A control that already
 * answered on `touchend` - a grid tile, the paint gesture - has prevented the
 * default by now, so it is left alone.
 */
function onTouchEnd(event) {
  const from = start
  start = null

  if (!from || from.moved) return
  if (event.defaultPrevented) return
  if (event.touches.length) return
  if (performance.now() - from.time > TAP_MAX_MS) return

  const touch = event.changedTouches[0]
  if (!touch) return

  const target = document.elementFromPoint(touch.clientX, touch.clientY)
  if (!target || target.closest(NATIVE)) return

  // Cancel the click the browser may invent, so the one below is the only one.
  if (event.cancelable) event.preventDefault()

  /*
    Dispatched on its own turn, not here: a `touchend` listener further down the
    document has still to run, and the grid's own is what marks a finished
    paint. Answering before it would open the picture a stroke just selected.
  */
  queueMicrotask(() => {
    if (!target.isConnected) return
    target.dispatchEvent(
      new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        view: window,
        detail: 1,
        clientX: touch.clientX,
        clientY: touch.clientY,
      }),
    )
  })
}

/** Binds the tap to the document once, at app start. */
export function installTapActivation() {
  document.addEventListener('touchstart', onTouchStart, { passive: true })
  document.addEventListener('touchmove', onTouchMove, { passive: true })
  document.addEventListener('touchend', onTouchEnd)
  document.addEventListener('touchcancel', onTouchCancel)
}
