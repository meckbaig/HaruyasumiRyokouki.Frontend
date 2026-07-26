<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps({
  error: { type: Object, default: null },
})

defineEmits(['retry'])

const { t } = useI18n()

/**
 * Prefer what the server said (ProblemDetails `detail`, then `title`) and fall
 * back to a generic message keyed off the status code.
 */
const message = computed(() => {
  const error = props.error
  if (!error) return t('errors.generic')
  return error.detail || error.title || t(error.fallbackKey ?? 'errors.generic')
})
</script>

<template>
  <div
    role="alert"
    class="flex flex-col items-center gap-4 rounded-lg border border-edge bg-paper-raised px-6 py-10 text-center"
  >
    <p class="max-w-prose text-ink-soft">{{ message }}</p>
    <button
      type="button"
      class="rounded-md border border-edge px-4 py-2 text-sm font-medium text-ink transition hover:border-ink-faint hover:bg-paper"
      @click="$emit('retry')"
    >
      {{ t('common.retry') }}
    </button>
  </div>
</template>
