/**
 * Sharing is just "copy the current URL": every shareable state — the day, the
 * search query, the active tab, the map range — already lives in the address
 * bar, so there is nothing else to serialise.
 */

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
  return copyToClipboard(window.location.href)
}
