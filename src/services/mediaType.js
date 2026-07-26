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
