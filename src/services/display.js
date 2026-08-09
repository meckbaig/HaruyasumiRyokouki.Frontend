/**
 * What the client tells the backend about its screen.
 *
 * The API picks a single `preview` / `fullScreen` URL per file, so the choice of
 * rendition lives on the server. All the frontend contributes are the facts only
 * it can know: the pixel density and the screen size.
 */

/** Where the layout switches to its narrow form; Tailwind's `sm`. */
export const MOBILE_QUERY = '(max-width: 640px)'

/** True while the site is in its mobile layout. */
export function isMobileLayout() {
  return Boolean(window.matchMedia?.(MOBILE_QUERY).matches)
}

/**
 * Shorter side of the drawable area, in CSS pixels — the same unit space as
 * `devicePixelRatio`, so `min-side * dpr` is the real device pixel count.
 *
 * Measured from the viewport rather than from `screen`, because those two are
 * not in the same units and cannot be combined: `screen.width/height` divide out
 * the OS scaling but ignore the browser's page zoom, while `devicePixelRatio`
 * includes both. Recovering the screen size in current CSS pixels would need the
 * zoom factor on its own, which no API exposes. `innerWidth/innerHeight` are
 * plain CSS pixels of this page, so they are exact — and they describe the space
 * an image is actually given, the browser's own chrome already excluded.
 *
 * The smaller of the two sides, rather than one picked per orientation: a
 * monitor rotated to portrait is short across the width, a tablet in landscape
 * is short down the height, and the minimum covers both with no special cases.
 */
export function minViewportSide() {
  const width = window.innerWidth
  const height = window.innerHeight
  if (!width || !height) return null
  return Math.round(Math.min(width, height))
}

/**
 * Value of the `X-Display` request header, e.g. `dpr=1.375; min-side=1470`.
 *
 * Both values are in the same unit space: multiply them for device pixels. The
 * ratio is rounded to three decimals — enough to keep the product accurate, few
 * enough to stop near-identical clients from each minting their own cache entry.
 * Bucketing stays on the server, so sizing policy can change without a frontend
 * release.
 */
export function displayHeader() {
  const dpr = Math.round((window.devicePixelRatio || 1) * 1000) / 1000
  const parts = [`dpr=${dpr}`]

  const side = minViewportSide()
  if (side) parts.push(`min-side=${side}`)

  return parts.join('; ')
}
