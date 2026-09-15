/**
 * Which thumbnail the viewer was opened from. Handed over rather than searched
 * for by id, because a file is often on the page more than once.
 * See docs/features/media-viewer.md.
 */
let pending = null
/** True when the opener said there is no tile to fly from - none is searched. */
let noSource = false

/** Call from the handler that is about to open the viewer. */
export function markOpenedFrom(element) {
  pending = element instanceof Element ? element : null
  noSource = false
}

/**
 * Opening with no tile to fly from: the viewer must not look for one and plays
 * its plain fade instead. For an opener whose picture is a preview, not a tile.
 * See docs/features/media-viewer.md.
 */
export function markOpenedWithoutSource() {
  pending = null
  noSource = true
}

/** Returned by `takeOpenedFrom` when the opener said there is no source. */
export const NO_SOURCE = Symbol('no source')

/** Taken once, by the viewer, as it opens. Null when nobody said. */
export function takeOpenedFrom() {
  const element = pending
  const none = noSource
  pending = null
  noSource = false
  if (none) return NO_SOURCE
  return element?.isConnected ? element : null
}
