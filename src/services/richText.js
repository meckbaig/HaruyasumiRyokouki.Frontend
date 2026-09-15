/**
 * The small markup day notes and media descriptions understand: one or more
 * files of the page referenced by id, and a link with a name of its own. Bare
 * http(s) addresses become links too, labelled by host and last path segment.
 * See docs/features/rich-text-and-links.md.
 */

/** `[media=5]Caption[/media]` or `[media=5,7,9]Caption[/media]` - files by id. */
const MEDIA_PATTERN = '\\[media=(\\d+(?:,\\d+)*)\\]([\\s\\S]*?)\\[\\/media\\]'
/** `[url=https://...]Label[/url]` - a link with a name of its own. */
const URL_PATTERN = '\\[url=([^\\]]+)\\]([\\s\\S]*?)\\[\\/url\\]'
/** A pasted address, up to the first space or angle bracket. */
const BARE_PATTERN = 'https?:\\/\\/[^\\s<>]+'

const TOKEN_RE = new RegExp(`${MEDIA_PATTERN}|${URL_PATTERN}|(${BARE_PATTERN})`, 'gi')

/** Punctuation a sentence leaves stuck to the end of a pasted address. */
const TRAILING = /[.,;:!?)\]}'"»]+$/

/** Where the ids inside `[media=` begin, and how far the placeholder runs. */
const IDS_AT = 7

/**
 * The ids of a `[media=...]` reference, as numbers. Commas only, no spaces:
 * a space would let a caption be mistaken for a second id.
 */
export function parseMediaIds(raw) {
  return String(raw ?? '')
    .split(',')
    .map((part) => Number(part.trim()))
    .filter((id) => Number.isInteger(id))
}

/**
 * What the editor buttons insert. The placeholder stays selected, so the next
 * keystroke replaces it - what a template is for.
 */
export function mediaTemplate(selected = '') {
  return { text: `[media=id]${selected.trim()}[/media]`, select: [IDS_AT, IDS_AT + 2] }
}

/**
 * A media reference already carrying ids. `select` covers the **ids alone**, so
 * a later pick can rewrite them in place without touching the caption.
 */
export function mediaReference(ids, selected = '') {
  const list = ids.map((id) => String(id)).join(',')
  const text = `[media=${list}]${selected.trim()}[/media]`
  return { text, select: [IDS_AT, IDS_AT + list.length] }
}

export function urlTemplate(selected = '') {
  return { text: `[url=address]${selected.trim()}[/url]`, select: [5, 12] }
}

/**
 * Splits `text` into ordered tokens: `{ type: 'text' | 'media' | 'link' }`.
 * A media token carries `{ ids, id, label }` - `id` is the first of `ids`, kept
 * because a reference's own place is named by one file. A link token carries
 * `{ href, label }`. Every token also carries `raw`, the exact source it came
 * from, which is what lets the editor paint the original string with the markup
 * highlighted.
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

    const [full, mediaIds, mediaLabel, urlHref, urlLabel, bare] = match
    if (mediaIds != null) {
      const ids = parseMediaIds(mediaIds)
      tokens.push({ type: 'media', ids, id: ids[0], label: mediaLabel.trim(), raw: full })
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
