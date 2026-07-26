<script setup>
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import MediaGrid from '@/components/media/MediaGrid.vue'
import { useDaysStore } from '@/stores/days'
import { useUiStore } from '@/stores/ui'
import { restOfDay } from '@/services/searchResults'
import { formatLongDate } from '@/services/dates'

const props = defineProps({
  /** One entry of `splitSearchResults().mediaDays`. */
  group: { type: Object, required: true },
  editable: { type: Boolean, default: false },
})

const emit = defineEmits(['open', 'edit'])

const { t } = useI18n()
const days = useDaysStore()
const ui = useUiStore()

const expanded = ref(false)
const loading = ref(false)
const rest = ref([])

const heading = computed(() => formatLongDate(props.group.date, ui.locale))

/**
 * The lightbox walks a single flat list, so matched files come first and the
 * expanded remainder follows in the same order they are rendered.
 */
const allShown = computed(() => [...props.group.matched, ...(expanded.value ? rest.value : [])])

/**
 * "Show the rest of this day" is a separate fetch: search only returned the
 * files that matched, so the full day has to be pulled and the already-visible
 * ones subtracted by id.
 */
async function toggle() {
  if (expanded.value) {
    expanded.value = false
    return
  }

  if (rest.value.length === 0) {
    loading.value = true
    try {
      const day = await days.loadDay(props.group.date)
      rest.value = restOfDay(day, props.group.matched)
    } catch {
      rest.value = []
    } finally {
      loading.value = false
    }
  }

  expanded.value = true
}

function openAt(media) {
  emit('open', { items: allShown.value, index: allShown.value.indexOf(media) })
}
</script>

<template>
  <section class="border-t border-edge pt-6 first:border-0 first:pt-0">
    <header class="mb-3 flex flex-wrap items-baseline justify-between gap-2">
      <RouterLink
        :to="{ name: 'day', params: { date: group.date } }"
        class="text-sm font-semibold text-ink underline decoration-edge underline-offset-4 transition hover:decoration-ink-faint"
      >
        {{ heading }}
      </RouterLink>
      <span class="text-xs text-ink-faint">
        {{ t('search.mediaFound', { count: group.matched.length }, group.matched.length) }}
      </span>
    </header>

    <!-- Matched files keep the dark outline; the rest of the day is muted. -->
    <MediaGrid
      :items="group.matched"
      variant="matched"
      :editable="editable"
      @open="openAt"
      @edit="emit('edit', $event)"
    />

    <div v-if="expanded && rest.length" class="mt-2">
      <MediaGrid
        :items="rest"
        variant="expanded"
        :editable="editable"
        @open="openAt"
        @edit="emit('edit', $event)"
      />
    </div>

    <button
      type="button"
      class="mt-3 text-xs text-ink-faint underline underline-offset-4 transition hover:text-ink"
      :disabled="loading"
      @click="toggle"
    >
      <template v-if="loading">{{ t('common.loading') }}</template>
      <template v-else-if="expanded">{{ t('search.collapseDay') }}</template>
      <template v-else>{{ t('search.expandDay') }}</template>
    </button>
  </section>
</template>
