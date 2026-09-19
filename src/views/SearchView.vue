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
import HiddenRecordsToggle from '@/components/common/HiddenRecordsToggle.vue'
import LoadingIndicator from '@/components/common/LoadingIndicator.vue'
import ErrorState from '@/components/common/ErrorState.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import { deleteMedia } from '@/api/media'
import { useSearchStore } from '@/stores/search'
import { useAuthStore } from '@/stores/auth'
import { useEditorStore } from '@/stores/editor'
import { useUiStore } from '@/stores/ui'
import { useTagsStore } from '@/stores/tags'
import { useMediaLink } from '@/composables/useMediaLink'
import { scrollToMedia } from '@/services/scrollToMedia'
import { hasOverlay } from '@/services/overlayStack'
import { cascadeDelay } from '@/services/cascade'
import { captionForSlug } from '@/services/tags'
import { applyHead } from '@/services/head'
import { useHiddenRecords } from '@/composables/useHiddenRecords'
import { useGridReadonly } from '@/composables/useGridReadonly'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const search = useSearchStore()
const auth = useAuthStore()
const editor = useEditorStore()
const ui = useUiStore()
const tags = useTagsStore()

const TABS = ['media', 'notes']

const lightboxItems = ref([])
const lightboxIndex = ref(null)
const editing = ref(null)
/** `{ media, x, y }` of the file right-clicked in a result group. */
const contextTarget = ref(null)

const query = computed(() => String(route.query.text ?? ''))
/** The other half of the contract: an exact tag, named by its slug. */
const tagSlug = computed(() => String(route.query.tag ?? '').trim())
const byTag = computed(() => Boolean(tagSlug.value))
// The active tab lives in the URL so a shared link reopens on the same one.
const tab = computed(() => (TABS.includes(route.query.tab) ? route.query.tab : 'media'))

/* The editor's hide toggle drops private files from the answer, on the fly; the
   cached results are left untouched, so showing them again is instant. */
const { hidden: recordsHidden, withoutHidden } = useHiddenRecords()
/* The footer's read-only wall, so a browsing editor cannot edit by accident. */
const { readonly: gridReadonly } = useGridReadonly()

const mediaDays = computed(() => {
  const groups = search.results.mediaDays
  if (!recordsHidden.value) return groups
  return groups
    .map((group) => ({ ...group, matched: withoutHidden(group.matched) }))
    .filter((group) => group.matched.length)
})
const noteDays = computed(() => search.results.noteDays)

const counts = computed(() => ({
  media: mediaDays.value.reduce((sum, group) => sum + group.matched.length, 0),
  notes: noteDays.value.length,
}))

/**
 * What to call the tag in the heading. Read out of the answer, not looked up - a
 * visitor has no dictionary. See docs/features/search.md.
 */
const tagName = computed(() =>
  byTag.value
    ? captionForSlug(tagSlug.value, ui.locale, {
        known: tags.getBySlug(tagSlug.value),
        fetched: search.tagName,
      })
    : '',
)

const heading = computed(() =>
  byTag.value
    ? t('search.headingTag', { tag: tagName.value })
    : t('search.heading', { query: query.value }),
)

function run() {
  search.run({ text: query.value, tag: tagSlug.value }, ui.locale)
}

onMounted(run)
watch([query, tagSlug], run)
watch(() => ui.locale, run)

/* A tag search's tab names the tag, spelled as a hashtag. The slug is known at
   once and the caption only once the results name it, so this refines the title
   the router set. A free search is the router's business alone. */
watch(
  [query, tagSlug, tagName],
  () => {
    if (!byTag.value) return
    applyHead({ title: `#${tagName.value || tagSlug.value}` })
  },
  { immediate: true },
)

/*
  A link pointing at one file of these results, the same contract the day page
  keeps. **Resolved against the matched files only** - reaching into folded-away
  days would mean fetching every one. See docs/features/sharing-and-links.md.
*/
// Any overlay, not just this page's viewer: one opened from an edit dialog
// still covers the outline, and a press over it is not the reader dismissing it.
const mediaLink = useMediaLink({ suspended: () => hasOverlay() })
const highlightedId = computed(() => mediaLink.link.value.id)

let linkResolved = false
watch([query, tagSlug], () => (linkResolved = false))

// The store replaces its whole result object once per completed run - cached or
// fetched, hit or miss - which makes it the one signal that says "these are the
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

// Files deleted through the app-level toolbar; the page cannot hear its events.
watch(
  () => editor.lastDelete,
  () => {
    search.invalidate()
    run()
  },
)

function selectTab(next) {
  if (next === tab.value) return
  router.replace({ name: 'search', query: { ...route.query, tab: next } })
}

function openLightbox({ items, index }) {
  lightboxItems.value = items
  lightboxIndex.value = index
}

/** Same as the day page: the file in the results was written to in place. */
function onMediaSaved({ applied } = {}) {
  editing.value = null
  if (!applied) {
    search.invalidate()
    run()
  }
}

/** A deleted file has to leave the cache as well: it is in every query it matched. */
async function removeMedia(list) {
  // The dialog hands over everything it was editing; these pages only ever open
  // it on one file.
  const media = Array.isArray(list) ? list[0] : list
  if (!media) return

  const agreed = await ui.confirm({
    title: t('admin.deleteTitle'),
    message: t('admin.deleteConfirm', { name: media.fileName }),
    confirmLabel: t('common.delete'),
  })
  if (!agreed) return

  try {
    await deleteMedia(media.id)
    ui.notify(t('admin.deleted'), 'success')
    editing.value = null
    search.invalidate()
    run()
  } catch (caught) {
    ui.notify(caught?.detail || caught?.title || t('errors.generic'), 'error')
  }
}
</script>

<template>
  <div class="mx-auto max-w-6xl px-4 py-8">
    <header class="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div class="min-w-0">
        <h1 class="text-xl font-semibold tracking-tight text-ink">
          {{ heading }}
        </h1>
        <!-- A tag has no tabs, so its total is said here instead. -->
        <p v-if="byTag" class="mt-1 text-sm text-ink-faint">
          {{ t('search.mediaFound', { count: counts.media }, counts.media) }}
        </p>
      </div>
      <div class="flex items-center gap-2">
        <HiddenRecordsToggle v-if="auth.isEditor" />
        <ShareButton />
      </div>
    </header>

    <!-- The notes tab is meaningless for a tag: nothing was typed, so no day
         note can have matched, and offering an always-empty tab reads as a
         result rather than as an absence. -->
    <div v-if="!byTag" class="mb-6 flex gap-1 border-b border-edge" role="tablist">
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
         answer is known - a query may return only notes, or nothing. -->
    <LoadingIndicator v-if="search.loading" />

    <ErrorState v-else-if="search.error" :error="search.error" @retry="run" />

    <!-- A tag that finds nothing is a dead end with no next move to guess at, so
         it is handed one: everything, from the top. -->
    <div v-else-if="!search.hasResults">
      <EmptyState :message="t('search.empty')" />
      <p v-if="byTag" class="mt-4 text-center text-sm">
        <RouterLink
          :to="{ name: 'home' }"
          class="text-ink-soft underline underline-offset-4 transition hover:text-ink"
        >
          {{ t('search.showEverything') }}
        </RouterLink>
      </p>
    </div>

    <template v-else>
      <div v-show="byTag || tab === 'media'" role="tabpanel">
        <div v-if="mediaDays.length" class="space-y-8">
          <MediaResultGroup
            v-for="(group, index) in mediaDays"
            :key="group.date"
            class="cascade-item"
            :style="cascadeDelay(index)"
            :group="group"
            :editable="auth.isEditor"
            :readonly="gridReadonly"
            :highlighted-id="highlightedId"
            :hide-hidden="recordsHidden"
            @open="openLightbox"
            @edit="editing = $event"
            @context="contextTarget = $event"
          />
        </div>
        <EmptyState v-else :message="t('search.emptyMedia')" />
      </div>

      <div v-show="!byTag && tab === 'notes'" role="tabpanel">
        <div v-if="noteDays.length" class="space-y-8">
          <NoteResultCard
            v-for="(day, index) in noteDays"
            :key="day.date"
            class="cascade-item"
            :style="cascadeDelay(index)"
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
      deletable
      @close="editing = null"
      @saved="onMediaSaved"
      @delete="removeMedia"
    />
  </div>
</template>
