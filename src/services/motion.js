/** The OS setting, unless the reader opted back in via `data-motion="always"`. */
export function motionReduced() {
  if (document.documentElement.dataset.motion === 'always') return false
  return Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
}

/**
 * How long a turn takes, in milliseconds. **One number for every place a
 * picture gives way to another** - the viewer's filmstrip and the hover card's
 * own strip alike - so the two movements read as the same gesture.
 */
export const SLIDE_MS = 220
