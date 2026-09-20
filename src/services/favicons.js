/**
 * A link's site icon: a third-party service asked by **host** alone, so showing
 * a note never opens the reader's browser to the site a link points at. A link
 * that stays on this site takes the app's own mark instead.
 * See docs/features/rich-text-and-links.md.
 */

/** `{domain}` is the link's host; a self-hosted proxy swaps in through env. */
const FAVICON_URL =
  import.meta.env.VITE_FAVICON_URL || 'https://icons.duckduckgo.com/ip3/{domain}.ico'

/** The app's own mark, drawn for a link that does not leave this site. */
const APP_ICON = '/haru-logo.svg'

/**
 * The icon for a link, resolved against the page's own origin so a relative
 * address - `[url=/day/2026-03-13]` - keeps the app's mark rather than asking
 * the icon service about our own host. Null when the address carries no site.
 * See docs/features/rich-text-and-links.md.
 */
export function faviconUrl(href) {
  let url
  try {
    url = new URL(href, window.location.origin)
  } catch {
    return null
  }
  if (url.origin === window.location.origin) return APP_ICON
  return url.hostname ? FAVICON_URL.replace('{domain}', url.hostname) : null
}
