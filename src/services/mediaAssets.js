/**
 * Accessors for the media URLs the API returns.
 *
 * The frontend builds no storage URLs and picks no rendition: every response
 * carries one ready-made link per purpose, already chosen by the server for this
 * client's density and layout (see `services/display.js`). Sizing policy lives
 * on the backend and can change without touching this file.
 *
 *   imageUrls: { download, preview, fullScreen }
 *   videoUrls: { download, stream, preview }
 *
 * `miniature` is a tiny inline base64 placeholder in the file's own proportions;
 * views crop it in CSS.
 */
import { isVideo } from './mediaType'

/**
 * The API sends raw base64 and no type. `octet-stream` is deliberate: the format
 * varies and browsers sniff it. See docs/features/api-layer.md.
 */
const MINIATURE_PREFIX = 'data:image/octet-stream;base64,'

/**
 * Inline base64 placeholder in the file's own proportions. Not pre-cropped - the
 * caller crops it.
 */
export function miniatureSrc(media) {
  return media?.miniature ? `${MINIATURE_PREFIX}${media.miniature}` : ''
}

/**
 * Preview image, in the file's original aspect ratio. Used for grid thumbnails
 * (cropped to a square in CSS) and as the first stage in the lightbox - one URL
 * for both, so the lightbox is served from cache with no request.
 */
export function previewSrc(media) {
  if (!media) return ''
  return (isVideo(media) ? media.videoUrls?.preview : media.imageUrls?.preview) ?? ''
}

/** Full-screen image. Videos have no still of their own - they stream instead. */
export function fullScreenSrc(media) {
  if (!media || isVideo(media)) return ''
  return media.imageUrls?.fullScreen ?? ''
}

/** Playable video stream. */
export function streamSrc(media) {
  return isVideo(media) ? (media?.videoUrls?.stream ?? '') : ''
}

/**
 * Link for the download button. Videos and images use the download URL.
 */
export function downloadSrc(media) {
  if (!media) return ''
  return (isVideo(media) ? media.videoUrls?.download : media.imageUrls?.download) ?? ''
}

/**
 * Proportions of the file, as width over height - 0.75 for a 3:4 portrait.
 *
 * The API measures this, so nothing has to wait for a picture to arrive and
 * report its own size, and no layout is built on a guess and then corrected.
 * Null when a file does not carry it, which leaves the caller to fall back.
 */
export function mediaAspect(media) {
  const ratio = Number(media?.aspectRatio)
  return Number.isFinite(ratio) && ratio > 0 ? ratio : null
}

/** The day a file belongs to, as an ISO date, derived from its timestamp. */
export function mediaDate(media) {
  return typeof media?.created === 'string' ? media.created.slice(0, 10) : null
}
