<script setup>
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import MediaGrid from '@/components/media/MediaGrid.vue'
import { useDaysStore } from '@/stores/days'
import { useUiStore } from '@/stores/ui'
import { restOfDay } from '@/services/searchResults'
import { isPrivate } from '@/services/privacy'
import { formatLongDate } from '@/services/dates'
import { cascadeDelay } from '@/services/cascade'

const props = defineProps({
  /** One entry of `splitSearchResults().mediaDays`. */
  group: { type: Object, required: true },
  editable: { type: Boolean, default: false },
  /** Editor-only: keeps hidden files out of the remainder this day hands back. */
  hideHidden: { type: Boolean, default: false },
  /** Id of the file a link singled out; only one group will actually hold it. */
  highlightedId: { type: Number, default: null },
})

const emit = defineEmits(['open', 'edit', 'context'])

const { t } = useI18n()
const days = useDaysStore()
const ui = useUiStore()

const expanded = ref(false)
const loading = ref(false)
const rest = ref([])

const heading = computed(() => formatLongDate(props.group.date, ui.locale))

/** The remainder as the editor's hide toggle leaves it; matched files arrive filtered. */
const restShown = computed(() =>
  props.hideHidden ? rest.value.filter((media) => !isPrivate(media)) : rest.value,
)

/**
 * The lightbox walks a single flat list, so matched files come first and the
 * expanded remainder follows in the same order they are rendered.
 */
const allShown = computed(() => [...props.group.matched, ...(expanded.value ? restShown.value : [])])

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

    <!-- A matched file is not outlined: it is a photograph like any other. The
         rest of the day is dimmed instead, so what matched stays ahead. -->
    <MediaGrid
      :items="group.matched"
      cascade
      show-time
      :editable="editable"
      :highlighted-id="highlightedId"
      @open="openAt"
      @edit="emit('edit', $event)"
      @context="emit('context', $event)"
    />

    <!-- Folds open as it arrives and folds shut as it is put away, so the button
         below it is never jumped over. -->
    <Transition name="reveal">
      <div v-if="expanded && restShown.length" class="reveal mt-2">
        <MediaGrid
          :items="restShown"
          cascade
          dimmed
          show-time
          :editable="editable"
          :highlighted-id="highlightedId"
          @open="openAt"
          @edit="emit('edit', $event)"
          @context="emit('context', $event)"
        />
      </div>
    </Transition>

    <!-- Arrives after the tiles it belongs to, in the same cascade. -->
    <button
      type="button"
      class="cascade-item mt-3 text-xs text-ink-faint underline underline-offset-4 transition hover:text-ink"
      :style="cascadeDelay(group.matched.length)"
      :disabled="loading"
      @click="toggle"
    >
      <template v-if="loading">{{ t('common.loading') }}</template>
      <template v-else-if="expanded">{{ t('search.collapseDay') }}</template>
      <template v-else>{{ t('search.expandDay') }}</template>
    </button>
  </section>
</template>
