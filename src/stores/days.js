import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { fetchDays, fetchDay } from '@/api/days'

/**
 * Cache for the day list and for individual days.
 *
 * The trip is roughly ninety days, so the list is fetched once and kept. Day
 * details are cached per date because the search page pulls them again when the
 * visitor expands "show the rest of this day".
 *
 * Caches are keyed only by date, so anything that changes the language must call
 * `invalidate()` — the stored notes and titles are locale-specific.
 */
export const useDaysStore = defineStore('days', () => {
  const list = ref([])
  const listLoaded = ref(false)
  const listLoading = ref(false)
  const listError = ref(null)

  const details = ref(new Map())
  const detailErrors = ref(new Map())

  /** Dates that actually exist in the timeline, ascending. */
  const orderedDates = computed(() => list.value.map((day) => day.date).sort())

  const byDate = computed(() => {
    const index = new Map()
    for (const day of list.value) index.set(day.date, day)
    return index
  })

  async function loadList(force = false) {
    if (listLoading.value) return
    if (listLoaded.value && !force) return

    listLoading.value = true
    listError.value = null
    try {
      list.value = await fetchDays()
      listLoaded.value = true
    } catch (error) {
      listError.value = error
    } finally {
      listLoading.value = false
    }
  }

  /**
   * Loads one day, reusing the cache unless `force` is set.
   * Errors are recorded per date and rethrown so callers can react.
   */
  async function loadDay(date, force = false) {
    if (!force && details.value.has(date)) return details.value.get(date)

    try {
      const day = await fetchDay(date)
      details.value.set(date, day)
      detailErrors.value.delete(date)
      // Map mutations are not reactive by themselves; swap the reference.
      details.value = new Map(details.value)
      return day
    } catch (error) {
      detailErrors.value.set(date, error)
      detailErrors.value = new Map(detailErrors.value)
      throw error
    }
  }

  function getDay(date) {
    return details.value.get(date) ?? null
  }

  /** Neighbouring dates that exist in the timeline, for day-to-day navigation. */
  function neighbours(date) {
    const dates = orderedDates.value
    const index = dates.indexOf(date)
    if (index === -1) return { prev: null, next: null }
    return {
      prev: index > 0 ? dates[index - 1] : null,
      next: index < dates.length - 1 ? dates[index + 1] : null,
    }
  }

  /** Drops every cached response. Used when the content language changes. */
  function invalidate() {
    details.value = new Map()
    detailErrors.value = new Map()
    listLoaded.value = false
  }

  return {
    list,
    listLoaded,
    listLoading,
    listError,
    details,
    detailErrors,
    orderedDates,
    byDate,
    loadList,
    loadDay,
    getDay,
    neighbours,
    invalidate,
  }
})
