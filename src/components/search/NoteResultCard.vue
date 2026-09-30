<script setup>
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import RichText from '@/components/common/RichText.vue'
import { findRanges } from '@/services/highlight'
import { formatLongDate } from '@/services/dates'
import { useUiStore } from '@/stores/ui'
import { withMediaLink } from '@/composables/useMediaLink'

const props = defineProps({
  /** One entry of `splitSearchResults().noteDays`. */
  day: { type: Object, required: true },
  tokens: { type: Array, default: () => [] },
})

const { t } = useI18n()
const router = useRouter()
const ui = useUiStore()

const expanded = ref(false)

const heading = computed(() => formatLongDate(props.day.date, ui.locale))
// When the whole note is shown, highlights have to be recomputed against the
// full text - the snippet ranges are relative to their own slices.
const fullRanges = computed(() => (expanded.value ? findRanges(props.day.note, props.tokens) : []))

/*
  Following a reference into its day, with every file it named singled out -
  the same `?i=` a note's own reference writes on the day page. No preview card
  stands here, so the link is the whole gesture.
  See docs/features/search.md.
*/
function follow(reference) {
  const ids = reference.ids?.length ? reference.ids : [reference.mediaId]
  router.push({
    name: 'day',
    params: { date: props.day.date },
    query: withMediaLink({}, ids),
  })
}
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
        <RichText
          :text="day.note"
          :media="day.media"
          :ranges="fullRanges"
          :preview="false"
          @media-activate="follow"
        />
      </template>
      <template v-else>
        <p v-for="(snippet, index) in day.snippets" :key="index" :class="index > 0 ? 'mt-3' : ''">
          <span v-if="snippet.hasPrefix" class="text-ink-faint">…</span>
          <RichText
            :text="snippet.text"
            :media="day.media"
            :ranges="snippet.ranges"
            :preview="false"
            @media-activate="follow"
          />
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
