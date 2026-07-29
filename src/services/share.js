/**
 * Sharing is just "copy the current URL": every shareable state — the day, the
 * search query, the active tab, the map range — already lives in the address
 * bar, so there is nothing else to serialise. The one addition is ?lang=<current
 * locale>, so the recipient opens the site in the language the sender was using
 * (and the crawler serves a preview card in that language).
 */
import { currentLocale } from '@/i18n'

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

export function copyCurrentUrl() {
  return copyToClipboard(withLang(window.location.href))
}

/** Copies a link to the home page (used by the footer to share the site itself). */
export function copyHomeUrl() {
  return copyToClipboard(withLang(window.location.origin + '/'))
}
