/** The OS setting, unless the reader opted back in via `data-motion="always"`. */
export function motionReduced() {
  if (document.documentElement.dataset.motion === 'always') return false
  return Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
}

/**
 * The options every camera animation this app starts carries. The app's own
 * gate is `motionReduced()`, so a movement it did play is marked **essential**
 * - MapLibre reads the OS setting itself and would otherwise drop it, which is
 * what made the album's step teleport. See docs/features/maps.md.
 */
export function cameraMotion(animate = true) {
  const play = animate && !motionReduced()
  return { animate: play, essential: play }
}

/**
 * How long a turn takes, in milliseconds. **One number for every place a
 * picture gives way to another** - the viewer's filmstrip and the hover card's
 * own strip alike - so the two movements read as the same gesture.
 */
export const SLIDE_MS = 220
