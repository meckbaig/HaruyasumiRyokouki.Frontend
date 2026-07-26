<script setup>
defineProps({
  message: { type: String, required: true },
})
</script>

<template>
  <div class="rounded-lg border border-dashed border-edge px-6 py-12 text-center">
    <p class="text-ink-faint">{{ message }}</p>
    <div class="mt-4"><slot /></div>
  </div>
</template>
