/**
 * How many map markers a device is allowed at once. A fixed figure per device
 * class, read once when a map mounts: a background benchmark would spend the very
 * resource it is guarding and would answer differently on a busy machine.
 * See docs/features/maps.md.
 */
import { isMobileLayout } from './display'

/** A phone or a tablet. */
export const MOBILE_MARKERS = 50
/** A desktop. */
export const DESKTOP_MARKERS = 500
/** The pins' dots are the one thing on the map neither capped nor clipped, so
    they carry a budget of their own. */
export const MOBILE_DOTS = 100
/** A desktop. */
export const DESKTOP_DOTS = 1000

/**
 * True on a small or coarse-pointer device. A coarse pointer is the second hint:
 * a small window on a desktop is still a desktop. The map engine reads this too,
 * for its tile cache, so the one definition lives here.
 */
export function isSmallDevice() {
  if (isMobileLayout()) return true
  return Boolean(window.matchMedia?.('(pointer: coarse)').matches)
}

/** The marker budget for this device, from the layout and the pointer. */
export function markerBudget() {
  return isSmallDevice() ? MOBILE_MARKERS : DESKTOP_MARKERS
}

/** The dot budget for this device, read exactly as the marker one is. */
export function dotBudget() {
  return isSmallDevice() ? MOBILE_DOTS : DESKTOP_DOTS
}
