<script setup>
import { ref, computed, watch, onMounted } from 'vue'
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

const { media, loading, loaded, total, load } = useTripMedia()

// Range lives in the URL, so a link shares the exact stretch being looked at.
const from = computed(() => String(route.query.from ?? ''))
const to = computed(() => String(route.query.to ?? ''))

/** Dates inside the range, or the whole trip when no range is set. */
const datesInRange = computed(() => {
  const all = days.orderedDates
  if (!from.value && !to.value) return all
  const start = from.value || all[0]
  const end = to.value || all[all.length - 1]
  return all.filter((date) => date >= start && date <= end)
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

async function refresh() {
  await days.loadList()
  load(datesInRange.value)
}

onMounted(refresh)
watch([from, to], () => load(datesInRange.value))
watch(() => ui.locale, refresh)
</script>

<template>
  <div class="mx-auto max-w-6xl px-4 py-8">
    <header class="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 class="text-xl font-semibold tracking-tight text-ink">{{ t('map.title') }}</h1>
        <p class="mt-1 text-sm text-ink-faint">
          <span v-if="loading">{{ t('common.loading') }} {{ loaded }}/{{ total }}</span>
          <span v-else>{{ t('map.pointsCount', { count: media.length }, media.length) }}</span>
        </p>
      </div>

      <div class="flex items-center gap-2">
        <button v-if="from || to" type="button" class="btn-ghost" @click="reset">
          {{ t('map.reset') }}
        </button>
        <ShareButton />
      </div>
    </header>

    <TripMap :media="media" :route="routeLine" height="560px" class="mb-8" />

    <EmptyState v-if="!loading && media.length === 0" :message="t('map.noPoints')" class="mb-8" />

    <section>
      <h2 class="mb-6 text-center text-sm font-semibold text-ink-soft">
        {{ t('calendar.title') }}
      </h2>
      <TripCalendar
        :days="days.list"
        :range-start="from || null"
        :range-end="to || null"
        @select="pickDate"
      />
    </section>
  </div>
</template>
