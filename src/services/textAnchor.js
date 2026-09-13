/**
 * Where in a text the reader followed a media reference from, so the viewer can
 * offer a way back and the marked element can be lit again on arrival.
 * See docs/features/rich-text-and-links.md.
 */
import { ref, nextTick } from 'vue'

const ANCHOR_KEY = '__haruTextAnchor'
const FLASH_MS = 1600

/** `{ mediaId, index }` - index is the occurrence, since a file may repeat. */
const anchor = ref(null)

export function useTextAnchor() {
  return anchor
}

/**
 * Mirrored into `history.state` so the browser's own Back can see it. The module
 * ref stays the source of truth: vue-router rewrites that state on every
 * navigation, which would drop the anchor while the viewer is still open.
 */
export function setTextAnchor(value) {
  anchor.value = value ?? null
  writeHistory(anchor.value)
}

export function clearTextAnchor() {
  if (!anchor.value) return
  anchor.value = null
  writeHistory(null)
}

/**
 * Re-writes the anchor onto the entry the browser is on now. Needed after a
 * push: the anchor was set while the previous entry was current.
 */
export function mirrorTextAnchor() {
  if (anchor.value) writeHistory(anchor.value)
}

/** Selector for the element an anchor names. Shared with the page that sets it. */
export function anchorSelector(value) {
  return `[data-text-anchor="${CSS.escape(`${value.mediaId}:${value.index}`)}"]`
}

/** Scrolls back to the marked element, lights it, then drops the anchor. */
export async function returnToTextAnchor() {
  const current = anchor.value
  if (!current) return

  await nextTick()
  const element = document.querySelector(anchorSelector(current))
  if (element) {
    element.scrollIntoView({ block: 'center' })
    element.classList.add('text-anchor-flash')
    window.setTimeout(() => element.classList.remove('text-anchor-flash'), FLASH_MS)
  }
  clearTextAnchor()
}

function writeHistory(value) {
  try {
    history.replaceState({ ...(history.state ?? {}), [ANCHOR_KEY]: value }, '')
  } catch {
    // The mirror is a nicety; the module ref already carries the anchor.
  }
}
