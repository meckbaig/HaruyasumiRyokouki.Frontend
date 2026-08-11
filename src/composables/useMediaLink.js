import { computed, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'

/**
 * Pointing a link at one file inside a page.
 *
 * A day and a search result are both lists, and a link to one of them says
 * nothing about which picture was being looked at. Two query parameters do:
 *
 *   i=<media id>  the file to single out, outlined in the list
 *   o=1           and it should be open full screen straight away
 *
 * `o` means nothing on its own — there has to be a file for it to open — so it
 * is only ever written alongside `i`.
 *
 * The page resolves `i` against what it actually holds, because a link can be
 * stale or simply wrong: a file may have been moved to another day, or the
 * search it was shared from may no longer match it. Whatever cannot be resolved
 * is dropped from the address bar and the page opens as if it had never been
 * asked for.
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
 * What page a route is, ignoring which file it points at.
 *
 * Writing `i` changes the address, and anything watching the address for a page
 * change would read that as having been taken somewhere else — which is how
 * opening a file came to close the viewer the same instant. This is the address
 * with the pair taken out and the rest put in a fixed order, so it changes when
 * the reader is actually moved and not when a picture is named.
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
 * Reads and writes the pair for the current route.
 *
 * Writes replace rather than push: paging through a day's files would otherwise
 * bury the page the visitor arrived on under one history entry per picture, and
 * the back button would walk them out one at a time.
 *
 * The outline is also dismissed by any click that is not about it. It has done
 * its job the moment the reader has found the picture, and one that stays put
 * turns into something to be got rid of. Clicks on links are left alone: one is
 * about to take the page somewhere, and replacing the address underneath a
 * navigation cancels it.
 *
 * @param {{ suspended?: () => boolean }} [options] `suspended` holds the
 *   dismissal off while the viewer is open — the outline is behind it, and the
 *   click that opened it must not take it away.
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
    router.replace({ path: route.path, query, hash: route.hash })
  }

  function clear() {
    write(null)
  }

  /*
    Dismissal listens for the press, not the click.

    A click is the tail of a gesture rather than an event in its own right: it is
    dispatched once a press that began some time earlier is released, and a
    navigation can start in between. So a page arriving by way of a click — the
    map's "open this day" button is one — can be handed the end of a gesture that
    was never aimed at it, and read it as the reader waving away an outline they
    have not had time to see.

    A press cannot be inherited that way. It is dispatched the moment a finger or
    a button goes down, which is always on the page already in front of the
    reader. It also answers sooner, which is what a dismissal wants to be.
  */
  function dismiss(event) {
    if (link.value.id == null || suspended()) return
    if (event.target?.closest?.('a[href]')) return
    clear()
  }

  onMounted(() => document.addEventListener('pointerdown', dismiss))
  onBeforeUnmount(() => document.removeEventListener('pointerdown', dismiss))

  return { link, write, clear }
}
