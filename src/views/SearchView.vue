<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import MediaResultGroup from '@/components/search/MediaResultGroup.vue'
import NoteResultCard from '@/components/search/NoteResultCard.vue'
import MediaLightbox from '@/components/media/MediaLightbox.vue'
import MediaContextMenu from '@/components/media/MediaContextMenu.vue'
import MediaEditDialog from '@/components/editor/MediaEditDialog.vue'
import ShareButton from '@/components/common/ShareButton.vue'
import LoadingIndicator from '@/components/common/LoadingIndicator.vue'
import ErrorState from '@/components/common/ErrorState.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import { useSearchStore } from '@/stores/search'
import { useAuthStore } from '@/stores/auth'
import { useUiStore } from '@/stores/ui'
import { useMediaLink } from '@/composables/useMediaLink'
import { scrollToMedia } from '@/services/scrollToMedia'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const search = useSearchStore()
const auth = useAuthStore()
const ui = useUiStore()

const TABS = ['media', 'notes']

const lightboxItems = ref([])
const lightboxIndex = ref(null)
const editing = ref(null)
/** `{ media, x, y }` of the file right-clicked in a result group. */
const contextTarget = ref(null)

const query = computed(() => String(route.query.text ?? ''))
// The active tab lives in the URL so a shared link reopens on the same one.
const tab = computed(() => (TABS.includes(route.query.tab) ? route.query.tab : 'media'))

const mediaDays = computed(() => search.results.mediaDays)
const noteDays = computed(() => search.results.noteDays)

const counts = computed(() => ({
  media: mediaDays.value.reduce((sum, group) => sum + group.matched.length, 0),
  notes: noteDays.value.length,
}))

function run() {
  search.run(query.value, ui.locale)
}

onMounted(run)
watch(query, run)
watch(() => ui.locale, run)

/*
  A link pointing at one file of these results — the same contract the day page
  keeps (composables/useMediaLink).

  Resolved against the matched files only, which is what a search link can
  honestly promise: the rest of a day appears solely because a reader asked for
  it, and reaching into days that are still folded away to find a file would mean
  fetching every one of them on the chance that it is there.

  A new query is a new set of results, so a link belonging to the old one is
  resolved again from scratch, and dropped if it no longer belongs anywhere.
*/
const mediaLink = useMediaLink({ suspended: () => lightboxIndex.value !== null })
const highlightedId = computed(() => mediaLink.link.value.id)

let linkResolved = false
watch(query, () => (linkResolved = false))

// The store replaces its whole result object once per completed run — cached or
// fetched, hit or miss — which makes it the one signal that says "these are the
// results now". Counting groups would fire early, when there are none yet.
watch(
  () => search.results,
  () => {
    if (linkResolved) return
    linkResolved = true

    const { id, open } = mediaLink.link.value
    if (id == null) return

    for (const group of mediaDays.value) {
      const index = group.matched.findIndex((item) => item.id === id)
      if (index < 0) continue

      if (open) {
        lightboxItems.value = group.matched
        lightboxIndex.value = index
      } else {
        scrollToMedia(id)
      }
      return
    }

    // Nothing in these results is that file.
    mediaLink.clear()
  },
)

watch(lightboxIndex, (index) => {
  const opened = index == null ? null : lightboxItems.value[index]
  if (opened) mediaLink.write(opened.id, true)
  else mediaLink.clear()
})

function selectTab(next) {
  if (next === tab.value) return
  router.replace({ name: 'search', query: { ...route.query, tab: next } })
}

function openLightbox({ items, index }) {
  lightboxItems.value = items
  lightboxIndex.value = index
}
</script>

<template>
  <div class="mx-auto max-w-6xl px-4 py-8">
    <header class="mb-6 flex flex-wrap items-end justify-between gap-4">
      <h1 class="text-xl font-semibold tracking-tight text-ink">
        {{ t('search.heading', { query }) }}
      </h1>
      <ShareButton />
    </header>

    <div class="mb-6 flex gap-1 border-b border-edge" role="tablist">
      <button
        v-for="name in TABS"
        :key="name"
        type="button"
        role="tab"
        :aria-selected="tab === name"
        class="-mb-px border-b-2 px-4 py-2 text-sm transition"
        :class="
          tab === name
            ? 'border-ink font-medium text-ink'
            : 'border-transparent text-ink-faint hover:text-ink-soft'
        "
        @click="selectTab(name)"
      >
        {{ t(`search.tabs.${name}`) }}
        <span class="ml-1 text-xs text-ink-faint">{{ counts[name] }}</span>
      </button>
    </div>

    <!-- A skeleton grid would promise media results before the shape of the
         answer is known — a query may return only notes, or nothing. -->
    <LoadingIndicator v-if="search.loading" />

    <ErrorState v-else-if="search.error" :error="search.error" @retry="run" />

    <EmptyState v-else-if="!search.hasResults" :message="t('search.empty')" />

    <template v-else>
      <div v-show="tab === 'media'" role="tabpanel">
        <div v-if="mediaDays.length" class="space-y-8">
          <MediaResultGroup
            v-for="group in mediaDays"
            :key="group.date"
            :group="group"
            :editable="auth.isEditor"
            :highlighted-id="highlightedId"
            @open="openLightbox"
            @edit="editing = $event"
            @context="contextTarget = $event"
          />
        </div>
        <EmptyState v-else :message="t('search.emptyMedia')" />
      </div>

      <div v-show="tab === 'notes'" role="tabpanel">
        <div v-if="noteDays.length" class="space-y-8">
          <NoteResultCard
            v-for="day in noteDays"
            :key="day.date"
            :day="day"
            :tokens="search.results.tokens"
          />
        </div>
        <EmptyState v-else :message="t('search.emptyNotes')" />
      </div>
    </template>

    <MediaContextMenu :target="contextTarget" @close="contextTarget = null" />
    <MediaLightbox v-model:index="lightboxIndex" :items="lightboxItems" />
    <MediaEditDialog
      :open="Boolean(editing)"
      :media="editing"
      @close="editing = null"
      @saved="run"
    />
  </div>
</template>
