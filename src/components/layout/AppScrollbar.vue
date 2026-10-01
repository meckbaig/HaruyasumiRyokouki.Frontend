<script setup>
import { ref, nextTick, watch, onMounted, onBeforeUnmount } from 'vue'

const props = defineProps({
  /**
   * The box whose scrolling this describes. Null is the page itself, which is
   * what it was built for; an element is a scroller inside the page - a dialog
   * tall enough to need one, where the browser's own bar cuts a straight grey
   * lane through a panel with rounded corners.
   */
  target: { type: [Object, null], default: null },
})

/*
  The page's scrollbar, drawn over the page rather than beside it, so it takes no
  layout lane. Only for a pointer that can hover. If this fails to run the page
  still scrolls by every other means. See docs/features/ui-shell.md.
*/
const MIN_THUMB = 36
/** Below this there is nothing worth showing a bar for. */
const MIN_RANGE = 8

const visible = ref(false)
const active = ref(false)
const top = ref(0)
const height = ref(0)
const scrollbar = ref(null)

/*
  The figures the thumb is drawn from are cached, and only re-read when the box
  itself changes. Reading them on every scroll forced a layout while the page was
  already animating - the day map's height follow scrolls once a frame - which is
  what dropped the bar's frames. A scroll now only moves the cached numbers.
*/
const metrics = { view: 0, range: 0, total: 0, track: 0 }

function readMetrics() {
  const box = props.target
  metrics.view = box ? box.clientHeight : window.innerHeight
  metrics.total = box ? box.scrollHeight : document.documentElement.scrollHeight
  metrics.range = Math.max(0, metrics.total - metrics.view)
  metrics.track = scrollbar.value?.getBoundingClientRect().height ?? 0
}

function scrollOffset() {
  return props.target ? props.target.scrollTop : window.scrollY
}

function scrollTo(top) {
  // The page scrolls smoothly by default; under a hand it must not lag behind.
  if (props.target) props.target.scrollTop = top
  else window.scrollTo({ top, behavior: 'instant' })
}

/** The thumb's geometry, from the cached metrics alone - no layout is read. */
function paint() {
  const on = metrics.range > MIN_RANGE
  if (on !== visible.value) {
    visible.value = on
    // A bar that has just mounted has no track to measure yet; read it once it is in.
    if (on) nextTick(measure)
    return
  }
  if (!on || !metrics.track) return

  height.value = Math.min(
    metrics.track,
    Math.max(MIN_THUMB, (metrics.view / metrics.total) * metrics.track)
  )

  const travel = Math.max(0, metrics.track - height.value)

  top.value = metrics.range ? (scrollOffset() / metrics.range) * travel : 0
}

/** A full re-read, for a resize or a box that may have changed size. */
function measure() {
  readMetrics()
  paint()
}

/* Scrolling is coalesced to one paint a frame, so a burst of events - or the
   page's own per-frame follow - costs one paint and reads no layout. */
let frame = 0

function schedule() {
  if (frame) return
  frame = requestAnimationFrame(() => {
    frame = 0
    paint()
  })
}

/* Dragging. The pointer is captured so a hand straying sideways does not drop
   the bar; the grab offset is what keeps the thumb from jumping. */
let grab = null

function onPointerDown(event) {
  grab = { y: event.clientY, top: top.value }
  active.value = true
  event.currentTarget.setPointerCapture?.(event.pointerId)
  event.preventDefault()
}

function onPointerMove(event) {
  if (!grab || metrics.range <= 0) return

  const travel = Math.max(0, metrics.track - height.value)

  if (travel <= 0) return

  const next = grab.top + (event.clientY - grab.y)

  const clamped = Math.min(
    travel,
    Math.max(0, next)
  )

  scrollTo((clamped / travel) * metrics.range)
}

function onPointerUp() {
  grab = null
  active.value = false
}

let observer = null
let watched = null

function detach() {
  watched?.removeEventListener('scroll', schedule)
  watched = null
  window.removeEventListener('resize', measure)
  observer?.disconnect()
  observer = null
  if (frame) cancelAnimationFrame(frame)
  frame = 0
}

/**
 * A target handed down as a template ref arrives after this has mounted, and
 * changes again whenever the box it describes is torn down and rebuilt - so the
 * listeners follow it rather than being attached once and hoping.
 */
function attach() {
  detach()
  const box = props.target
  watched = box ?? window
  watched.addEventListener('scroll', schedule, { passive: true })
  window.addEventListener('resize', measure)

  // A page and a panel both grow and shrink on their own - pictures arriving, a
  // day loading, a section opening - and none of that is a scroll or a resize.
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
