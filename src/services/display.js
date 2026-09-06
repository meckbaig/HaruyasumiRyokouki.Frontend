/**
 * What the client tells the backend about its screen. The server picks the
 * rendition from it; see docs/features/api-layer.md.
 */

/** Where the layout switches to its narrow form; Tailwind's `sm`. */
export const MOBILE_QUERY = '(max-width: 640px)'

/** True while the site is in its mobile layout. */
export function isMobileLayout() {
  return Boolean(window.matchMedia?.(MOBILE_QUERY).matches)
}

/**
 * Shorter side of the drawable area in CSS pixels - the same unit space as
 * `devicePixelRatio`, so `min-side * dpr` is the real device pixel count.
 * Never `screen`: those units cannot be combined with `devicePixelRatio`.
 */
export function minViewportSide() {
  const width = window.innerWidth
  const height = window.innerHeight
  if (!width || !height) return null
  return Math.round(Math.min(width, height))
}

/** Value of the `X-Display` header, e.g. `dpr=1.375; min-side=1470`. */
export function displayHeader() {
  const dpr = Math.round((window.devicePixelRatio || 1) * 1000) / 1000
  const parts = [`dpr=${dpr}`]

  const side = minViewportSide()
  if (side) parts.push(`min-side=${side}`)

  return parts.join('; ')
}
