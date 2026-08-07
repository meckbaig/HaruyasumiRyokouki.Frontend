<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import MediaResultGroup from '@/components/search/MediaResultGroup.vue'
import NoteResultCard from '@/components/search/NoteResultCard.vue'
import MediaLightbox from '@/components/media/MediaLightbox.vue'
import MediaEditDialog from '@/components/editor/MediaEditDialog.vue'
import ShareButton from '@/components/common/ShareButton.vue'
import LoadingIndicator from '@/components/common/LoadingIndicator.vue'
import ErrorState from '@/components/common/ErrorState.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import { useSearchStore } from '@/stores/search'
import { useAuthStore } from '@/stores/auth'
import { useUiStore } from '@/stores/ui'

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
            @open="openLightbox"
            @edit="editing = $event"
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

    <MediaLightbox v-model:index="lightboxIndex" :items="lightboxItems" />
    <MediaEditDialog
      :open="Boolean(editing)"
      :media="editing"
      @close="editing = null"
      @saved="run"
    />
  </div>
</template>
