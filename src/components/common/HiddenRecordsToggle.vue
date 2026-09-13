<script setup>
import { useI18n } from 'vue-i18n'
import { useHiddenRecords } from '@/composables/useHiddenRecords'

/**
 * Editor-only: hides the private files a page would otherwise show. The icon is
 * the one the tile uses for hiding a file. See docs/features/media-grid-and-selection.md.
 */
const { t } = useI18n()
const { hidden, toggle } = useHiddenRecords()
</script>

<template>
  <button
    type="button"
    class="btn-ghost !px-3"
    :class="hidden ? 'text-accent' : ''"
    :aria-pressed="hidden"
    :title="hidden ? t('media.showHidden') : t('media.hideHidden')"
    :aria-label="hidden ? t('media.showHidden') : t('media.hideHidden')"
    @click="toggle"
  >
    <svg
      class="h-4 w-4"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      stroke-width="1.4"
      aria-hidden="true"
    >
      <path
        d="M2.2 8s2.3-3.8 5.8-3.8S13.8 8 13.8 8s-2.3 3.8-5.8 3.8S2.2 8 2.2 8z"
        stroke-linejoin="round"
      />
      <circle cx="8" cy="8" r="1.6" />
      <path v-if="hidden" d="M3 13 13 3" stroke-linecap="round" />
    </svg>
  </button>
</template>
