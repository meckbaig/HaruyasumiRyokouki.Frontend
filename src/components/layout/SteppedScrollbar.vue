<script setup>
import { computed, ref } from 'vue'

/**
 * The bar for a list the reader moves one record at a time - the same shape as
 * `AppScrollbar`, but standing for records instead of pixels. Dragging picks a
 * record, never a fraction. See docs/features/rich-text-and-links.md.
 */
const props = defineProps({
  /** How many records the bar stands for. Below two there is nothing to step. */
  count: { type: Number, default: 0 },
  /** The record on show. */
  index: { type: Number, default: 0 },
})

const emit = defineEmits(['update:index'])

const track = ref(null)
const dragging = ref(false)

/** One record's share of the track, and how far down the records before it sit. */
const thumbHeight = computed(() => (props.count ? 100 / props.count : 100))
const thumbTop = computed(() => (props.count ? (props.index * 100) / props.count : 0))

/* Dragging. The pointer is captured so a hand straying off the bar does not drop
   it, and the grab offset keeps the thumb from jumping under the press. */
let grab = null

function onPointerDown(event) {
  const box = track.value?.getBoundingClientRect()
  if (!box || props.count < 2) return

  const travel = box.height - box.height / props.count
  grab = { y: event.clientY, top: (props.index / (props.count - 1)) * travel, travel }
  dragging.value = true
  event.currentTarget.setPointerCapture?.(event.pointerId)
  event.preventDefault()
}

function onPointerMove(event) {
  if (!grab || grab.travel <= 0) return

  const next = Math.min(grab.travel, Math.max(0, grab.top + (event.clientY - grab.y)))
  // Stepped, not free: the pointer picks a record, and the thumb's own transition
  // carries it there rather than teleporting.
  emit('update:index', Math.round((next / grab.travel) * (props.count - 1)))
}

function onPointerUp() {
  grab = null
  dragging.value = false
}
</script>

<template>
  <!-- The track takes no pointer events, so the strip it overlays does not lose
       presses to it; only the thumb answers a hand. -->
  <div v-if="count > 1" ref="track" class="stepped-scrollbar" aria-hidden="true">
    <span
      class="stepped-scrollbar-thumb"
      :class="dragging ? 'stepped-scrollbar-thumb-active' : ''"
      :style="{ top: `${thumbTop}%`, height: `${thumbHeight}%` }"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
    />
  </div>
</template>
