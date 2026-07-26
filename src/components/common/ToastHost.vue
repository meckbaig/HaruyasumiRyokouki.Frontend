<script setup>
import { useUiStore } from '@/stores/ui'

const ui = useUiStore()

const TONE_CLASSES = {
  info: 'border-edge bg-paper-raised text-ink',
  success: 'border-edge bg-paper-raised text-ink',
  error: 'border-accent/40 bg-accent-soft text-ink',
}
</script>

<template>
  <div
    class="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4"
    role="status"
    aria-live="polite"
  >
    <TransitionGroup
      enter-from-class="translate-y-2 opacity-0"
      enter-active-class="transition duration-200"
      leave-to-class="translate-y-2 opacity-0"
      leave-active-class="transition duration-200"
    >
      <div
        v-for="toast in ui.toasts"
        :key="toast.id"
        class="pointer-events-auto rounded-md border px-4 py-2 text-sm shadow-sm"
        :class="TONE_CLASSES[toast.tone] ?? TONE_CLASSES.info"
      >
        {{ toast.message }}
      </div>
    </TransitionGroup>
  </div>
</template>
