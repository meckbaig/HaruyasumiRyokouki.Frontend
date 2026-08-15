import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { search as searchApi } from '@/api/search'
import { splitSearchResults } from '@/services/searchResults'
import { tagLabel } from '@/services/tags'

const EMPTY = { tokens: [], mediaDays: [], noteDays: [] }

/**
 * The caption of the tag a set of results was fetched by, read out of the
 * results themselves.
 *
 * The dictionary is behind the login and a visitor following a shared tag link
 * has none — but every file that came back carries the tag that fetched it,
 * already in the reader's language. So the name is in the answer by definition,
 * and only a tag that matched nothing leaves it blank.
 */
function captionFromResults(split, slug, locale) {
  for (const group of split.mediaDays) {
    for (const media of group.matched) {
      const found = media.tags?.find((tag) => tag.slug === slug)
      if (found) return tagLabel(found, locale)
    }
  }
  return ''
}

/**
 * Search state and a small result cache.
 *
 * The cache matters because shared links are opened repeatedly and going back
 * from a day to the results should not refetch. It is keyed by locale as well
 * as by the query — the same words return different notes per language — and by
 * which of the two searches was asked for, since `text=ramen` and the tag
 * `ramen` are different questions with different answers.
 */
export const useSearchStore = defineStore('search', () => {
  const query = ref('')
  const tagSlug = ref('')
  /** Caption of `tagSlug`, for the heading and the search bar's chip. */
  const tagName = ref('')
  const loading = ref(false)
  const error = ref(null)
  const results = ref({ ...EMPTY })

  const cache = new Map()
  /** Captions already learned, so going back to a cached tag still names it. */
  const captions = new Map()
  let activeController = null

  const hasResults = computed(
    () => results.value.mediaDays.length > 0 || results.value.noteDays.length > 0,
  )

  /**
   * @param {{text?: string, tag?: string}} request Exactly one of the two is
   *   honoured; the tag slug wins if both are somehow present.
   */
  async function run({ text, tag: slug } = {}, locale) {
    const trimmed = String(text ?? '').trim()
    const tag = String(slug ?? '').trim()

    query.value = trimmed
    tagSlug.value = tag
    tagName.value = tag ? (captions.get(`${locale}::${tag}`) ?? '') : ''

    if (!tag && !trimmed) {
      results.value = { ...EMPTY }
      error.value = null
      return
    }

    const key = tag ? `${locale}::#${tag}` : `${locale}::${trimmed}`
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
      const items = await searchApi({ text: trimmed, tag }, controller.signal)
      // A tag search highlights nothing — the words being looked for are the
      // ones nobody typed. Passing no query is what leaves the tokens empty.
      const split = splitSearchResults(items, tag ? '' : trimmed)
      cache.set(key, split)
      results.value = split
      if (tag) {
        const caption = captionFromResults(split, tag, locale)
        if (caption) {
          captions.set(`${locale}::${tag}`, caption)
          tagName.value = caption
        }
      }
    } catch (caught) {
      if (caught.name === 'AbortError') return
      error.value = caught
      results.value = { ...EMPTY }
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

  /** Names a tag before its results are in — used when a chip is drawn first. */
  function rememberTag(slug, caption, locale) {
    if (!slug || !caption) return
    captions.set(`${locale}::${slug}`, caption)
    if (tagSlug.value === slug) tagName.value = caption
  }

  return {
    query,
    tagSlug,
    tagName,
    loading,
    error,
    results,
    hasResults,
    run,
    rememberTag,
    invalidate,
  }
})
