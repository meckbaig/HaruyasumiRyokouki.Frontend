/**
 * Finding the element(s) on the page that stand for a media file.
 *
 * Tiles stamp their id with `data-media-id`. A file can be rendered more than
 * once at a time, so callers ask for all of them or for a visible one.
 * See docs/features/media-grid-and-selection.md.
 */

/** The attribute every tile stamps its id on. Bind it; never spell it out. */
export const MEDIA_ID_ATTR = 'data-media-id'

function selectorFor(id) {
  return `[${MEDIA_ID_ATTR}="${CSS.escape(String(id))}"]`
}

/** Box of an element, or null when it has no size. */
export function boxOf(element) {
  const rect = element?.getBoundingClientRect?.()
  if (!rect?.width || !rect?.height) return null
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
}

export function isOnScreen(box) {
  return (
    box.top + box.height > 0 &&
    box.top < window.innerHeight &&
    box.left + box.width > 0 &&
    box.left < window.innerWidth
  )
}

/** Every element standing for this file, in document order. */
export function tilesFor(id) {
  if (id == null) return []
  return [...document.querySelectorAll(selectorFor(id))]
}

/** The first element for this file, or the first visible one when asked. */
export function tileFor(id, { visible = false } = {}) {
  if (!visible) return document.querySelector(selectorFor(id)) ?? null
  return tilesFor(id).find((tile) => {
    const box = boxOf(tile)
    return box && isOnScreen(box)
  }) ?? null
}
