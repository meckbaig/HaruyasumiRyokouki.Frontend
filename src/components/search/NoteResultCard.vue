<script setup>
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import HighlightedText from './HighlightedText.vue'
import { findRanges } from '@/services/highlight'
import { formatLongDate } from '@/services/dates'
import { useUiStore } from '@/stores/ui'

const props = defineProps({
  /** One entry of `splitSearchResults().noteDays`. */
  day: { type: Object, required: true },
  tokens: { type: Array, default: () => [] },
})

const { t } = useI18n()
const ui = useUiStore()

const expanded = ref(false)

const heading = computed(() => formatLongDate(props.day.date, ui.locale))
// When the whole note is shown, highlights have to be recomputed against the
// full text — the snippet ranges are relative to their own slices.
const fullRanges = computed(() => (expanded.value ? findRanges(props.day.note, props.tokens) : []))
</script>

<template>
  <article class="border-t border-edge pt-6 first:border-0 first:pt-0">
    <header class="mb-2 flex flex-wrap items-baseline justify-between gap-2">
      <RouterLink
        :to="{ name: 'day', params: { date: day.date } }"
        class="text-sm font-semibold text-ink underline decoration-edge underline-offset-4 transition hover:decoration-ink-faint"
      >
        {{ heading }}
      </RouterLink>
      <span v-if="!day.isReady" class="text-xs text-ink-faint">{{ t('day.notReady') }}</span>
    </header>

    <div
      class="whitespace-pre-wrap rounded-md bg-paper-raised p-4 text-sm leading-relaxed text-ink-soft ring-1 ring-edge"
    >
      <template v-if="expanded">
        <HighlightedText :text="day.note" :ranges="fullRanges" />
      </template>
      <template v-else>
        <p v-for="(snippet, index) in day.snippets" :key="index" :class="index > 0 ? 'mt-3' : ''">
          <span v-if="snippet.hasPrefix" class="text-ink-faint">…</span>
          <HighlightedText :text="snippet.text" :ranges="snippet.ranges" />
          <span v-if="snippet.hasSuffix" class="text-ink-faint">…</span>
        </p>
      </template>
    </div>

    <button
      type="button"
      class="mt-3 text-xs text-ink-faint underline underline-offset-4 transition hover:text-ink"
      @click="expanded = !expanded"
    >
      {{ expanded ? t('search.collapseNote') : t('search.expandNote') }}
    </button>
  </article>
</template>
