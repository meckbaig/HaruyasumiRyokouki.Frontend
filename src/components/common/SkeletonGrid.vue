<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'

const props = defineProps({
  /** How many rows of placeholders to draw. */
  rows: { type: Number, default: 2 },
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
const count = computed(() => columns.value * props.rows)
</script>

<template>
  <div
    class="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5"
    aria-hidden="true"
  >
    <div
      v-for="index in count"
      :key="index"
      class="aspect-square animate-pulse rounded-md bg-edge/60"
    />
  </div>
</template>
