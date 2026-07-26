/**
 * Every link to Nextcloud is built here. The API only gives us `fileName`, so
 * the frontend owns the mapping from a name to a preview or an original.
 *
 * If the backend ever starts returning ready-made `url` / `thumbnailUrl`, this
 * module is the only place that has to change.
 */

const BASE_URL = (import.meta.env.VITE_NEXTCLOUD_BASE_URL || '').replace(/\/+$/, '')
const SHARE_TOKEN = import.meta.env.VITE_NEXTCLOUD_SHARE_TOKEN || ''

/**
 * The only preview sizes Nextcloud generates for this share. Any other value
 * would make it render an uncached, off-size image, so every requested size is
 * snapped to one of these.
 */
export const SQUARE_SIZES = [64, 256, 1024, 4096]

export const isMediaStorageConfigured = Boolean(BASE_URL && SHARE_TOKEN)

/** Snaps a desired pixel size to the nearest supported preview size (ties round up). */
function snapSize(desired) {
  let best = SQUARE_SIZES[0]
  let bestDelta = Infinity
  for (const size of SQUARE_SIZES) {
    const delta = Math.abs(size - desired)
    if (delta < bestDelta || (delta === bestDelta && size > best)) {
      best = size
      bestDelta = delta
    }
  }
  return best
}

/** Splits `a/b/photo.jpg` into the directory and the bare file name. */
function splitPath(fileName) {
  const clean = String(fileName).replace(/^\/+/, '')
  const slash = clean.lastIndexOf('/')
  if (slash === -1) return { dir: '/', base: clean }
  return { dir: `/${clean.slice(0, slash)}`, base: clean.slice(slash + 1) }
}

/**
 * Square, cropped preview used by every grid in the app.
 *
 * The `a` parameter is deliberately absent: `a=1` makes Nextcloud *preserve* the
 * aspect ratio and fit the image inside the box, which leaves portrait and
 * landscape files different heights. Omitting it makes Nextcloud crop to an
 * exact `size × size` square, so the grid stays even and nothing reflows once
 * the image arrives.
 */
export function squareUrl(fileName, size = 256) {
  if (!fileName || !isMediaStorageConfigured) return ''
  const snapped = snapSize(size)
  const params = new URLSearchParams({
    file: `/${String(fileName).replace(/^\/+/, '')}`,
    x: String(snapped),
    y: String(snapped),
  })
  return `${BASE_URL}/apps/files_sharing/publicpreview/${SHARE_TOKEN}?${params.toString()}`
}

/** `srcset` string covering the standard square sizes. */
export function squareSrcSet(fileName) {
  if (!fileName || !isMediaStorageConfigured) return ''
  return SQUARE_SIZES.map((size) => `${squareUrl(fileName, size)} ${size}w`).join(', ')
}

/**
 * Full-resolution file: the lightbox image and the source of video playback.
 * Public shares expose downloads through `/s/{token}/download`.
 */
export function originalUrl(fileName, size = 4000) {
  if (!fileName || !isMediaStorageConfigured) return ''
  const { dir, base } = splitPath(fileName)
  const params = new URLSearchParams({
    file: base,
    x: String(size),
    y: String(size),
    a: true
  })
  return `${BASE_URL}/apps/files_sharing/publicpreview/${SHARE_TOKEN}?${params.toString()}`
}

/**
 * Poster frame for a video. Nextcloud renders previews for videos too, so this
 * reuses the small square preview (~256px in practice).
 */
export function posterUrl(fileName) {
  return squareUrl(fileName, 256)
}

/**
 * Playable video stream.
 *
 * The preview endpoint only ever returns a still poster frame, so a video needs
 * the real file. Public shares expose it through WebDAV at
 * `/public.php/dav/files/{token}/{path}`, which streams the original bytes and
 * supports range requests (seeking).
 */
export function videoUrl(fileName) {
  if (!fileName || !isMediaStorageConfigured) return ''
  const path = String(fileName)
    .replace(/^\/+/, '')
    .split('/')
    .map(encodeURIComponent)
    .join('/')
  return `${BASE_URL}/public.php/dav/files/${SHARE_TOKEN}/${path}`
}
