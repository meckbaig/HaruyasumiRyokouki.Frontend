<script setup>
import { computed, ref, shallowRef, nextTick, onBeforeUnmount } from 'vue'
import { motionReduced } from '@/services/motion'

/*
  The picture flying between a grid tile and the open viewer. Transforms only, so
  the image is rasterised once. See docs/features/media-viewer.md.
*/

/** Marks the flight on <html>; main.css uses it to hold the room's own fade. */
const FLYING_ATTR = 'data-lightbox-flying'

const DURATION = 260
/** The curve the flight has always used. */
const CURVE = { x1: 0.2, y1: 0.8, x2: 0.2, y2: 1 }
const EASING = `cubic-bezier(${CURVE.x1}, ${CURVE.y1}, ${CURVE.x2}, ${CURVE.y2})`
/** Steps for the sampled tracks; see `buildTracks`. */
const SAMPLES = 48
/** How long a mid-flight preview->full swap fades in. */
const FADE_MS = 180

const frame = ref(null)
const outer = ref(null)
/** Rides the counter transform; holds the base image and any fading overlay. */
const wrap = ref(null)
/** The sharper image fading in over the base during a mid-flight swap. */
const overlay = ref(null)
/** Translated by the page's scroll so a return flight tracks its tile. */
const mover = ref(null)
/** `{ base, tracks, clipPath, src, overlay }` while a flight is up, null otherwise. */
const flight = shallowRef(null)

let running = null

/** Cleans whichever follower a flight left behind; null when none is up. */
let stopFollow = null
/** Pending scroll-follow frame, so scroll events coalesce to one a frame. */
let scrollFrame = 0
let startScrollY = 0
/** Pending track-follow frame, so the loop below runs once a frame. */
let followFrame = 0

/** True while a flight is on screen; the viewer hides its own strip under it. */
const active = computed(() => flight.value !== null)

function area(box) {
  return box.width * box.height
}

/** One coordinate of a cubic bezier whose ends are 0 and 1, at parameter `s`. */
function bezierAt(a, b, s) {
  const u = 1 - s
  return 3 * u * u * s * a + 3 * u * s * s * b + s * s * s
}

/** The time the curve is at once it has covered `p` of the distance. */
function timeAtProgress(p) {
  let lo = 0
  let hi = 1
  // Both coordinates are monotone here, so bisection needs no guarding.
  for (let i = 0; i < 30; i += 1) {
    const mid = (lo + hi) / 2
    if (bezierAt(CURVE.y1, CURVE.y2, mid) < p) lo = mid
    else hi = mid
  }
  return bezierAt(CURVE.x1, CURVE.x2, (lo + hi) / 2)
}

/** How `box` sits inside `base`: scale on each axis, and the shift of centres. */
function placement(base, box) {
  return {
    sx: box.width / base.width,
    sy: box.height / base.height,
    dx: box.left + box.width / 2 - (base.left + base.width / 2),
    dy: box.top + box.height / 2 - (base.top + base.height / 2),
  }
}

function transformOf(place) {
  return `translate(${place.dx}px, ${place.dy}px) scale(${place.sx}, ${place.sy})`
}

/**
 * The three tracks a flight runs on: the window's travel, and the two that undo
 * its uneven scale on the image and on the corner.
 *
 * The last two are sampled, not written as two keyframes - the maths and the
 * sampling residual are in docs/features/media-viewer.md.
 */
function buildTracks(base, from, to, fromRadius, toRadius) {
  const a = placement(base, from)
  const b = placement(base, to)

  const counter = []
  const radius = []

  for (let step = 0; step <= SAMPLES; step += 1) {
    const p = step / SAMPLES
    const at = (start, end) => start + (end - start) * p
    // Exact at the ends, whatever the bisection rounds to in between.
    const offset = step === 0 ? 0 : step === SAMPLES ? 1 : timeAtProgress(p)

    const sx = at(a.sx, b.sx)
    const sy = at(a.sy, b.sy)
    // The `cover` scale of the box at this instant, even on both axes.
    const k = Math.max(sx, sy)
    const r = at(fromRadius, toRadius)

    counter.push({ offset, transform: `scale(${k / sx}, ${k / sy})` })
    radius.push({ offset, borderRadius: `${r / sx}px / ${r / sy}px` })
  }

  return {
    window: [{ transform: transformOf(a) }, { transform: transformOf(b) }],
    counter,
    radius,
  }
}

/**
 * The clip that keeps a flight under the page's own header. Fixed for the whole
 * flight, never released - see the feature doc for why.
 */
function clipFor(insets) {
  if (!insets?.top) return null
  return `inset(${insets.top}px 0px 0px 0px)`
}

function stop() {
  running?.forEach((animation) => animation.cancel())
  running = null
  flight.value = null
  document.documentElement.removeAttribute(FLYING_ATTR)
  stopFollow?.()
  stopFollow = null
}

/**
 * Keeps a flight glued to the mark it is landing on. The box is read at launch,
 * and anything that moves it afterwards - the page's scroll, or a map panning
 * under the card the viewer was opened from - would otherwise leave the picture
 * arriving where the mark used to be. The box is re-read each frame and the
 * flight translated by the difference: a transform only, never a layout.
 * See docs/features/media-viewer.md.
 */
function followTrack(read) {
  const at = read()
  if (!at) return

  const onFrame = () => {
    followFrame = requestAnimationFrame(onFrame)
    const element = mover.value
    const now = read()
    if (!element || !now) return
    const dx = now.left + now.width / 2 - (at.left + at.width / 2)
    const dy = now.top + now.height / 2 - (at.top + at.height / 2)
    element.style.transform = `translate3d(${dx}px, ${dy}px, 0)`
  }

  followFrame = requestAnimationFrame(onFrame)
  stopFollow = () => {
    if (followFrame) cancelAnimationFrame(followFrame)
    followFrame = 0
  }
}

/** Pins a flight to its tile while the reader scrolls before it lands. The tile
 * box is captured at launch; the page scrolls on the window alone, so translating
 * the flight content by the scroll delta (a transform only, no layout) keeps it
 * glued to the tile until the handover. Used when the caller names no mark. */
function followScroll() {
  startScrollY = window.scrollY
  const onScroll = () => {
    if (scrollFrame) return
    scrollFrame = requestAnimationFrame(() => {
      scrollFrame = 0
      const element = mover.value
      if (element) {
        element.style.transform = `translate3d(0, ${startScrollY - window.scrollY}px, 0)`
      }
    })
  }
  window.addEventListener('scroll', onScroll, { passive: true })
  stopFollow = () => {
    window.removeEventListener('scroll', onScroll)
    if (scrollFrame) cancelAnimationFrame(scrollFrame)
    scrollFrame = 0
  }
}

/**
 * Flies `src` from one box to the other. Boxes are viewport rectangles as
 * `getBoundingClientRect` gives them; radii are plain pixels; `insets` is the
 * page chrome the picture has to stay under; `track` re-reads the box of the
 * mark the flight belongs to, when that mark can move.
 */
async function fly({ src, from, to, fromRadius = 0, toRadius = 0, insets = null, track = null }) {
  if (!src || !from || !to || motionReduced()) return
  stop()

  // The larger box, so the raster is made at the resolution needed and only
  // ever scaled down.
  const base = area(from) >= area(to) ? from : to
  if (!base.width || !base.height) return

  const tracks = buildTracks(base, from, to, fromRadius, toRadius)
  // Rendered holding the first sample, or the frame before the animation would
  // be the untransformed base box.
  flight.value = { base, tracks, clipPath: clipFor(insets), src }
  // Before the await: the room begins leaving in this same tick.
  document.documentElement.setAttribute(FLYING_ATTR, '')
  if (track) followTrack(track)
  else followScroll()

  await nextTick()
  if (!flight.value || !outer.value || !wrap.value) {
    stop()
    return
  }

  const eased = { duration: DURATION, easing: EASING, fill: 'forwards' }
  // `linear`: the curve is already baked into where the samples sit.
  const sampled = { duration: DURATION, easing: 'linear', fill: 'forwards' }

  const travel = outer.value.animate(tracks.window, eased)
  running = [
    travel,
    outer.value.animate(tracks.radius, sampled),
    wrap.value.animate(tracks.counter, sampled),
  ]
  travel.onfinish = stop
}

/**
 * Swaps in a sharper file mid-flight by fading it in over its stand-in. The
 * swap lands at the slow, large end of the flight, where a hard cut is plainly
 * visible, so a fade reads far better than the old single-frame exchange.
 */
async function setSource(next) {
  if (!next || !flight.value) return
  if (next === flight.value.src || next === flight.value.overlay) return

  // Decoded off-DOM first, or the fade would start before the bytes are pixels
  // and the arriving image would appear in bands as it fades in.
  const probe = new Image()
  probe.src = next
  if (typeof probe.decode === 'function') {
    try {
      await probe.decode()
    } catch {
      // Undecodable or superseded; the picture already on screen stays.
      return
    }
  }

  if (!flight.value) return

  // The base keeps the stand-in beneath; the sharper file fades in on top. Both
  // ride the same counter transform, so the fade changes resolution in place,
  // never the framing. The overlay rides the flight and is torn down with it.
  flight.value = { ...flight.value, overlay: next }
  await nextTick()
  const element = overlay.value
  if (!element || !flight.value) return

  const fade = element.animate([{ opacity: 0 }, { opacity: 1 }], {
    duration: FADE_MS,
    easing: 'ease-out',
    fill: 'forwards',
  })
  running = [...(running ?? []), fade]
}

onBeforeUnmount(stop)

defineExpose({ active, fly, setSource, cancel: stop })
</script>

<template>
  <Teleport to="body">
    <!-- Exactly the viewport, so it changes no coordinates; it only holds the
         clip that keeps the picture under the page's header. -->
    <div
      v-if="flight"
      ref="frame"
      class="pointer-events-none fixed inset-0 z-[2500]"
      :style="flight.clipPath ? { clipPath: flight.clipPath } : undefined"
    >
      <!-- The mover is translated by whatever moves the mark the flight belongs
           to, so the flight follows it. It sits under the frame's clip, which
           must stay put in the viewport under the sticky page header. -->
      <div ref="mover" class="absolute inset-0 will-change-transform">
        <div
          ref="outer"
          class="pointer-events-none fixed overflow-hidden will-change-transform"
          :style="{
            left: `${flight.base.left}px`,
            top: `${flight.base.top}px`,
            width: `${flight.base.width}px`,
            height: `${flight.base.height}px`,
            transform: flight.tracks.window[0].transform,
            borderRadius: flight.tracks.radius[0].borderRadius,
          }"
        >
          <!-- The counter transform lives on this wrapper so every image inside
               rides it together; a second layer added mid-flight would otherwise
               drift out of register with the window. -->
          <div
            ref="wrap"
            class="relative h-full w-full will-change-transform"
            :style="{ transform: flight.tracks.counter[0].transform }"
          >
            <img
              :src="flight.src"
              alt=""
              aria-hidden="true"
              draggable="false"
              class="h-full w-full object-contain"
            />
            <img
              v-if="flight.overlay"
              ref="overlay"
              :src="flight.overlay"
              alt=""
              aria-hidden="true"
              draggable="false"
              class="pointer-events-none absolute inset-0 h-full w-full object-contain"
              style="opacity: 0"
            />
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
