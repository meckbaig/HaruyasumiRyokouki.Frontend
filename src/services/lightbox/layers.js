/*
  Cache questions the viewer asks about a file's full-size image. DOM-only and
  framework-free: it probes the browser cache and the element already in the DOM,
  so the layer stack never issues a request just to find out.
  See docs/features/media-viewer.md.
*/

/** Whether the browser can paint this URL with no request of its own. */
export function isCached(url) {
  if (!url) return false
  // A detached element answers straight away for anything in the memory cache.
  // Anything it does not know about simply keeps its stand-in, which is the
  // conservative way round.
  const probe = new Image()
  probe.src = url
  return probe.complete && probe.naturalWidth > 0
}

/**
 * A full the browser can paint with no request of its own: the detached probe
 * answers for the memory cache, and the element about to replace the flight also
 * reports `complete` for a disk-cached one the probe cannot see.
 */
export function fullPaintable(url, element) {
  if (isCached(url)) return true
  return Boolean(element?.complete && element.naturalWidth && element.getAttribute('src') === url)
}
