/**
 * Sharing is just "copy the current URL": every shareable state — the day, the
 * search query, the active tab, the map range — already lives in the address
 * bar, so there is nothing else to serialise. The one addition is ?lang=<current
 * locale>, so the recipient opens the site in the language the sender was using
 * (and the crawler serves a preview card in that language).
 */
import { currentLocale } from '@/i18n'
import { withMediaLink } from '@/composables/useMediaLink'

/** Returns a URL with ?lang set to the active locale, preserving other params. */
function withLang(rawUrl) {
  const url = new URL(rawUrl, window.location.origin)
  url.searchParams.set('lang', currentLocale())
  return url.toString()
}

/** Copies text to the clipboard, falling back for non-secure contexts. */
export async function copyToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // Permission denied or a non-secure origin; fall through to the legacy path.
    }
  }

  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()

  let copied = false
  try {
    copied = document.execCommand('copy')
  } catch {
    copied = false
  } finally {
    document.body.removeChild(textarea)
  }

  return copied
}

/**
 * Copies a link to one file rather than to the page as a whole.
 *
 * Built on top of wherever the reader is, so a file shared from a search carries
 * the search with it and lands among the same results. `path` overrides that for
 * a page that cannot resolve a file at all — the front page, whose wall is
 * reshuffled per visit — where the file's own day is the honest destination.
 *
 * See composables/useMediaLink for what `i` and `o` mean.
 */
export function copyMediaUrl(id, { open = false, path = null } = {}) {
  const url = new URL(path ?? window.location.href, window.location.origin)
  const query = withMediaLink(Object.fromEntries(url.searchParams), id, open)
  url.search = new URLSearchParams(query).toString()
  return copyToClipboard(withLang(url.toString()))
}

export function copyCurrentUrl() {
  return copyToClipboard(withLang(window.location.href))
}

/** Copies a link to the home page (used by the footer to share the site itself). */
export function copyHomeUrl() {
  return copyToClipboard(withLang(window.location.origin + '/'))
}
