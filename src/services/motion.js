/**
 * Whether animation should be suppressed right now.
 *
 * The OS setting, unless the reader has opted back in - which the motion store
 * stamps on <html> as `data-motion="always"`.
 */
export function motionReduced() {
  if (document.documentElement.dataset.motion === 'always') return false
  return Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
}
