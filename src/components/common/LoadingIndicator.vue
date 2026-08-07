<script setup>
import { useI18n } from 'vue-i18n'

defineProps({
  /** Overrides the default "Loading…" wording. */
  message: { type: String, default: '' },
})

const { t } = useI18n()
</script>

<template>
  <!--
    A ring on its own reads as a stray artefact on a wide, otherwise empty page,
    so it comes with its label and enough weight to be found: thicker stroke, the
    accent colour on the leading arc, and the pair centred together.
  -->
  <div class="flex flex-col items-center justify-center gap-3 py-12" role="status">
    <span
      class="spinner h-10 w-10 rounded-full border-[3px] border-edge border-t-accent"
      aria-hidden="true"
    />
    <p class="text-sm text-ink-soft">{{ message || t('common.loading') }}</p>
  </div>
</template>
