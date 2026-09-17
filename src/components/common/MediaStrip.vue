<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { motionReduced, SLIDE_MS } from '@/services/motion'

/**
 * A strip that turns one frame at a time. Only the file on show and its two
 * neighbours are mounted, and a step slides the whole strip a frame across while
 * the index changes underneath it - **the full-screen viewer's own turn**, with
 * the same constant and the same curve, so a step here and a page there read as
 * one gesture.
 *
 * A second step that lands during a slide is **queued**, not snapped: only one is
 * remembered, so holding an arrow does not run on after the key comes up, and the
 * strip never jumps backwards mid-turn. See docs/features/media-viewer.md.
 */
const props = defineProps({
  /** Everything being stepped through, in order. */
  items: { type: Array, default: () => [] },
  /** Which of `items` is on show. The parent owns it; this only plays the move. */
  index: { type: Number, default: 0 },
})

/** The frame the window is built around; the index moves inside it. */
const base = ref(props.index)
/** How many frames the track is currently offset by, during a step. */
const shift = ref(0)
const animated = ref(false)
/** True while a slide is in flight; a second step waits its turn. */
let moving = false
/** The frame a running slide is travelling to, so it settles where it aimed. */
let slideTarget = null
/** The one step remembered while a slide runs. Absolute, never a delta. */
let queued = null
/** A settle of last resort, for a `transitionend` that never arrives. */
let settleTimer = null

/**
 * Told once a turn has landed, with the frame it landed on - the caller frames
 * the new record and reads the file that is actually on show from it.
 */
const emit = defineEmits(['settled'])

/** The frames that are ever in the DOM: the one on show and its neighbours. */
const window = computed(() => {
  const items = props.items
  if (!items.length) return []
  const first = Math.max(0, base.value - 1)
  const last = Math.min(items.length - 1, base.value + 1)
  const frames = []
  for (let i = first; i <= last; i += 1) frames.push(i)
  return frames
})

/** The offset that puts the frame on show in the middle of the window. */
const restSlot = computed(() => base.value - (window.value[0] ?? 0))

const trackStyle = computed(() => ({
  transform: `translateX(${-(restSlot.value + shift.value) * 100}%)`,
  // Written inline, so a `0ms` reset cannot be eased over by the class's own
  // duration - the same reason the viewer sets its own.
  transitionDuration: animated.value ? `${SLIDE_MS}ms` : '0ms',
}))

/** Puts the strip at rest with `next` in the middle, playing nothing. */
function settle(next) {
  base.value = next
  shift.value = 0
  animated.value = false
  emit('settled', next)
}

/** Starts a slide to `next`, or snaps when there is no frame to slide through. */
function play(next) {
  const delta = next - base.value

  if (delta === 0) {
    slideTarget = null
    return
  }

  // Further than a frame: nothing is mounted between them to slide through, and
  // the reader was put there rather than stepping there.
  if (Math.abs(delta) > 1 || motionReduced()) {
    settle(next)
    slideTarget = null
    return
  }

  slideTarget = next
  shift.value = delta
  animated.value = true
  moving = true

  // A `transitionend` can be missed - a backgrounded tab, a transform that lands
  // on the value it started from. Without this the strip would believe a slide
  // was still running and queue every later step for good.
  clearTimeout(settleTimer)
  settleTimer = setTimeout(finishSlide, SLIDE_MS + 80)
}

/** Ends the running slide and writes the state it was on its way to. */
function finishSlide() {
  clearTimeout(settleTimer)
  settleTimer = null
  if (!moving) return

  moving = false
  const target = slideTarget ?? props.index
  slideTarget = null
  settle(target)

  const next = queued
  queued = null
  // The reset has to be painted before the next slide is armed, or the queued
  // step would start from where the strip stood before the one just played.
  nextTick(() =>
    requestAnimationFrame(() => {
      if (next != null && next !== base.value) play(next)
      else animated.value = true
    }),
  )
}

watch(
  () => props.index,
  (next) => {
    if (next === base.value) return
    // A step arriving mid-slide waits for the frame; dropping it or snapping to
    // it is what made a quick second press jerk the picture back and forth.
    if (moving) {
      queued = next
      return
    }
    play(next)
  },
)

function onTransitionEnd(event) {
  if (event.propertyName !== 'transform' || !moving) return
  finishSlide()
}

// A shorter list can leave the window past its end.
watch(
  () => props.items.length,
  () => {
    if (base.value > props.items.length - 1) settle(Math.max(0, props.items.length - 1))
  },
)
</script>

<template>
  <div class="media-strip" @transitionend="onTransitionEnd">
    <div class="media-strip-track" :style="trackStyle">
      <div
        v-for="frame in window"
        :key="items[frame]?.id ?? items[frame]?.fileName ?? frame"
        class="media-strip-frame"
      >
        <slot
          :item="items[frame]"
          :frame="frame"
          :active="frame === index"
          :position="frame - index"
        />
      </div>
    </div>
  </div>
</template>
