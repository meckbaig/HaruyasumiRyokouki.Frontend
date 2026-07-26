import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { search as searchApi } from '@/api/search'
import { splitSearchResults } from '@/services/searchResults'

/**
 * Search state and a small result cache.
 *
 * The cache matters because shared links are opened repeatedly and going back
 * from a day to the results should not refetch. It is keyed by locale as well
 * as query text — the same words return different notes per language.
 */
export const useSearchStore = defineStore('search', () => {
  const query = ref('')
  const loading = ref(false)
  const error = ref(null)
  const results = ref({ tokens: [], mediaDays: [], noteDays: [] })

  const cache = new Map()
  let activeController = null

  const hasResults = computed(
    () => results.value.mediaDays.length > 0 || results.value.noteDays.length > 0,
  )

  async function run(text, locale) {
    const trimmed = String(text ?? '').trim()
    query.value = trimmed

    if (!trimmed) {
      results.value = { tokens: [], mediaDays: [], noteDays: [] }
      error.value = null
      return
    }

    const key = `${locale}::${trimmed}`
    if (cache.has(key)) {
      results.value = cache.get(key)
      error.value = null
      return
    }

    // A visitor typing quickly can outrun the network; drop the stale request.
    activeController?.abort()
    const controller = new AbortController()
    activeController = controller

    loading.value = true
    error.value = null
    try {
      const items = await searchApi(trimmed, controller.signal)
      const split = splitSearchResults(items, trimmed)
      cache.set(key, split)
      results.value = split
    } catch (caught) {
      if (caught.name === 'AbortError') return
      error.value = caught
      results.value = { tokens: [], mediaDays: [], noteDays: [] }
    } finally {
      if (activeController === controller) {
        activeController = null
        loading.value = false
      }
    }
  }

  function invalidate() {
    cache.clear()
  }

  return { query, loading, error, results, hasResults, run, invalidate }
})
