import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { fetchTags } from '@/api/tags'
import { compareTags, tagMatches } from '@/services/tags'

/**
 * The whole tag dictionary, held in memory for as long as an editor is signed
 * in.
 *
 * Fetched once rather than searched over the wire. The dictionary is a few
 * hundred entries and a few dozen kilobytes, it changes rarely, and filtering it
 * on the client answers on the keystroke — no debounce, no request racing
 * another request back.
 *
 * The real reason is not speed, though. Half the work of filing a photograph is
 * remembering what you called this sort of thing the last time, and a list you
 * can see the whole of answers that. A search box that only responds to what you
 * already thought of does not.
 *
 * Editor-only: `GET /v1/tags` is behind the login, and a visitor never has a
 * dictionary. Anything shown to a visitor has to name its tags from what the
 * server already put in the response.
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
   * Writes a tag the server has just returned into the dictionary, in place if
   * it was already there. Creating and editing both answer with the saved model,
   * so the list stays true without asking for it again.
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

  /**
   * The dictionary is the one place a slug can be turned back into the numeric
   * id a save needs — nothing else on the client has both.
   */
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
