<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useThemeStore } from '@/stores/theme'

const { t } = useI18n()
const theme = useThemeStore()

// A single button that cycles system -> light -> dark -> black, with an icon
// per state so the current theme is legible at a glance.
const ICONS = { system: '◐', light: '☀', dark: '☾', black: '◍' }

const label = computed(() => t(`theme.${theme.preference}`))

function cycle() {
  const order = theme.THEME_OPTIONS
  const index = order.indexOf(theme.preference)
  theme.set(order[(index + 1) % order.length])
}
</script>

<template>
  <button
    type="button"
    class="flex h-7 w-7 items-center justify-center rounded text-sm text-ink-soft transition hover:bg-edge/60 hover:text-ink"
    :title="`${t('theme.label')}: ${label}`"
    :aria-label="`${t('theme.label')}: ${label}`"
    @click="cycle"
  >
    <span aria-hidden="true">{{ ICONS[theme.preference] }}</span>
  </button>
</template>
