import { ref, shallowRef } from 'vue'
import { fetchMediaLocations } from '@/api/media'

/**
 * Loads the located media for a date range in a single request.
 *
 * Backed by `GET /v1/media/locations`, which returns only media that have
 * coordinates — no more walking the trip day by day. Each item is a
 * MediaFileLocationDto: `{ id, created, latitude, longitude, fileName, title }`.
 */
export function useTripMedia() {
  const media = shallowRef([])
  const loading = ref(false)

  let activeController = null

  /**
   * @param {string} from Inclusive ISO start date.
   * @param {string} to   Inclusive ISO end date.
   */
  async function load(from, to) {
    if (!from || !to) {
      media.value = []
      return
    }

    // A quick range change (dragging the calendar) can outrun the network.
    activeController?.abort()
    const controller = new AbortController()
    activeController = controller

    loading.value = true
    try {
      const items = await fetchMediaLocations(from, to, controller.signal)
      media.value = items.filter(
        (item) => Number.isFinite(item?.latitude) && Number.isFinite(item?.longitude),
      )
    } catch (error) {
      if (error.name === 'AbortError') return
      media.value = []
    } finally {
      if (activeController === controller) {
        activeController = null
        loading.value = false
      }
    }
  }

  return { media, loading, load }
}

/**
 * The route line: every located media in chronological order by capture time.
 * Points are connected in the order the photos were taken.
 */
export function routeFromMedia(media) {
  return [...media]
    .filter((item) => item?.created)
    .sort((a, b) => String(a.created).localeCompare(String(b.created)))
    .map((item) => [item.latitude, item.longitude])
}
