/**
 * The small markup day notes and media descriptions understand: a file of the
 * page referenced by id, and a link with a name of its own. Bare http(s)
 * addresses become links too, labelled by host and last path segment.
 * See docs/features/rich-text-and-links.md.
 */

/** `[media=5]Caption[/media]` - a file, by its id. Label may be empty. */
const MEDIA_PATTERN = '\\[media=(\\d+)\\]([\\s\\S]*?)\\[\\/media\\]'
/** `[url=https://...]Label[/url]` - a link with a name of its own. */
const URL_PATTERN = '\\[url=([^\\]]+)\\]([\\s\\S]*?)\\[\\/url\\]'
/** A pasted address, up to the first space or angle bracket. */
const BARE_PATTERN = 'https?:\\/\\/[^\\s<>]+'

const TOKEN_RE = new RegExp(`${MEDIA_PATTERN}|${URL_PATTERN}|(${BARE_PATTERN})`, 'gi')

/** Punctuation a sentence leaves stuck to the end of a pasted address. */
const TRAILING = /[.,;:!?)\]}'"»]+$/

/**
 * What the editor buttons insert. The placeholder stays selected, so the next
 * keystroke replaces it - what a template is for.
 */
export function mediaTemplate(selected = '') {
  return { text: `[media=id]${selected.trim()}[/media]`, select: [7, 9] }
}

export function urlTemplate(selected = '') {
  return { text: `[url=address]${selected.trim()}[/url]`, select: [5, 12] }
}

/**
 * Splits `text` into ordered tokens: `{ type: 'text' | 'media' | 'link' }`.
 * A media token carries `{ id, label }`, a link token `{ href, label }`. Every
 * token also carries `raw`, the exact source it came from, which is what lets
 * the editor paint the original string with the markup highlighted.
 */
export function parseRichText(text) {
  const source = String(text ?? '')
  const tokens = []
  let cursor = 0
  let match

  TOKEN_RE.lastIndex = 0
  while ((match = TOKEN_RE.exec(source))) {
    if (match.index > cursor) {
      const plain = source.slice(cursor, match.index)
      tokens.push({ type: 'text', text: plain, raw: plain })
    }

    const [full, mediaId, mediaLabel, urlHref, urlLabel, bare] = match
    if (mediaId != null) {
      tokens.push({ type: 'media', id: Number(mediaId), label: mediaLabel.trim(), raw: full })
    } else if (urlHref != null) {
      tokens.push({ type: 'link', href: urlHref.trim(), label: urlLabel.trim(), raw: full })
    } else {
      // A trailing comma belongs to the sentence, not to the address.
      const href = bare.replace(TRAILING, '')
      tokens.push({ type: 'link', href, label: '', raw: href })
      const tail = bare.slice(href.length)
      if (tail) tokens.push({ type: 'text', text: tail, raw: tail })
    }

    cursor = match.index + full.length
  }

  if (cursor < source.length) {
    const plain = source.slice(cursor)
    tokens.push({ type: 'text', text: plain, raw: plain })
  }
  return tokens
}

/** Short, readable name for an address: `youtube.com/.../KwDqqZ9anRc`. */
export function linkLabel(href) {
  try {
    const url = new URL(href)
    const host = url.hostname.replace(/^www\./, '')
    const parts = url.pathname.split('/').filter(Boolean)
    if (parts.length === 0) return host
    if (parts.length === 1) return `${host}/${parts[0]}`
    return `${host}/.../${parts[parts.length - 1]}`
  } catch {
    return href
  }
}
