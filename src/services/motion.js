/** The OS setting, unless the reader opted back in via `data-motion="always"`. */
export function motionReduced() {
  if (document.documentElement.dataset.motion === 'always') return false
  return Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
}
