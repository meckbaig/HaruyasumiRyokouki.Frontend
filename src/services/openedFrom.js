/**
 * Which thumbnail the viewer was opened from. Handed over rather than searched
 * for by id, because a file is often on the page more than once.
 * See docs/features/media-viewer.md.
 */
let pending = null

/** Call from the handler that is about to open the viewer. */
export function markOpenedFrom(element) {
  pending = element instanceof Element ? element : null
}

/** Taken once, by the viewer, as it opens. Null when nobody said. */
export function takeOpenedFrom() {
  const element = pending
  pending = null
  return element?.isConnected ? element : null
}
