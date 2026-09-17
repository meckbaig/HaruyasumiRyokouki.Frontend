<script setup>
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import TripMap from '@/components/map/TripMap.vue'
import TripCalendar from '@/components/calendar/TripCalendar.vue'
import MediaLightbox from '@/components/media/MediaLightbox.vue'
import ShareButton from '@/components/common/ShareButton.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import { useDaysStore } from '@/stores/days'
import { useUiStore } from '@/stores/ui'
import { useTripMedia, routeFromMedia } from '@/composables/useTripMedia'
import { withMediaLink } from '@/composables/useMediaLink'
import { hasCoordinates } from '@/services/mapLinks'
import { hasOverlay } from '@/services/overlayStack'
import { MAP_COLLAPSE, MAP_EXPAND } from '@/services/mapIcons'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const days = useDaysStore()
const ui = useUiStore()

const { media, loading, load } = useTripMedia()

// Range lives in the URL, so a link shares the exact stretch being looked at.
const from = computed(() => String(route.query.from ?? ''))
const to = computed(() => String(route.query.to ?? ''))

/** Effective range: the picked one, or the whole trip when nothing is picked. */
const effectiveRange = computed(() => {
  const all = days.orderedDates
  return {
    from: from.value || all[0] || '',
    to: to.value || all[all.length - 1] || '',
  }
})

const routeLine = computed(() => routeFromMedia(media.value))

/** Clicking the calendar picks a start, then an end, then starts over. */
function pickDate(date) {
  if (!from.value || (from.value && to.value)) {
    router.replace({ name: 'map', query: { from: date } })
    return
  }
  const [start, end] = date < from.value ? [date, from.value] : [from.value, date]
  router.replace({ name: 'map', query: { from: start, to: end } })
}

function reset() {
  router.replace({ name: 'map' })
}

function reload() {
  const range = effectiveRange.value
  load(range.from, range.to)
}

async function refresh() {
  await days.loadList()
  reload()
}

/* Fullscreen builds a **second map**; a live Leaflet instance carried through a
   Teleport comes out broken. The inline map's own view is handed over, so the
   expanded one opens where the reader stood instead of re-fitting the points.
   See docs/features/maps.md. */
const expanded = ref(false)
const inlineMap = ref(null)
const fullMap = ref(null)
/** The inline map's view and album, handed to the full-screen one. */
const fullView = ref(null)
const fullSelection = ref(null)

function openFullscreen() {
  // The view and the album are **moved**, not copied: a second card left standing
  // on the map behind answers the keyboard and the card's own gestures first.
  fullView.value = inlineMap.value?.getView() ?? null
  fullSelection.value = inlineMap.value?.getSelection() ?? null
  expanded.value = true
  nextTick(() => inlineMap.value?.showMedia(null))
}

/**
 * Collapsing hands both back to the inline map - the album the reader had open,
 * and the ground they left - once the overlay has let go, so the two never hold
 * the same card at once. See docs/features/maps.md.
 */
function closeFullscreen() {
  const view = fullMap.value?.getView() ?? null
  const selection = fullMap.value?.getSelection() ?? null
  expanded.value = false
  nextTick(() => {
    inlineMap.value?.applyView(view)
    inlineMap.value?.showMedia(selection?.id ?? null)
  })
}

/* The album a pin opens: the viewer walks the same list the map is drawn from. */
const lightboxIndex = ref(null)

const openMedia = computed(() =>
  lightboxIndex.value == null ? null : (media.value[lightboxIndex.value] ?? null),
)
const openOnMap = computed(() => hasCoordinates(openMedia.value))

function openMapMedia(id) {
  const index = media.value.findIndex((item) => item.id === id)
  if (index >= 0) lightboxIndex.value = index
}

/** The map the reader is looking at: the expanded one stands over the inline. */
function activeMap() {
  return expanded.value ? fullMap.value : inlineMap.value
}

/*
  Every viewer this page opens comes from a map card, so a close always syncs the
  album. The day page, which opens one from a grid tile and a note too, gates it.
*/
function onViewerClose(id) {
  activeMap()?.showMedia(id ?? null)
}

/** The viewer's own action: the same close, plus the framing it is for. */
function showMediaOnMap(id) {
  activeMap()?.showMedia(id, { zoom: true })
}

/** A pin's "open day": the day page, with that file singled out. */
function openMapDay({ date, id }) {
  if (!date) return
  router.push({
    name: 'day',
    params: { date },
    query: id == null ? {} : withMediaLink({}, id),
  })
}

function onKeydown(event) {
  // A pin's own album owns Escape first; `hasOverlay()` says one is up.
  if (event.key === 'Escape' && expanded.value && !hasOverlay()) closeFullscreen()
}

onMounted(() => document.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown)
  // Nothing else would put the page back if the view left while expanded.
  document.body.style.overflow = ''
})

// The page behind an overlay must not scroll under it.
watch(expanded, (open) => {
  document.body.style.overflow = open ? 'hidden' : ''
})

onMounted(refresh)
// The range comes from the trip bounds, so react once the day list has loaded too.
watch([from, to, () => days.orderedDates.length], reload)
watch(() => ui.locale, refresh)
</script>

<template>
  <div class="mx-auto max-w-6xl px-4 py-8">
    <header class="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div class="min-w-0">
        <h1 class="text-xl font-semibold tracking-tight text-ink">{{ t('map.title') }}</h1>
        <p class="mt-1 text-sm text-ink-faint">
          <span v-if="loading">{{ t('common.loading') }}</span>
          <span v-else>{{ t('map.pointsCount', { count: media.length }, media.length) }}</span>
        </p>
      </div>

      <!--
        Wraps within itself, not only against the heading. A default range means
        "whole route" is on show from the first frame, and the controls beside a
        title are more than a phone has room for in one line - the last of them
        was simply off the right-hand edge.
      -->
      <div class="flex max-w-full flex-wrap items-center gap-2">
        <button v-if="from || to" type="button" class="btn-ghost" @click="reset">
          {{ t('map.reset') }}
        </button>
        <ShareButton />
      </div>
    </header>

    <TripMap
      ref="inlineMap"
      mode="map"
      :media="media"
      :route="routeLine"
      height="560px"
      class="mb-8"
      @open="openMapMedia"
      @open-day="openMapDay"
    >
      <!--
        The expand mark belongs on the map it acts on, not in the header. The
        slot stands after the map box and before the album, so it sits over
        Leaflet's panes and under the card. See docs/features/maps.md.
      -->
      <template #controls>
        <button
          type="button"
          class="btn-ghost map-float-control absolute right-4 top-4 z-[900] !px-3 !py-2"
          :title="t('map.expand')"
          :aria-label="t('map.expand')"
          @click="openFullscreen"
        >
          <svg
            class="h-5 w-5"
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            stroke-width="1.6"
            aria-hidden="true"
          >
            <path :d="MAP_EXPAND" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </button>
      </template>
    </TripMap>

    <Teleport to="body">
      <Transition name="map-full">
        <div v-if="expanded" class="fixed inset-0 z-[2100] flex flex-col bg-paper">
          <TripMap
            ref="fullMap"
            mode="map"
            :media="media"
            :route="routeLine"
            :initial-view="fullView"
            :initial-selection="fullSelection"
            height="100%"
            :framed="false"
            wheel-zoom
            class="min-h-0 flex-1"
            @open="openMapMedia"
            @open-day="openMapDay"
          />

          <!-- The same corners-in mark the day page's own full-screen button
               wears, so one icon means one thing across the site. -->
          <button
            type="button"
            class="btn-ghost map-float-control absolute right-4 top-4 z-[1000] !px-3 !py-2"
            :title="t('map.collapse')"
            :aria-label="t('map.collapse')"
            @click="closeFullscreen"
          >
            <svg
              class="h-5 w-5"
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              stroke-width="1.6"
              aria-hidden="true"
            >
              <path
                :d="MAP_COLLAPSE"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </button>
        </div>
      </Transition>
    </Teleport>

    <EmptyState v-if="!loading && media.length === 0" :message="t('map.noPoints')" class="mb-8" />

    <section>
      <h2 class="mb-2 text-center text-sm font-semibold text-ink-soft">
        {{ t('calendar.title') }}
      </h2>
      <!-- The calendar looks like the one on a day page and does something else
           entirely, so it says which. -->
      <p class="mx-auto mb-6 max-w-md text-center text-xs text-ink-faint">
        {{ from && !to ? t('map.pickEnd') : t('map.pickRange') }}
      </p>
      <TripCalendar
        :days="days.list"
        :range-start="from || null"
        :range-end="to || null"
        :range-start-label="t('map.rangeFrom')"
        :range-end-label="t('map.rangeTo')"
        @select="pickDate"
      />
    </section>

    <!-- Opened from a pin's album; the card says there is no tile to fly from,
         so the viewer plays its plain fade. See docs/features/maps.md. -->
    <MediaLightbox
      v-model:index="lightboxIndex"
      :items="media"
      :can-show-on-map="openOnMap"
      :page-covered="expanded"
      @close="onViewerClose"
      @show-on-map="showMediaOnMap"
    />
  </div>
</template>
