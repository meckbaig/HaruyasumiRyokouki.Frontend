import { ref, shallowRef } from 'vue'
import { useDaysStore } from '@/stores/days'

/**
 * Collects the media of a set of days for the map.
 *
 * There is no endpoint that returns coordinates for the whole trip, so the map
 * has to assemble them from `GET /v1/days/{date}` one day at a time. Requests
 * run a few at a time and results land incrementally, so pins appear while the
 * rest is still loading rather than after a long blank wait. Everything goes
 * through the days store, so a range that was opened once is free afterwards.
 */
const CONCURRENCY = 6

export function useTripMedia() {
  const days = useDaysStore()

  const media = shallowRef([])
  const loading = ref(false)
  const loaded = ref(0)
  const total = ref(0)

  let runId = 0

  /**
   * @param {string[]} dates ISO dates to pull, in the order they should appear.
   */
  async function load(dates) {
    const currentRun = (runId += 1)
    const queue = [...dates]

    media.value = []
    loaded.value = 0
    total.value = queue.length
    loading.value = queue.length > 0
    if (queue.length === 0) return

    const collected = new Map()

    async function worker() {
      for (;;) {
        const date = queue.shift()
        if (date === undefined) return
        // A newer range was requested; abandon this pass.
        if (currentRun !== runId) return

        try {
          const day = await days.loadDay(date)
          const located = (day?.media ?? [])
            .filter((item) => Number.isFinite(item?.latitude) && Number.isFinite(item?.longitude))
            .map((item) => ({ ...item, date }))
          if (located.length) collected.set(date, located)
        } catch {
          // A single unreachable day should not blank out the whole map.
        }

        if (currentRun !== runId) return
        loaded.value += 1
        // Re-sort by date so pins and the route stay chronological regardless
        // of the order the responses came back in.
        media.value = [...collected.keys()].sort().flatMap((key) => collected.get(key))
      }
    }

    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker))

    if (currentRun === runId) loading.value = false
  }

  return { media, loading, loaded, total, load }
}

/**
 * One representative point per day, chronologically — the shape the route line
 * is drawn from. Averaging the day's pins keeps a single stray photo from
 * dragging the line across the country.
 */
export function routeFromMedia(media) {
  const byDate = new Map()

  for (const item of media) {
    if (!byDate.has(item.date)) byDate.set(item.date, [])
    byDate.get(item.date).push(item)
  }

  return [...byDate.keys()]
    .sort()
    .map((date) => {
      const items = byDate.get(date)
      const lat = items.reduce((sum, item) => sum + item.latitude, 0) / items.length
      const lng = items.reduce((sum, item) => sum + item.longitude, 0) / items.length
      return [lat, lng]
    })
}
