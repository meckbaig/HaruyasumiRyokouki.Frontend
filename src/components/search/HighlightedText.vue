<script setup>
import { computed } from 'vue'
import { toParts } from '@/services/highlight'

const props = defineProps({
  text: { type: String, default: '' },
  /** `[start, end)` pairs relative to `text`. */
  ranges: { type: Array, default: () => [] },
})

// Rendering alternating spans instead of building an HTML string keeps note
// text out of `v-html`, so nothing in a note can inject markup.
const parts = computed(() => toParts(props.text, props.ranges))
</script>

<template>
  <span>
    <template v-for="(part, index) in parts" :key="index">
      <mark v-if="part.match" class="rounded-sm bg-accent-soft px-0.5 text-ink">{{
        part.text
      }}</mark>
      <template v-else>{{ part.text }}</template>
    </template>
  </span>
</template>
