import { onBeforeUnmount } from 'vue'
import {
  OPEN_DELAY_MS,
  POINTER_STOP_MS,
  STOP_SPEED_PX_S,
  headingToCard,
  insidePolygon,
  insideRect,
  movement,
  safeTriangle,
} from '@/services/hoverIntent'

/**
 * The life of a hover card, decided by where the hand is going rather than by a timeout: a
 * hand travelling to the card keeps it open, one turning away closes it at once, and one
 * that stops in between gives up after `POINTER_STOP_MS`.
 * See docs/features/rich-text-and-links.md.
 *
 * @param {object} options
 * @param {import('vue').Ref} options.card the card, measured at each analysis so the hand
 *   is followed to where the card actually stands.
 * @param {(payload: object) => void} options.onOpen show the card for a payload.
 * @param {() => void} options.onClose put it away.
 */
export function useHoverIntent({ card, onOpen, onClose }) {
  /* CLOSED, OPEN, ANALYZING: a pointer resting on the trigger makes it OPEN, a pointer
     leaving makes it ANALYZING, arriving at the card makes it OPEN again, and a hand
     turning away or resting outside makes it CLOSED. */
  let state = 'closed'
  /** True for a card shown by hand - a tap, a focus - which no hand follows. */
  let manual = false
  /** What the card was opened for, handed straight back to `onOpen`. */
  let payload = null
  /** A reference the hand has since come to rest on, which the card may take over. */
  let pending = null
  let listening = false
  let openTimer = null
  let stopTimer = null
  let frame = 0
  /** The hand's last two positions, in viewport coordinates and milliseconds. */
  let prior = null
  let last = null
  /** Where the hand left the trigger: the apex of the safe triangle. */
  let origin = null

  function element() {
    const value = card.value
    return value?.$el ?? value ?? null
  }

  function cancelOpen() {
    window.clearTimeout(openTimer)
    openTimer = null
  }

  function clearStop() {
    window.clearTimeout(stopTimer)
    stopTimer = null
  }

  /** One sample of the hand; `prior` keeps the position it had before. */
  function sample(x, y) {
    if (!last || last.x !== x || last.y !== y) prior = last
    last = { x, y, t: performance.now() }
  }

  /*
    The hand is watched only while a card stands: its last two positions are what the
    direction is read from once it leaves the trigger. A tap is not a hand, and a touch's
    moves are dropped, so a card opened by hand is never judged by this.
  */
  function listen(on) {
    if (on === listening) return
    listening = on
    if (on) {
      document.addEventListener('pointermove', onPointerMove, { passive: true })
      document.addEventListener('pointerdown', onPointerDown)
    } else {
      document.removeEventListener('pointermove', onPointerMove)
      document.removeEventListener('pointerdown', onPointerDown)
    }
  }

  function show() {
    state = 'open'
    clearStop()
    pending = null
    onOpen(payload)
  }

  function hide() {
    const shown = state !== 'closed'
    cancelOpen()
    clearStop()
    window.cancelAnimationFrame(frame)
    frame = 0
    state = 'closed'
    manual = false
    payload = null
    pending = null
    listen(false)
    if (shown) onClose()
  }

  /*
    The window a hand is given between movements. Armed after every verdict, so it is
    always measured from the last one that meant anything: a hand that has really stopped
    stops sending moves at all, and this is what then settles the card.
  */
  function armStop() {
    if (stopTimer) return
    stopTimer = window.setTimeout(() => {
      stopTimer = null
      settle()
    }, POINTER_STOP_MS)
  }

  /**
   * The window is up: the hand has stopped rather than arrived. A hand resting on another
   * reference takes the card over, which is how a card is ever swapped by hand; a hand
   * resting anywhere else has finished with it.
   */
  function settle() {
    if (state !== 'analyzing') return
    if (!pending) return hide()
    payload = pending
    pending = null
    show()
  }

  function scheduleAnalysis() {
    if (frame || state !== 'analyzing') return
    frame = window.requestAnimationFrame(analyze)
  }

  /*
    The geometry runs at most once a frame, never on the move itself, so a stream of
    pointer events costs one verdict each and the frame reads the newest sample.
  */
  function analyze() {
    frame = 0
    if (state !== 'analyzing' || !last) return
    const box = element()?.getBoundingClientRect()
    if (!box) return hide()
    // The hand arrived at the card: nothing is judged until it leaves again.
    if (insideRect(last, box)) {
      state = 'open'
      pending = null
      clearStop()
      return
    }
    if (!prior) return armStop()
    const move = movement(prior, last)
    // Micro-movements of a resting hand are not a direction; the window stands.
    if (move.speed < STOP_SPEED_PX_S) return armStop()
    clearStop()
    // A hand over another reference is not leaving this card: resting on that one is what
    // takes it over, so no direction is judged while it is there.
    if (pending) return armStop()
    const toward = headingToCard(last, move, box)
    const inside = origin ? insidePolygon(last, safeTriangle(origin, box)) : false
    if (!toward && !inside) return hide()
    // Kept, but only while the hand keeps coming: stopping now spends the window.
    armStop()
  }

  function onPointerMove(event) {
    if (event.pointerType !== 'mouse') return
    sample(event.clientX, event.clientY)
    scheduleAnalysis()
  }

  /** For a card shown by hand, a press anywhere but on the card puts it away. */
  function onPointerDown(event) {
    if (!manual || element()?.contains(event.target)) return
    hide()
  }

  /**
   * The pointer settled on a trigger. A card a finger already opened swaps at once, since
   * no hand is following it; a card a hand is following is left standing until that hand
   * comes to rest here, which `settle` decides. Otherwise the card is due after
   * `OPEN_DELAY_MS`, a wait the hand cancels by leaving before it is up.
   */
  function hoverIn(next) {
    manual = false
    cancelOpen()
    /*
      A hand on its way to a card crosses other references; none of them takes the card.
      One it comes to rest on does, and that rest is the same window that closes it. So a
      card already followed is left standing until the hand either settles or arrives.
    */
    if (state === 'analyzing') {
      pending = next
      armStop()
      return
    }
    payload = next
    if (state === 'open') {
      show()
      return
    }
    openTimer = window.setTimeout(() => {
      openTimer = null
      if (state !== 'closed') return
      listen(true)
      show()
    }, OPEN_DELAY_MS)
  }

  /**
   * The hand left the trigger, or left the card itself. From here the trajectory decides:
   * the card is kept while the hand closes on it, and dropped the moment it turns away.
   */
  function beginFollow(event) {
    pending = null
    if (state !== 'open' || manual) return
    if (event?.clientX != null) sample(event.clientX, event.clientY)
    origin = last
    state = 'analyzing'
    scheduleAnalysis()
  }

  function hoverOut(event) {
    cancelOpen()
    beginFollow(event)
  }

  /** A card shown by hand - a tap, a keyboard focus - with no hand to follow. */
  function openNow(next) {
    payload = next
    manual = true
    listen(true)
    show()
  }

  /** The hand reached the card: kept until it leaves again. */
  function cardIn() {
    if (manual || state === 'closed') return
    state = 'open'
    pending = null
    clearStop()
  }

  onBeforeUnmount(hide)

  return { hoverIn, hoverOut, cardIn, cardOut: beginFollow, openNow, close: hide }
}
