import { ref, shallowRef } from 'vue'
import { fetchMediaLocations } from '@/api/media'

/**
 * Loads the located media for a date range in one `GET /v1/media/locations`.
 * Items are `MediaFileLocationDto`. See docs/features/maps.md.
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

/** The route line: located media in the order the photographs were taken. */
export function routeFromMedia(media) {
  return [...media]
    .filter((item) => item?.created)
    .sort((a, b) => String(a.created).localeCompare(String(b.created)))
    .map((item) => [item.latitude, item.longitude])
}
