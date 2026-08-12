<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'

/*
  The page's scrollbar, drawn over the page rather than beside it.

  A desktop browser's own bar takes a lane out of the layout, and a lane that
  appears and disappears moves the whole page sideways with it — which is what
  made the picture jump as the viewer opened and locked the page behind it.
  Reserving the lane for good fixed that but left an empty strip on every page
  that does not scroll. Drawing the bar on top settles both: it costs no width,
  so there is nothing to reserve and nothing to move.

  It is only ever drawn for a pointer that can hover. A touchscreen already has
  an overlay bar of its own that costs nothing, and a thumb has no use for a
  four-pixel target — the CSS hides this one there entirely.

  The native bar is hidden in main.css. Should this component fail to run, the
  page still scrolls by every other means; what is lost is the drawn bar, not
  the scrolling.
*/
const MIN_THUMB = 36
/** Below this there is nothing worth showing a bar for. */
const MIN_RANGE = 8

const visible = ref(false)
const active = ref(false)
const top = ref(0)
const height = ref(0)

/** Scrollable distance, and the travel the thumb has to represent it. */
function metrics() {
  const view = window.innerHeight
  const total = document.documentElement.scrollHeight
  return { view, range: total - view, total }
}

function measure() {
  const { view, range, total } = metrics()
  visible.value = range > MIN_RANGE
  if (!visible.value) return

  height.value = Math.max(MIN_THUMB, (view / total) * view)
  top.value = (window.scrollY / range) * (view - height.value)
}

/*
  Dragging.

  The pointer is captured so the gesture survives leaving the four pixels the
  thumb occupies — without that, a hand that strays sideways while scrolling
  drops the bar mid-stroke. What is remembered is where inside the thumb the
  press landed, so the thumb does not jump under the cursor as it starts.
*/
let grab = null

function onPointerDown(event) {
  grab = { y: event.clientY, top: top.value }
  active.value = true
  event.currentTarget.setPointerCapture?.(event.pointerId)
  event.preventDefault()
}

function onPointerMove(event) {
  if (!grab) return
  const { view, range } = metrics()
  const travel = view - height.value
  if (travel <= 0) return

  const next = grab.top + (event.clientY - grab.y)
  window.scrollTo({
    top: (Math.min(travel, Math.max(0, next)) / travel) * range,
    // The page scrolls smoothly by default; under a hand it must not lag behind.
    behavior: 'instant',
  })
}

function onPointerUp() {
  grab = null
  active.value = false
}

let observer = null

onMounted(() => {
  measure()
  window.addEventListener('scroll', measure, { passive: true })
  window.addEventListener('resize', measure)

  // The page grows and shrinks on its own — pictures arriving, a day loading,
  // a section opening — and none of that is a scroll or a resize.
  if (typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(measure)
    observer.observe(document.documentElement)
    observer.observe(document.body)
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('scroll', measure)
  window.removeEventListener('resize', measure)
  observer?.disconnect()
})
</script>

<template>
  <!--
    The track takes no pointer events, so the strip along the right edge does not
    swallow clicks meant for the page; only the thumb answers a hand.
  -->
  <div v-if="visible" class="app-scrollbar" aria-hidden="true">
    <div
      class="app-scrollbar-thumb"
      :class="active ? 'app-scrollbar-thumb-active' : ''"
      :style="{ transform: `translateY(${top}px)`, height: `${height}px` }"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
    />
  </div>
</template>
