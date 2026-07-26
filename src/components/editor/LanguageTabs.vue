<script setup>
import { SUPPORTED_LOCALES } from '@/i18n'

defineProps({
  modelValue: { type: String, required: true },
  /** Blocks switching while the full edit model is still loading. */
  disabled: { type: Boolean, default: false },
})

const emit = defineEmits(['update:modelValue'])

const LABELS = { ru: 'RU', en: 'EN', ja: '日本語' }
</script>

<template>
  <!-- Language selector for the edit dialogs: fill every locale in one sitting. -->
  <div class="flex gap-1 rounded-md bg-edge/40 p-1" role="tablist">
    <button
      v-for="locale in SUPPORTED_LOCALES"
      :key="locale"
      type="button"
      role="tab"
      :disabled="disabled"
      :aria-selected="modelValue === locale"
      class="flex-1 rounded px-2 py-1 text-xs font-medium transition disabled:opacity-50"
      :class="modelValue === locale ? 'bg-paper-raised text-ink shadow-sm' : 'text-ink-faint hover:text-ink'"
      @click="emit('update:modelValue', locale)"
    >
      {{ LABELS[locale] }}
    </button>
  </div>
</template>
