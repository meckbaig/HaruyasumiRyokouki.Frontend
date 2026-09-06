/**
 * Accessors for the media URLs the API returns. The frontend builds no storage
 * URL and picks no rendition - every response carries one ready-made link per
 * purpose. See docs/features/api-layer.md.
 */
import { isVideo } from './mediaType'

/** Raw base64, no type; `octet-stream` is deliberate. See docs/features/api-layer.md. */
const MINIATURE_PREFIX = 'data:image/octet-stream;base64,'

/** Inline base64 placeholder in the file's own proportions; the caller crops it. */
export function miniatureSrc(media) {
  return media?.miniature ? `${MINIATURE_PREFIX}${media.miniature}` : ''
}

/**
 * Preview image in the original aspect ratio. One URL for the grid and for the
 * lightbox's first stage, so the lightbox is served from cache with no request.
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

/** Link for the download button. */
export function downloadSrc(media) {
  if (!media) return ''
  return (isVideo(media) ? media.videoUrls?.download : media.imageUrls?.download) ?? ''
}

/**
 * Proportions as width over height - 0.75 for a 3:4 portrait. Measured by the
 * API, so no layout waits for a picture to report its own size. Null when the
 * file does not carry it.
 */
export function mediaAspect(media) {
  const ratio = Number(media?.aspectRatio)
  return Number.isFinite(ratio) && ratio > 0 ? ratio : null
}

/** The day a file belongs to, as an ISO date, derived from its timestamp. */
export function mediaDate(media) {
  return typeof media?.created === 'string' ? media.created.slice(0, 10) : null
}
