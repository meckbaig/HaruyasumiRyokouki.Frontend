/**
 * Where in a text the reader followed a media reference from, so the viewer can
 * offer a way back and the marked element can be lit again on arrival.
 * See docs/features/rich-text-and-links.md.
 */
import { ref, nextTick } from 'vue'

const FLASH_MS = 1600

/** `{ mediaId, index }` - index is the occurrence, since a file may repeat. */
const anchor = ref(null)

export function useTextAnchor() {
  return anchor
}

/**
 * The one place the anchor is kept. Not `history.state`: vue-router rewrites
 * that on every navigation, so the answer would come and go on its own.
 */
export function setTextAnchor(value) {
  anchor.value = value ?? null
}

export function clearTextAnchor() {
  anchor.value = null
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

