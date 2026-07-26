<script setup>
import { useI18n } from 'vue-i18n'
import { useUiStore } from '@/stores/ui'
import { useDaysStore } from '@/stores/days'
import { useSearchStore } from '@/stores/search'
import { SUPPORTED_LOCALES } from '@/i18n'

const { t } = useI18n()
const ui = useUiStore()
const days = useDaysStore()
const search = useSearchStore()

const LABELS = { ru: 'RU', en: 'EN', ja: '日本語' }

/**
 * The locale is also the `Accept-Language` the API is asked with, so switching
 * it invalidates every cached response — notes and titles come back translated.
 */
function choose(locale) {
  if (locale === ui.locale) return
  ui.setLocale(locale)
  days.invalidate()
  search.invalidate()
  days.loadList(true)
}
</script>

<template>
  <div class="flex items-center gap-1" role="group" :aria-label="t('language.label')">
    <button
      v-for="locale in SUPPORTED_LOCALES"
      :key="locale"
      type="button"
      class="rounded px-2 py-1 text-xs font-medium transition"
      :class="
        locale === ui.locale
          ? 'bg-ink text-paper'
          : 'text-ink-faint hover:bg-edge/60 hover:text-ink'
      "
      :aria-pressed="locale === ui.locale"
      @click="choose(locale)"
    >
      {{ LABELS[locale] }}
    </button>
  </div>
</template>
