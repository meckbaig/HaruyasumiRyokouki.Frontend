import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { fetchTags } from '@/api/tags'
import { compareTags, tagMatches } from '@/services/tags'

/**
 * The whole tag dictionary, fetched once and held for the editor session.
 * **Editor-only** - a visitor has none, and must name tags from the response it
 * already has. See docs/features/tags.md.
 */
export const useTagsStore = defineStore('tags', () => {
  const items = ref([])
  const loaded = ref(false)
  const loading = ref(false)
  const error = ref(null)

  /** One request even if five components ask at once while it is in flight. */
  let inFlight = null

  const byId = computed(() => new Map(items.value.map((tag) => [tag.id, tag])))
  const bySlug = computed(() => new Map(items.value.map((tag) => [tag.slug, tag])))

  async function load(force = false) {
    if (loaded.value && !force) return items.value
    if (inFlight) return inFlight

    loading.value = true
    error.value = null
    inFlight = (async () => {
      try {
        items.value = await fetchTags()
        loaded.value = true
        return items.value
      } catch (caught) {
        error.value = caught
        throw caught
      } finally {
        loading.value = false
        inFlight = null
      }
    })()

    return inFlight
  }

  /**
   * Writes a server-returned tag in, in place if it was there. Create and edit
   * both answer with the saved model, so the list stays true without refetching.
   */
  function upsert(tag) {
    if (!tag?.id) return
    const index = items.value.findIndex((entry) => entry.id === tag.id)
    if (index >= 0) items.value.splice(index, 1, tag)
    else items.value.push(tag)
  }

  function get(id) {
    return byId.value.get(id) ?? null
  }

  /** The only place a slug becomes an id - nothing else on the client has both. */
  function getBySlug(slug) {
    return bySlug.value.get(slug) ?? null
  }

  /** Dictionary filtered by what has been typed, commonest first. */
  function search(text, locale, { exclude = [] } = {}) {
    const skip = new Set(exclude)
    return items.value
      .filter((tag) => !skip.has(tag.slug) && tagMatches(tag, text))
      .sort((a, b) => compareTags(a, b, locale))
  }

  /** Signing out has to take the dictionary with it; the next editor may differ. */
  function clear() {
    items.value = []
    loaded.value = false
    error.value = null
  }

  return { items, loaded, loading, error, byId, bySlug, load, upsert, get, getBySlug, search, clear }
})
