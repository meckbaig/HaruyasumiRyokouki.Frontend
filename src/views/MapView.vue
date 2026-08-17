<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import TripMap from '@/components/map/TripMap.vue'
import TripCalendar from '@/components/calendar/TripCalendar.vue'
import ShareButton from '@/components/common/ShareButton.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import { useDaysStore } from '@/stores/days'
import { useUiStore } from '@/stores/ui'
import { useTripMedia, routeFromMedia } from '@/composables/useTripMedia'

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

/*
  Fullscreen.

  A second map rather than this one moved into an overlay: a live Leaflet
  instance carried through a Teleport comes out broken — blank tiles, and dead
  once it is put back — which is why the location picker in the editor builds two
  as well. Both are driven from the same media, so they show the same thing and
  neither knows about the other.
*/
const expanded = ref(false)

function onKeydown(event) {
  if (event.key === 'Escape' && expanded.value) expanded.value = false
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
      <div>
        <h1 class="text-xl font-semibold tracking-tight text-ink">{{ t('map.title') }}</h1>
        <p class="mt-1 text-sm text-ink-faint">
          <span v-if="loading">{{ t('common.loading') }}</span>
          <span v-else>{{ t('map.pointsCount', { count: media.length }, media.length) }}</span>
        </p>
      </div>

      <div class="flex items-center gap-2">
        <button v-if="from || to" type="button" class="btn-ghost" @click="reset">
          {{ t('map.reset') }}
        </button>
        <button type="button" class="btn-ghost" @click="expanded = true">
          {{ t('map.expand') }}
        </button>
        <ShareButton />
      </div>
    </header>

    <TripMap :media="media" :route="routeLine" height="560px" class="mb-8" />

    <Teleport to="body">
      <Transition name="map-full">
        <div v-if="expanded" class="fixed inset-0 z-[2100] flex flex-col bg-paper">
          <TripMap
            :media="media"
            :route="routeLine"
            height="100%"
            :framed="false"
            wheel-zoom
            class="min-h-0 flex-1"
          />

          <button
            type="button"
            class="btn-ghost absolute right-4 top-4 z-[1000] bg-paper-raised shadow-sm"
            @click="expanded = false"
          >
            {{ t('map.collapse') }}
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
  </div>
</template>
