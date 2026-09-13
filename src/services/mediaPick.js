/**
 * One fleeting mode: an editor pressed the media button, so the next tile that
 * is clicked hands its id to the waiting field instead of opening the viewer.
 * See docs/features/rich-text-and-links.md.
 */
import { ref } from 'vue'

/** True while a field is waiting for a tile to be clicked. */
export const picking = ref(false)

let handler = null

export function startPick(onPick) {
  handler = onPick
  picking.value = true
}

export function cancelPick() {
  handler = null
  picking.value = false
}

/**
 * Hands the id over and leaves the mode.
 * @returns {boolean} true when the press belonged to the pick, so the caller
 *   must not open the viewer.
 */
export function resolvePick(id) {
  if (!picking.value || id == null) return false
  const take = handler
  cancelPick()
  take?.(id)
  return true
}
