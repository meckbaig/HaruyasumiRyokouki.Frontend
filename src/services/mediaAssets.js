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
 * `miniature` is a tiny base64 square shipped inline with every file, used as a
 * placeholder until a real preview arrives.
 */
import { isVideo } from './mediaType'

/** The API returns raw base64 with no data-URI prefix. */
const MINIATURE_PREFIX = 'data:image/octet-stream;base64,'

/**
 * Inline base64 placeholder, shown before any network image is available.
 * Always square, so it stands in for a cropped preview rather than the original.
 */
export function miniatureSrc(media) {
  return media?.miniature ? `${MINIATURE_PREFIX}${media.miniature}` : ''
}

/**
 * Preview image, in the file's original aspect ratio. Used for grid thumbnails
 * (cropped to a square in CSS) and as the first stage in the lightbox — one URL
 * for both, so the lightbox is served from cache with no request.
 */
export function previewSrc(media) {
  if (!media) return ''
  return (isVideo(media) ? media.videoUrls?.preview : media.imageUrls?.preview) ?? ''
}

/** Full-screen image. Videos have no still of their own — they stream instead. */
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

/** The day a file belongs to, as an ISO date, derived from its timestamp. */
export function mediaDate(media) {
  return typeof media?.created === 'string' ? media.created.slice(0, 10) : null
}
