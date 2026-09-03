/**
 * How long a click invented from a touch may take to arrive.
 *
 * A browser makes one out of a tap some time after `touchend`, aimed at the
 * point the finger was at rather than at what was under it when the tap began.
 * Anything that answers a tap directly, instead of waiting for the click, has to
 * account for the one that follows - and so does anything that opens over that
 * point. See docs/features/media-grid-and-selection.md.
 */
export const GHOST_CLICK_MS = 500
