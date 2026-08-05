/**
 * Accessors for the media URLs the API returns.
 *
 * The frontend no longer builds any storage URL itself: `MediaFileDto` carries
 * `imageUrls` / `videoUrls` with ready-made links, plus `miniature`, a tiny
 * base64 square used as a placeholder until a real preview arrives.
 *
 * Both `imageUrls` and `videoUrls` are split into `mobile` and `desktop`
 * variants; callers pass the current form factor (see `useIsMobile`).
 */
import { isVideo } from './mediaType'

/** The API returns raw base64 with no data-URI prefix. */
const MINIATURE_PREFIX = 'data:image/octet-stream;base64,'

/** Picks the mobile or desktop bundle from a urls object. */
function variant(urls, mobile) {
  if (!urls) return null
  return (mobile ? urls.mobile : urls.desktop) ?? null
}

/**
 * Inline base64 placeholder, shown before any network image is available.
 * Always square, so it stands in for a cropped preview rather than the original.
 */
export function miniatureSrc(media) {
  return media?.miniature ? `${MINIATURE_PREFIX}${media.miniature}` : ''
}

/**
 * Preview image, in the file's original aspect ratio. Used for grid thumbnails
 * (cropped to a square in CSS) and as the first stage in the lightbox.
 */
export function previewSrc(media, mobile = false) {
  if (!media) return ''
  const urls = isVideo(media) ? media.videoUrls : media.imageUrls
  return variant(urls, mobile)?.preview ?? ''
}

/** Full-size image. Videos have no original still — they stream instead. */
export function originalSrc(media, mobile = false) {
  if (!media || isVideo(media)) return ''
  return variant(media.imageUrls, mobile)?.original ?? ''
}

/** Playable video stream. */
export function streamSrc(media) {
  return isVideo(media) ? (media?.videoUrls?.stream ?? '') : ''
}

/**
 * Link for the download button. Videos expose a dedicated download URL; images
 * have none in the contract, so the full-size original stands in for it.
 */
export function downloadSrc(media, mobile = false) {
  if (!media) return ''
  if (isVideo(media)) return media.videoUrls?.download ?? ''
  return originalSrc(media, mobile)
}

/** The day a file belongs to, as an ISO date, derived from its timestamp. */
export function mediaDate(media) {
  return typeof media?.created === 'string' ? media.created.slice(0, 10) : null
}
