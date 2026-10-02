import { ref } from 'vue'
import { fullScreenSrc, miniatureSrc, previewSrc } from '@/services/mediaAssets'
import { isMobileLayout } from '@/services/display'
import { fullPaintable } from '@/services/lightbox/layers'

/*
  The preview and full-size cache the viewer keeps for the session: which files
  the browser already holds, which are being fetched ahead, and which source each
  layer or the filmstrip draws from. See docs/features/media-viewer.md.
*/

/** How far ahead to warm the previews of the files a page turn is heading to. */
const PREVIEW_WARM_AHEAD = 5

export function useLightboxLayers({ props, open, picture, isCovered }) {
  /* Full-size images this session has held, so a file already seen slides past
     sharp. A record, not a probe - probing an uncached URL issues a request. */
  const inHand = new Set()

  /** Preview URLs this session already asked to be fetched ahead of need. */
  const warmedPreviews = new Set()

  /** Full-size URLs this session has already asked the browser to fetch ahead. */
  const warmedFullSize = new Set()

  /* Full-size URLs whose bytes have actually arrived. Reactive: the filmstrip's
     neighbours switch to the full image the moment it is ready. */
  const fullCached = ref(new Set())

  /**
   * Fetches the previews of the next few files into the browser cache, off-DOM,
   * so the file the reader is about to turn to settles in instead of loading
   * while the strip is sliding.
   */
  function warmPreviews() {
    if (!open.value) return
    const last = Math.min(props.items.length, props.index + PREVIEW_WARM_AHEAD + 1)
    for (let i = props.index + 1; i < last; i += 1) {
      const item = props.items[i]
      if (!item) continue
      const url = previewSrc(item)
      if (!url || warmedPreviews.has(url)) continue
      warmedPreviews.add(url)
      // No paint and no layout: a detached Image only fills the cache, which is
      // what the layers and the strip read when the file arrives.
      const image = new Image()
      image.src = url
    }
  }

  /**
   * Fetches a neighbour's full-size image, off-DOM, so a page turn shows it
   * sharp from the first frame instead of loading. **Skipped in the mobile
   * layout**, where the swap is invisible and the file is a heavy download.
   */
  function warmFullSize(delta) {
    if (!open.value) return
    // Not on a phone: the swap is invisible there and the file is a heavy download.
    if (isMobileLayout()) return
    const item = props.items[props.index + delta]
    if (!item) return
    const url = fullScreenSrc(item)
    if (!url || inHand.has(url) || warmedFullSize.has(url)) return
    warmedFullSize.add(url)
    const image = new Image()
    // The completed fetch is what lets the layer settle the moment it is reached.
    image.onload = () => {
      const next = new Set(fullCached.value)
      next.add(url)
      fullCached.value = next
    }
    image.src = url
  }

  /** Whether this file's full-size image can be drawn with no request at all. */
  function haveFullSize(item) {
    const full = fullScreenSrc(item)
    return Boolean(full) && (inHand.has(full) || fullCached.value.has(full))
  }

  /** The source a filmstrip neighbour draws: the full, when it is already held. */
  function stripSrc(item) {
    // A covered neighbour turns past as its blurred miniature too, so a slide
    // never flashes the file it is hiding.
    if (isCovered(item)) return miniatureSrc(item)
    if (haveFullSize(item)) return fullScreenSrc(item)
    return previewSrc(item) || miniatureSrc(item)
  }

  /** The sharpest image the browser can paint right now, for the flight. */
  function heroSource(item) {
    // A covered file flies as its blurred miniature, never its sharp layers.
    if (isCovered(item)) return miniatureSrc(item)
    const full = fullScreenSrc(item)
    if (full && fullPaintable(full, picture.value)) return full
    return previewSrc(item) || miniatureSrc(item)
  }

  return { inHand, fullCached, warmPreviews, warmFullSize, haveFullSize, stripSrc, heroSource }
}
