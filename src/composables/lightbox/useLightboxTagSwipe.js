/*
  The lower bar's tag swipe. A swipe is not a control to be aimed at, so the
  whole bar answers it. Touch takes its own path: a browser cancels the pointer
  stream once it claims a scroll, so touch events end the swipe.
  See docs/features/media-viewer.md.
*/

/** Travel up or down that counts as a swipe rather than a drift. */
const TAGS_SWIPE_MIN = 12

export function useLightboxTagSwipe({ tagsOverflow, tagsExpanded, onSettle }) {
  let tagDrag = null

  function finishTagDrag(y) {
    const drag = tagDrag
    tagDrag = null
    if (!drag) return
    const dy = y - drag.y
    if (Math.abs(dy) < TAGS_SWIPE_MIN) return
    tagsExpanded.value = dy < 0
    onSettle()
  }

  /** Mouse only: the drag ends wherever the cursor is, well past the bar. */
  function onTagPointerDown(event) {
    if (!tagsOverflow.value) return
    if (event.pointerType !== 'mouse' || event.button > 0) return
    tagDrag = { y: event.clientY }
    document.addEventListener('pointerup', onTagPointerUp)
  }

  function onTagPointerUp(event) {
    document.removeEventListener('pointerup', onTagPointerUp)
    finishTagDrag(event.clientY)
  }

  /**
   * Touch takes its own path: pointer events stop the moment a browser claims
   * the gesture for a scroll, so a real phone never sends the pointerup that
   * would end the swipe. Touch events keep coming, and a touchend fires on the
   * element the touch began on wherever the finger ends.
   */
  function onTagTouchStart(event) {
    if (!tagsOverflow.value) return
    const touch = event.touches[0]
    if (touch) tagDrag = { y: touch.clientY }
  }

  function onTagTouchMove(event) {
    const touch = event.touches[0]
    if (!tagDrag || !touch) return
    // Claimed once the travel says "swipe": a tap that barely drifts keeps its click.
    if (Math.abs(touch.clientY - tagDrag.y) < TAGS_SWIPE_MIN) return
    if (event.cancelable) event.preventDefault()
  }

  function onTagTouchEnd(event) {
    const touch = event.changedTouches[0]
    if (touch) finishTagDrag(touch.clientY)
  }

  /** Drops any in-flight swipe and its document listener. */
  function onTagDragCancel() {
    tagDrag = null
    document.removeEventListener('pointerup', onTagPointerUp)
  }

  return {
    onTagPointerDown,
    onTagPointerUp,
    onTagTouchStart,
    onTagTouchMove,
    onTagTouchEnd,
    onTagDragCancel,
  }
}
