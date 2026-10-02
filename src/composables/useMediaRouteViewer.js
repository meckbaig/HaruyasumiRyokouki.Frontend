import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { readMediaLink, withMediaLink } from '@/composables/useMediaLink'
import { scrollToMedia } from '@/services/scrollToMedia'

/**
 * A page's full-screen viewer, driven by the `?i=` / `?o=1` pair. **The route is
 * the only writer of history**: opening pushes, a turn replaces, closing by hand
 * takes a step this session pushed back with `router.back()`, or rewrites an
 * entry the address brought. Back and Forward are ordinary route changes.
 *
 * The lightbox still needs a synchronous index for a held arrow, so `index` is a
 * mirror: the route sets it, and it writes the route only when the two disagree.
 * See docs/features/media-viewer.md and plans/media-open-url-driven.md.
 *
 * @param {object} options
 * @param {import('vue').Ref<Array>} options.items the files the viewer walks.
 * @param {() => boolean} [options.suppressScroll] holds the selection scroll off.
 * @returns {object} the lightbox binding and the open, turn and close actions.
 */
export function useMediaRouteViewer({ items, suppressScroll = () => false }) {
  const route = useRoute()
  const router = useRouter()

  const link = computed(() => readMediaLink(route.query))
  const selectedIds = computed(() => link.value.ids)
  const selectedId = computed(() => link.value.id)
  const isOpen = computed(() => link.value.open)

  const idAt = (i) => items.value?.[i]?.id ?? null
  const indexOf = (id) => (id == null ? -1 : (items.value ?? []).findIndex((m) => m.id === id))

  /** The route's own index, null while closed or until the file is in `items`. */
  const openIndex = computed(() => {
    if (!isOpen.value) return null
    const at = indexOf(selectedId.value)
    return at >= 0 ? at : null
  })

  /** The lightbox's synchronous index. Bound with `v-model:index`. */
  const index = ref(null)
  /** This session pushed the current pair, so a hand-close leaves the entry. */
  let pushed = false
  /**
   * True while the composable is taking back a step **it** pushed - a hand-close.
   * The page's `popstate` must not read that step as the reader's own Back, so the
   * note is not returned to. Read and cleared by `consumeHandClose`.
   */
  let handClosing = false

  /*
    `immediate`, because a cached page resolves the pair during `setup`, before
    this watcher would have heard anything: the viewer would never open on a
    Back-return even though the address named it. See docs/features/media-viewer.md.
  */
  watch(
    openIndex,
    (next) => {
      if (next !== index.value) index.value = next
    },
    { immediate: true },
  )

  /**
   * The mirror writes the route, but only when the two disagree - so a route that
   * set the index is not echoed straight back as a second navigation.
   */
  watch(index, (next) => {
    if (next === openIndex.value) return
    if (next == null) {
      // The route already dropped the pair - a Back, or a navigation away - so
      // there is nothing to write; a write here would cancel the step itself.
      if (!isOpen.value) {
        pushed = false
        return
      }
      close()
      return
    }
    if (isOpen.value) turn(idAt(next))
    else openAt(idAt(next))
  })

  /** Open a file full screen: a step of its own, so Back closes it. */
  function openAt(id) {
    if (id == null) return
    pushed = true
    handClosing = false
    return router.push({ path: route.path, query: withMediaLink(route.query, id, true), hash: route.hash })
  }

  /** A turn: the step is kept, its file replaced, so Back does not unravel a page. */
  function turn(id) {
    if (id == null || !isOpen.value || id === selectedId.value) return
    return router.replace({
      path: route.path,
      query: withMediaLink(route.query, id, true),
      hash: route.hash,
    })
  }

  /** Closing by hand. A pushed step is left; an entry the address brought is rewritten. */
  function close() {
    if (selectedId.value == null && !isOpen.value) return
    const leave = pushed
    pushed = false
    if (leave) {
      // Our own step, so its popstate must not be answered as the reader's Back.
      handClosing = true
      return router.back()
    }
    return router.replace({
      path: route.path,
      query: withMediaLink(route.query, null),
      hash: route.hash,
    })
  }

  /**
   * Answers whether the step now being popped was this composable's own
   * hand-close, then clears the mark. A page's `popstate` calls this before it
   * decides to scroll back to the text a reference was followed from.
   */
  function consumeHandClose() {
    const was = handClosing
    handClosing = false
    return was
  }

  /**
   * Close in place: drop the pair without leaving a step, for an action that stays
   * on the page - the viewer's "show on the map". A `back` here would restore the
   * previous entry's scroll position and fight the scroll to the map.
   * See docs/features/media-viewer.md.
   */
  function dismiss() {
    if (selectedId.value == null && !isOpen.value) return
    pushed = false
    return router.replace({
      path: route.path,
      query: withMediaLink(route.query, null),
      hash: route.hash,
    })
  }

  // Back, Forward or a plain navigation drop the pair: the step is no longer ours.
  watch(isOpen, (open) => {
    if (!open) pushed = false
  })

  /*
    A plain `?i=` always scrolls to the file, on arrival and on Back alike - this
    is the outline feature, so it is not guarded by a "same as last time" latch
    beyond clearing when the selection goes away.
  */
  watch(
    [() => selectedIds.value.join(','), () => indexOf(selectedId.value)],
    () => {
      if (!selectedIds.value.length) return
      if (isOpen.value || suppressScroll() || indexOf(selectedId.value) < 0) return
      scrollToMedia(selectedIds.value)
    },
    { immediate: true },
  )

  return {
    index,
    openIndex,
    openAt,
    turn,
    close,
    dismiss,
    consumeHandClose,
    isOpen,
    selectedIds,
    selectedId,
  }
}
