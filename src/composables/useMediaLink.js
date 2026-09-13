import { computed, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'

/**
 * Pointing a link at one file inside a page: `i=<media id>` singles it out, `o=1`
 * opens it full screen and is only ever written alongside `i`. A link that
 * cannot be resolved is dropped from the address.
 * See docs/features/sharing-and-links.md.
 */
export const MEDIA_PARAM = 'i'
export const OPEN_PARAM = 'o'

/** Reads the pair off a route's query. */
export function readMediaLink(query) {
  const raw = query?.[MEDIA_PARAM]
  const id = Number(Array.isArray(raw) ? raw[0] : raw)
  // Ids are integers; anything else is not a link this page can honour.
  if (!Number.isInteger(id)) return { id: null, open: false }
  return { id, open: String(query?.[OPEN_PARAM] ?? '') === '1' }
}

/**
 * What page a route is, ignoring which file it points at. **Anything asking "did
 * the reader move?" compares this, never `route.fullPath`** - writing `i` would
 * otherwise read as a navigation. See docs/features/sharing-and-links.md.
 */
export function pageIdentity(route) {
  const query = withMediaLink(route.query, null)
  const keys = Object.keys(query).sort()
  return [route.path, ...keys.map((key) => `${key}=${query[key]}`)].join('&')
}

/** The same query with the pair set, or removed when `id` is null. */
export function withMediaLink(query, id, open = false) {
  const next = { ...query }
  delete next[MEDIA_PARAM]
  delete next[OPEN_PARAM]
  if (id == null) return next

  next[MEDIA_PARAM] = String(id)
  if (open) next[OPEN_PARAM] = '1'
  return next
}

/**
 * Reads and writes the pair for the current route. Writes **replace**, never
 * push - except `push`, used when opening a file from a media reference, which
 * is a place of its own so the browser's Back can return to the text.
 * See docs/features/sharing-and-links.md.
 *
 * @param {{ suspended?: () => boolean }} [options] holds dismissal off while the
 *   viewer is open - the outline is behind it.
 */
export function useMediaLink({ suspended = () => false } = {}) {
  const route = useRoute()
  const router = useRouter()

  const link = computed(() => readMediaLink(route.query))

  function write(id, open = false) {
    const query = withMediaLink(route.query, id, open)
    // Router treats navigating to the same place as an error worth reporting;
    // an unchanged query happens routinely here, so it is simply not a write.
    if (query[MEDIA_PARAM] === route.query[MEDIA_PARAM] && query[OPEN_PARAM] === route.query[OPEN_PARAM]) {
      return
    }
    return router.replace({ path: route.path, query, hash: route.hash })
  }

  /**
   * Adds an entry rather than replacing one. Only for opening a file that was
   * followed from the text: paging would otherwise bury the page under a history
   * entry per picture.
   */
  function push(id, open = true) {
    const query = withMediaLink(route.query, id, open)
    return router.push({ path: route.path, query, hash: route.hash })
  }

  function clear() {
    write(null)
  }

  /**
   * Listens for the press, not the click: a click is the tail of a gesture that
   * may have begun on the previous page. See docs/features/sharing-and-links.md.
   */
  function dismiss(event) {
    if (link.value.id == null || suspended()) return
    if (event.target?.closest?.('a[href]')) return
    clear()
  }

  onMounted(() => document.addEventListener('pointerdown', dismiss))
  onBeforeUnmount(() => document.removeEventListener('pointerdown', dismiss))

  return { link, write, push, clear }
}
