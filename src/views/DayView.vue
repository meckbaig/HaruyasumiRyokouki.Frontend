<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import MediaGrid from '@/components/media/MediaGrid.vue'
import MediaLightbox from '@/components/media/MediaLightbox.vue'
import TripCalendar from '@/components/calendar/TripCalendar.vue'
import TripMap from '@/components/map/TripMap.vue'
import ShareButton from '@/components/common/ShareButton.vue'
import SkeletonGrid from '@/components/common/SkeletonGrid.vue'
import ErrorState from '@/components/common/ErrorState.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import MediaEditDialog from '@/components/editor/MediaEditDialog.vue'
import DayEditForm from '@/components/editor/DayEditForm.vue'
import { useDaysStore } from '@/stores/days'
import { useAuthStore } from '@/stores/auth'
import { useUiStore } from '@/stores/ui'
import { formatLongDate, formatWeekday } from '@/services/dates'
import { isFallbackLanguage } from '@/services/translations'

const props = defineProps({
  date: { type: String, required: true },
})

const { t } = useI18n()
const router = useRouter()
const days = useDaysStore()
const auth = useAuthStore()
const ui = useUiStore()

const MAP_HIDDEN_KEY = 'haruyasumi.dayMapHidden'

const loading = ref(false)
const error = ref(null)
const lightboxIndex = ref(null)
const editing = ref(null)
const editingNote = ref(false)

// Persisted preference: some visitors find the day map distracting, so it can be
// hidden by default. When on, the map starts collapsed and a show/hide button
// takes the place of the plain heading.
const mapHiddenByDefault = ref(localStorage.getItem(MAP_HIDDEN_KEY) === '1')
const mapShown = ref(!mapHiddenByDefault.value)

function toggleMapDefault() {
  mapHiddenByDefault.value = !mapHiddenByDefault.value
  localStorage.setItem(MAP_HIDDEN_KEY, mapHiddenByDefault.value ? '1' : '0')
  // Reflect the new default in the current view immediately.
  mapShown.value = !mapHiddenByDefault.value
}

const day = computed(() => days.getDay(props.date))
const media = computed(() => day.value?.media ?? [])
const locatedMedia = computed(() =>
  media.value.filter(
    (item) => Number.isFinite(item?.latitude) && Number.isFinite(item?.longitude),
  ),
)
const neighbours = computed(() => days.neighbours(props.date))
const showFallbackNotice = computed(() => isFallbackLanguage(day.value, ui.locale))

const heading = computed(() => formatLongDate(props.date, ui.locale))
const weekday = computed(() => formatWeekday(props.date, ui.locale))

async function load(force = false) {
  loading.value = true
  error.value = null
  try {
    await days.loadDay(props.date, force)
  } catch (caught) {
    error.value = caught
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  days.loadList()
  load()
})

// Navigating between days reuses this component, so react to the param itself.
watch(
  () => props.date,
  () => {
    load()
    // Each day starts from the persisted default.
    mapShown.value = !mapHiddenByDefault.value
  },
)

// A locale switch clears the cache; refetch the day the visitor is looking at.
watch(() => ui.locale, () => load(true))

function openDay(date) {
  router.push({ name: 'day', params: { date } })
}

/**
 * Left/right arrows step to the previous/next day. Ignored while typing, while
 * the lightbox is open (it owns the arrows there), or while editing the note.
 */
function onKeydown(event) {
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
  if (lightboxIndex.value !== null || editingNote.value) return

  const el = document.activeElement
  const tag = el?.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el?.isContentEditable) return

  const target = event.key === 'ArrowLeft' ? neighbours.value.prev : neighbours.value.next
  if (target) {
    event.preventDefault()
    router.push({ name: 'day', params: { date: target } })
  }
}

onMounted(() => document.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown))

function onMediaSaved() {
  editing.value = null
  load(true)
}

function onNoteSaved() {
  editingNote.value = false
  load(true)
  days.loadList(true)
}
</script>

<template>
  <div class="mx-auto max-w-6xl px-4 py-8">
    <header class="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <p class="text-xs uppercase tracking-wide text-ink-faint">{{ weekday }}</p>
        <h1 class="mt-1 text-2xl font-semibold tracking-tight text-ink">{{ heading }}</h1>
        <p v-if="media.length" class="mt-1 text-sm text-ink-faint">
          {{ t('day.mediaCount', { count: media.length }, media.length) }}
        </p>
      </div>

      <div class="flex items-center gap-2">
        <RouterLink
          v-if="neighbours.prev"
          :to="{ name: 'day', params: { date: neighbours.prev } }"
          class="btn-ghost !px-3"
          :aria-label="t('day.prev')"
        >
          ←
        </RouterLink>
        <RouterLink
          v-if="neighbours.next"
          :to="{ name: 'day', params: { date: neighbours.next } }"
          class="btn-ghost !px-3"
          :aria-label="t('day.next')"
        >
          →
        </RouterLink>
        <ShareButton />
      </div>
    </header>

    <ErrorState v-if="error" :error="error" @retry="load(true)" />

    <template v-else>
      <p
        v-if="showFallbackNotice"
        class="mb-6 rounded-md bg-edge/50 px-4 py-2 text-xs text-ink-soft"
      >
        {{ t('language.fallbackNotice') }}
      </p>

      <section class="mb-10">
        <div class="mb-3 flex items-center justify-between gap-4">
          <h2 class="text-sm font-semibold text-ink-soft">{{ t('day.note') }}</h2>
          <button
            v-if="auth.isEditor && !editingNote"
            type="button"
            class="text-xs text-ink-faint underline underline-offset-4 transition hover:text-ink"
            @click="editingNote = true"
          >
            {{ t('common.edit') }}
          </button>
        </div>

        <DayEditForm
          v-if="editingNote && day"
          :day="day"
          :date="date"
          @saved="onNoteSaved"
          @cancel="editingNote = false"
        />
        <template v-else>
          <div v-if="loading && !day" class="space-y-2">
            <div class="h-4 w-3/4 animate-pulse rounded bg-edge/60" />
            <div class="h-4 w-full animate-pulse rounded bg-edge/60" />
            <div class="h-4 w-5/6 animate-pulse rounded bg-edge/60" />
          </div>
          <p
            v-else-if="day?.note"
            class="whitespace-pre-wrap text-sm leading-relaxed text-ink-soft"
          >
            {{ day.note }}
          </p>
          <p v-else class="text-sm text-ink-faint">{{ t('day.noNote') }}</p>
        </template>
      </section>

      <section class="mb-12">
        <SkeletonGrid v-if="loading && !day" />
        <MediaGrid
          v-else-if="media.length"
          :items="media"
          :editable="auth.isEditor"
          @open="lightboxIndex = media.indexOf($event)"
          @edit="editing = $event"
        />
        <EmptyState v-else :message="t('day.noMedia')" />
      </section>

      <section v-if="locatedMedia.length" class="mb-12">
        <div class="mb-3 flex items-center justify-between gap-4">
          <!-- Heading becomes a show/hide button when the map is hidden by default. -->
          <button
            v-if="mapHiddenByDefault"
            type="button"
            class="text-sm font-semibold text-ink-soft transition hover:text-ink"
            @click="mapShown = !mapShown"
          >
            {{ mapShown ? t('day.hideMap') : t('day.showMap') }}
          </button>
          <h2 v-else class="text-sm font-semibold text-ink-soft">{{ t('day.onMap') }}</h2>

          <!-- Preference toggle, always available while the day has locations. -->
          <label class="flex cursor-pointer items-center gap-2 text-xs text-ink-faint">
            {{ t('day.mapDefaultHidden') }}
            <input
              type="checkbox"
              class="peer sr-only"
              :checked="mapHiddenByDefault"
              @change="toggleMapDefault"
            />
            <span
              class="relative h-4 w-7 rounded-full bg-edge transition peer-checked:bg-accent peer-checked:[&>span]:translate-x-3"
              aria-hidden="true"
            >
              <span
                class="absolute left-0.5 top-0.5 h-3 w-3 rounded-full bg-paper-raised transition"
              />
            </span>
          </label>
        </div>

        <TripMap v-if="mapShown" :media="locatedMedia" :date="date" height="360px" />
      </section>

      <section class="mb-8">
        <h2 class="mb-6 text-center text-sm font-semibold text-ink-soft">
          {{ t('calendar.title') }}
        </h2>
        <!-- Anchored on the current day, so it sits in the middle month. -->
        <TripCalendar :days="days.list" :anchor="date" :selected="date" @select="openDay" />
      </section>
    </template>

    <MediaLightbox v-model:index="lightboxIndex" :items="media" />
    <MediaEditDialog
      :open="Boolean(editing)"
      :media="editing"
      :date="date"
      @close="editing = null"
      @saved="onMediaSaved"
    />
  </div>
</template>
