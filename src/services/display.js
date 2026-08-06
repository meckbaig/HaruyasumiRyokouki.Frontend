/**
 * What the client tells the backend about its screen.
 *
 * The API picks a single `preview` / `fullScreen` URL per file, so the choice of
 * rendition lives on the server. All the frontend contributes are the facts only
 * it can know: the pixel density and the screen size.
 */

/**
 * Shorter side of the screen, in CSS pixels.
 *
 * The smaller of the two, rather than a side picked per orientation: a monitor
 * rotated to portrait is short across the width, a tablet in landscape is short
 * down the height, and browsers swap `screen.width` and `screen.height` on
 * rotation anyway. The minimum covers all of it with no special cases.
 *
 * It reports the screen, not the window, so it does not shift while resizing.
 * Multiply by `dpr` for the physical pixel count.
 */
export function minScreenSide() {
  const { width, height } = window.screen ?? {}
  if (!width || !height) return null
  return Math.min(width, height)
}

/**
 * Value of the `X-Display` request header, e.g. `dpr=1.5; min-side=1440`.
 *
 * Values are sent raw — the server owns the bucketing, so it can change how
 * densities and screen sizes map to renditions without a frontend release.
 */
export function displayHeader() {
  const parts = [`dpr=${window.devicePixelRatio || 1}`]

  const side = minScreenSide()
  if (side) parts.push(`min-side=${side}`)

  return parts.join('; ')
}
