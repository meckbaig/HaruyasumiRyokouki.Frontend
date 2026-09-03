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
 * `miniature` is a tiny base64 image shipped inline with every file, used as a
 * placeholder until a real preview arrives. It keeps the file's own proportions;
 * cropping it to whatever shape a view wants is done in CSS, here on the client.
 */
import { isVideo } from './mediaType'

/*
  The API returns raw base64 with no data-URI prefix, and does not say what the
  bytes are. `octet-stream` is deliberate rather than a placeholder: the server
  may hold miniatures in whatever format it likes, and browsers sniff the magic
  bytes of a data URI regardless of the type declared. Naming a concrete type
  here would be a guess, and having the API send one would cost a field on every
  file in every response to say something the browser works out for itself.
*/
const MINIATURE_PREFIX = 'data:image/octet-stream;base64,'

/**
 * Inline base64 placeholder, shown before any network image is available.
 * Carries the file's own proportions, so it stands in equally for a square grid
 * tile and for the viewer's full-height frame; each crops it as it needs.
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
