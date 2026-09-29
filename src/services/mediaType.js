/**
 * `MediaFileDto.type` is a string enum (`Image` / `Video`). Compare
 * case-insensitively, and fall back to the extension when the field is missing
 * so a null never renders a video as a still image.
 */

const VIDEO_EXTENSIONS = new Set(['mp4', 'mov', 'm4v', 'avi', 'mkv', 'webm', '3gp', 'mts'])

export function isVideo(media) {
  if (!media) return false

  const type = String(media.type ?? '').toLowerCase()
  if (type.includes('video')) return true
  if (type.includes('image')) return false

  const extension = String(media.fileName ?? '')
    .split('.')
    .pop()
    .toLowerCase()
  return VIDEO_EXTENSIONS.has(extension)
}

export function isImage(media) {
  return Boolean(media) && !isVideo(media)
}

/** `source`, lowercased; null when the server hosts the file itself. */
export function mediaSource(media) {
  const source = String(media?.source ?? '').trim().toLowerCase()
  return source || null
}

/*
  Providers whose `stream` URL is an embed page rather than a playable file - a
  video the server only points at, shown in the origin's own player. Keyed on
  the `source` field, so a second provider is one entry here.
*/
const EMBED_SOURCES = new Set(['youtube'])

/** A video the server does not host: embed the origin's own player instead. */
export function isEmbeddedVideo(media) {
  return isVideo(media) && EMBED_SOURCES.has(mediaSource(media))
}
