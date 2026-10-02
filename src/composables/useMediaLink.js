import { computed, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { noteHash } from '@/services/textAnchor'
import { MEDIA_ID_ATTR } from '@/services/mediaTiles'

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
 * Reads and writes the pair for the current route. The accent always **replaces**;
 * only a step of its own, `followNote`, `departNote` and `depart`, pushes, so
 * Back returns to the line the reader left. See docs/features/sharing-and-links.md.
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
   * Adds an entry for a departure that changes **nothing** in the address - the
   * map follow, which remembers a way back without singling files out. `force`
   * is what makes vue-router push the location rather than skip it as a
   * duplicate; that skip is the only reason a plain push cannot do this.
   */
  function depart() {
    return router.push({ path: route.path, query: route.query, hash: route.hash, force: true })
  }

  /**
   * The line goes on the entry the reader leaves, which carries **no accent**, and
   * the accent goes on a step pushed above it. So Back lands on an entry that names
   * no file: it drops the accent from the address and scrolls to the line.
   * See docs/features/rich-text-and-links.md.
   */
  function stepForNote(ids, anchor) {
    const hash = noteHash(anchor)
    const at = { path: route.path, query: withMediaLink(route.query, null), hash }
    const to =
      ids == null ? at : { path: route.path, query: withMediaLink(route.query, ids, false), hash }
    return router.replace(at).then(() => router.push({ ...to, force: true }))
  }

  /** A follow that singles files out and leaves the line behind it. */
  function followNote(ids, anchor) {
    return stepForNote(ids, anchor)
  }

  /** A follow that singles nothing out and only marks the line, for the map. */
  function departNote(anchor) {
    return stepForNote(null, anchor)
  }

  /** Spends the way back: drops the note hash from the entry the reader is on. */
  function clearNote() {
    if (!route.hash) return
    return router.replace({ path: route.path, query: route.query, hash: '' })
  }

  function clear() {
    write(null)
  }

  /**
   * How far a press may travel and still count as a tap on the spot. A swipe
   * scrolls the page or the filmstrip, and must leave the outline standing.
   */
  const TAP_SLOP = 10
  let press = null

  function dismiss(event) {
    if (link.value.id == null || suspended()) return
    /*
      A press on a tile is about a file, not "elsewhere": the tile is about to
      open the viewer, and clearing the accent here would leave the entry under
      the viewer identical to the note, so Back could not tell them apart.
    */
    if (event.target?.closest?.(`a[href], [${MEDIA_ID_ATTR}]`)) return
    clear()
  }

  /**
   * A press without travel is a tap on the spot, which puts the outline away; a
   * swipe is not. Answering on `pointerup` rather than the click keeps the tail
   * of a gesture begun on the previous page from reading as a press here.
   * See docs/features/sharing-and-links.md.
   */
  function onPointerDown(event) {
    press = { x: event.clientX, y: event.clientY }
  }

  function onPointerUp(event) {
    const start = press
    press = null
    if (!start) return
    if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > TAP_SLOP) return
    dismiss(event)
  }

  function onPointerCancel() {
    press = null
  }

  onMounted(() => {
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('pointerup', onPointerUp)
    document.addEventListener('pointercancel', onPointerCancel)
  })
  onBeforeUnmount(() => {
    document.removeEventListener('pointerdown', onPointerDown)
    document.removeEventListener('pointerup', onPointerUp)
    document.removeEventListener('pointercancel', onPointerCancel)
  })

  return { link, write, depart, followNote, departNote, clearNote, clear }
}
