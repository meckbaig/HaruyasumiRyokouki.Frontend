<script setup>
defineProps({
  count: { type: Number, default: 12 },
})
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
