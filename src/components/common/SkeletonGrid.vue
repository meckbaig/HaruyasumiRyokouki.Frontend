<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'

const props = defineProps({
  /** How many rows of placeholders to draw when the count is not known. */
  rows: { type: Number, default: 2 },
  /**
   * How many files are actually coming, when that is known ahead of time — the
   * day list carries `mediaCount` for every day, so the day page knows before
   * the day itself has arrived. Drawing exactly that many makes the placeholder
   * the same shape as what replaces it, and the page stops jumping.
   */
  count: { type: Number, default: null },
})

/**
 * Column counts per breakpoint, mirroring the `grid-cols-*` utilities on
 * MediaGrid. They have to be known in JavaScript because the placeholder count
 * follows from them: a fixed count leaves a ragged half-filled last row, which
 * reads as content rather than as a placeholder.
 */
const BREAKPOINTS = [
  { min: 1024, columns: 5 },
  { min: 768, columns: 4 },
  { min: 640, columns: 3 },
  { min: 0, columns: 2 },
]

const width = ref(window.innerWidth)

function onResize() {
  width.value = window.innerWidth
}

onMounted(() => window.addEventListener('resize', onResize, { passive: true }))
onBeforeUnmount(() => window.removeEventListener('resize', onResize))

const columns = computed(
  () => BREAKPOINTS.find((breakpoint) => width.value >= breakpoint.min)?.columns ?? 2,
)

/**
 * A day of three hundred photographs is still only a screenful of waiting, and
 * drawing three hundred pulsing squares to say so costs more than it tells. The
 * cap is generous enough to fill any screen twice over.
 */
const MAX_PLACEHOLDERS = 30

const placeholders = computed(() => {
  if (props.count == null) return columns.value * props.rows
  // Rounded up to a whole row: a ragged last row reads as content rather than
  // as something still on its way.
  const wanted = Math.min(props.count, MAX_PLACEHOLDERS)
  return Math.ceil(wanted / columns.value) * columns.value
})
</script>

<template>
  <div
    class="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5"
    aria-hidden="true"
  >
    <div
      v-for="index in placeholders"
      :key="index"
      class="aspect-square animate-pulse rounded-md bg-edge/60"
    />
  </div>
</template>
