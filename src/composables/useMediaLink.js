import { computed, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'

/**
 * Pointing a link at files inside a page: `i=<media ids>` singles them out, `o=1`
 * opens the first full screen and is only ever written alongside `i`. A link that
 * cannot be resolved is dropped from the address.
 * See docs/features/sharing-and-links.md.
 */
export const MEDIA_PARAM = 'i'
export const OPEN_PARAM = 'o'

/** Reads the ids off a route's query. Commas carry a whole reference. */
export function readMediaLink(query) {
  const raw = query?.[MEDIA_PARAM]
  const ids = String(Array.isArray(raw) ? raw[0] : (raw ?? ''))
    .split(',')
    .map((part) => Number(part.trim()))
    .filter((id) => Number.isInteger(id))
  // Ids are integers; anything else is not a link this page can honour.
  return { ids, id: ids.length ? ids[0] : null, open: String(query?.[OPEN_PARAM] ?? '') === '1' }
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

/**
 * The same query with the ids set, or removed when there are none. Accepts one
 * id or a whole reference; they become one comma-separated parameter, so the
 * address names **every** file the reader singled out.
 */
export function withMediaLink(query, ids, open = false) {
  const next = { ...query }
  delete next[MEDIA_PARAM]
  delete next[OPEN_PARAM]

  const list = (ids == null ? [] : Array.isArray(ids) ? ids : [ids]).filter((id) =>
    Number.isInteger(id),
  )
  if (!list.length) return next

  next[MEDIA_PARAM] = list.join(',')
  if (open) next[OPEN_PARAM] = '1'
  return next
}

function sameIds(link, query) {
  return String(query?.[MEDIA_PARAM] ?? '') === String(link[MEDIA_PARAM] ?? '')
}

/**
 * Reads and writes the pair for the current route. Writes **replace**, never
 * push - except `push`, used when following the text into the pile, which is a
 * place of its own so the browser's Back can return to the note.
 * See docs/features/sharing-and-links.md.
 *
 * @param {{ suspended?: () => boolean }} [options] holds dismissal off while the
 *   viewer is open - the outline is behind it.
 */
export function useMediaLink({ suspended = () => false } = {}) {
  const route = useRoute()
  const router = useRouter()

  const link = computed(() => readMediaLink(route.query))

  function write(ids, open = false) {
    const query = withMediaLink(route.query, ids, open)
    // Router treats navigating to the same place as an error worth reporting;
    // an unchanged query happens routinely here, so it is simply not a write.
    if (sameIds(query, route.query) && String(query[OPEN_PARAM] ?? '') === String(route.query[OPEN_PARAM] ?? '')) {
      return
    }
    return router.replace({ path: route.path, query, hash: route.hash })
  }

  /**
   * Adds an entry rather than replacing one. Only for following the text: the
   * reader came from a note somewhere above, and paging would otherwise bury the
   * page under a history entry per picture.
   */
  function push(ids, open = true) {
    const query = withMediaLink(route.query, ids, open)
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
