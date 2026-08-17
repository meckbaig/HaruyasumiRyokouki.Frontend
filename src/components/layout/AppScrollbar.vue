<script setup>
import { ref, watch, onMounted, onBeforeUnmount } from 'vue'

const props = defineProps({
  /**
   * The box whose scrolling this describes. Null is the page itself, which is
   * what it was built for; an element is a scroller inside the page — a dialog
   * tall enough to need one, where the browser's own bar cuts a straight grey
   * lane through a panel with rounded corners.
   */
  target: { type: [Object, null], default: null },
})

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
const SCROLLBAR_INSET = 8

const visible = ref(false)
const active = ref(false)
const top = ref(0)
const height = ref(0)
const scrollbar = ref(null)

/** Scrollable distance, and the travel the thumb has to represent it. */
function metrics() {
  const box = props.target
  const view = box ? box.clientHeight : window.innerHeight
  const total = box ? box.scrollHeight : document.documentElement.scrollHeight
  return { view, range: total - view, total }
}

function scrollOffset() {
  return props.target ? props.target.scrollTop : window.scrollY
}

function scrollTo(top) {
  // The page scrolls smoothly by default; under a hand it must not lag behind.
  if (props.target) props.target.scrollTop = top
  else window.scrollTo({ top, behavior: 'instant' })
}

function measure() {
  const { view, range, total } = metrics()
  visible.value = range > MIN_RANGE

  if (!visible.value) return

  const track = scrollbar.value?.getBoundingClientRect()

  if (!track) return

  const trackHeight = track.height

  height.value = Math.min(
    trackHeight,
    Math.max(MIN_THUMB, (view / total) * trackHeight)
  )

  const travel = Math.max(0, trackHeight - height.value)

  top.value =
    (scrollOffset() / range) * travel
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

  const { range } = metrics()

  const track = scrollbar.value?.getBoundingClientRect()
  if (!track) return

  const travel = Math.max(0, track.height - height.value)

  if (travel <= 0) return

  const next = grab.top + (event.clientY - grab.y)

  const clamped = Math.min(
    travel,
    Math.max(0, next)
  )

  scrollTo((clamped / travel) * range)
}

function onPointerUp() {
  grab = null
  active.value = false
}

let observer = null
let watched = null

function detach() {
  watched?.removeEventListener('scroll', measure)
  watched = null
  window.removeEventListener('resize', measure)
  observer?.disconnect()
  observer = null
}

/**
 * A target handed down as a template ref arrives after this has mounted, and
 * changes again whenever the box it describes is torn down and rebuilt — so the
 * listeners follow it rather than being attached once and hoping.
 */
function attach() {
  detach()
  const box = props.target
  watched = box ?? window
  watched.addEventListener('scroll', measure, { passive: true })
  window.addEventListener('resize', measure)

  // A page and a panel both grow and shrink on their own — pictures arriving, a
  // day loading, a section opening — and none of that is a scroll or a resize.
  if (typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(measure)
    if (box) {
      observer.observe(box)
      // The content, not only the frame: the frame's height is capped and stops
      // changing long before the thing inside it does.
      for (const child of box.children) observer.observe(child)
    } else {
      observer.observe(document.documentElement)
      observer.observe(document.body)
    }
  }

  measure()
}

onMounted(attach)
watch(() => props.target, attach)
onBeforeUnmount(detach)
</script>

<template>
  <!--
    The track takes no pointer events, so the strip along the right edge does not
    swallow clicks meant for the page; only the thumb answers a hand.
  -->
  <div
    v-if="visible"
    ref="scrollbar"
    class="app-scrollbar"
    :class="target ? 'app-scrollbar-inset' : ''"
    aria-hidden="true"
  >
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
