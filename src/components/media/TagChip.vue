<script setup>
defineProps({
  tag: { type: String, required: true },
})
</script>

<template>
  <!--
    Tags have no album route of their own; sharing an album means sharing a
    search, so a chip is just a pre-filled query.
  -->
  <RouterLink
    :to="{ name: 'search', query: { text: tag } }"
    class="inline-flex items-center rounded-full border border-edge px-2.5 pt-0.5 pb-1 text-xs text-ink-soft transition hover:border-ink-faint hover:text-ink"
  >
    #{{ tag }}
  </RouterLink>
</template>
