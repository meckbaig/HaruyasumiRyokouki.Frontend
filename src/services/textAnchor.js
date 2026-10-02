/**
 * The line a media reference was followed from, kept in the address as
 * `#note=<mediaId>:<index>`, so Back and Forward restore it and nothing lives in
 * a module ref. See docs/features/rich-text-and-links.md.
 */
import { nextTick } from 'vue'

const FLASH_MS = 1600
const PREFIX = 'note='

/** The hash an anchor is written as, or '' when there is none. */
export function noteHash(anchor) {
  if (!anchor || anchor.mediaId == null) return ''
  return `#${PREFIX}${anchor.mediaId}:${anchor.index ?? 0}`
}

/** The anchor a hash names, or null. Ids are integers, so they are tested as such. */
export function readNoteAnchor(hash) {
  const raw = String(hash ?? '').replace(/^#/, '')
  if (!raw.startsWith(PREFIX)) return null
  const [id, occurrence] = raw.slice(PREFIX.length).split(':')
  const mediaId = Number(id)
  if (!Number.isInteger(mediaId)) return null
  const index = Number(occurrence)
  return { mediaId, index: Number.isInteger(index) ? index : 0 }
}

/** Selector for the element an anchor names. Shared with the page that reads it. */
export function anchorSelector(anchor) {
  return `[data-text-anchor="${CSS.escape(`${anchor.mediaId}:${anchor.index}`)}"]`
}

/** Scrolls to the marked element and lights it. The address owns the anchor. */
export async function scrollToTextAnchor(anchor) {
  if (!anchor) return
  await nextTick()
  const element = document.querySelector(anchorSelector(anchor))
  if (!element) return
  element.scrollIntoView({ block: 'center' })
  element.classList.add('text-anchor-flash')
  window.setTimeout(() => element.classList.remove('text-anchor-flash'), FLASH_MS)
}
