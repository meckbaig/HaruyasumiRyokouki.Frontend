import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { miniatureSrc, previewSrc } from './mediaAssets'
import { formatShortTime } from './dates'
import { motionReduced } from './motion'

/**
 * Shared Leaflet setup, so every map on the site looks and behaves the same.
 * Tiles default to keyless CARTO Voyager and are overridable through the
 * environment. See docs/features/maps.md.
 */
export const TILE_URL =
  import.meta.env.VITE_MAP_TILE_URL ||
  'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png'

export const ATTRIBUTION =
  import.meta.env.VITE_MAP_ATTRIBUTION ||
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'

export const MAX_ZOOM = 19

/** Japan, roughly, for when there is nothing to fit the view to. */
export const FALLBACK_CENTER = [36.2, 138.25]
export const FALLBACK_ZOOM = 5

/** The drop every pin on the site is cut from, exported so a legend can draw one. */
export const PIN_PATH = 'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z'

export const PIN_COLOR = '#b3403f'
export const NEIGHBOR_COLOR = '#8b8798'

function pinSvg(inner, size, color) {
  return (
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">` +
    `<path d="${PIN_PATH}" fill="${color}" stroke="#fff" stroke-width="1.2"/>${inner}</svg>`
  )
}

/** A single-media drop with a small white dot in the head. */
export function pinIconOf(color = PIN_COLOR, size = 30) {
  const html = pinSvg('<circle cx="12" cy="9" r="3" fill="#fff"/>', size, color)
  return L.divIcon({
    html,
    className: 'trip-pin',
    iconSize: [size, size],
    iconAnchor: [size / 2, size * 0.92],
    popupAnchor: [0, -size * 0.85],
  })
}

/** How long a pile shows one member before the shared ticker turns it. */
export const PILE_CYCLE_MS = 5000
/** The pile's own turn; the same beat as `MediaStrip` and the viewer. */
export const PILE_SLIDE_MS = 600
/** The curve `MediaStrip` uses, so a pile turn and a page turn read alike. */
export const PILE_EASING = 'cubic-bezier(0.2, 0.9, 0.3, 1)'

/**
 * The pile's turn, off by default.
 *
 * | `PILE_TURN` | Pile shows | Ticker |
 * | --- | --- | --- |
 * | `false` | one member's full pair, miniature **and** preview, as a lone pin | none |
 * | `true` | miniatures only, sliding every `PILE_CYCLE_MS` on one shared tick | one timer per map |
 *
 * The turn is visually busy, and loading a preview per pile is bounded by the
 * marker budget; the quiet mode is what ships. See docs/features/maps.md.
 */
export const PILE_TURN = false

/**
 * A pile of pins: **the pin's own shape**, a 44x51 frame with the same tail and
 * its ground at the bottom centre, so a pile opens into a preview by the same
 * movement a single pin does. The count sits as a badge in the corner; what the
 * picture shows follows `PILE_TURN`. See docs/features/maps.md.
 */
export function photoClusterIcon(items, { withTime = false, locale = '' } = {}) {
  const list = Array.isArray(items) ? items : []
  const root = document.createElement('div')
  root.className = 'trip-photo-cluster'

  const box = document.createElement('div')
  box.className = 'trip-photo-cluster-box thumb-stage'

  if (!PILE_TURN) {
    // The member's own two-stage picture, exactly as a lone pin draws it.
    setStagePicture(box, list[0])
    root.__pile = { cursor: 0, locale }
  } else {
    const current = document.createElement('img')
    current.className = 'trip-photo-cluster-img'
    current.alt = ''
    current.setAttribute('aria-hidden', 'true')
    const source = clusterMemberSrc(list[0])
    if (source) current.src = source

    // The layer that slides in. It waits off to the right until a turn.
    const incoming = document.createElement('img')
    incoming.className = 'trip-photo-cluster-img'
    incoming.alt = ''
    incoming.setAttribute('aria-hidden', 'true')
    incoming.style.transform = 'translateX(100%)'

    box.append(current, incoming)
    root.__pile = { cursor: 0, current, incoming, locale }
  }

  root.append(box)

  const badge = document.createElement('span')
  badge.className = 'trip-photo-cluster-count'
  badge.textContent = String(list.length)
  root.append(badge)

  // The chip a day pin wears, for the member the pile's face is on: a day is read
  // as a sequence of hours, and a pile is a place in it. See docs/features/maps.md.
  if (withTime) root.append(clockChip(list[0], locale))

  return L.divIcon({
    html: root,
    className: '',
    iconSize: [PHOTO_PIN_SIZE, PHOTO_PIN_SIZE + PHOTO_PIN_TAIL],
    iconAnchor: [PHOTO_PIN_SIZE / 2, PHOTO_PIN_SIZE + PHOTO_PIN_TAIL],
  })
}

/** The picture a turned pile member shows: **its miniature only**. */
export function clusterMemberSrc(media) {
  return miniatureSrc(media)
}

/**
 * Turns a pile to its next member. The incoming layer slides in from the right
 * while the one on show leaves to the left, then the two swap roles, so the pile
 * never blanks between members. `items` is the marker's current group, and the
 * member now on show is returned so the marker can publish it.
 */
export function advancePile(root, items) {
  const pile = root?.__pile
  const list = Array.isArray(items) ? items : []
  if (!pile || !PILE_TURN || list.length < 2) return pile?.cursor ?? 0

  pile.cursor = (pile.cursor + 1) % list.length
  const source = clusterMemberSrc(list[pile.cursor])
  if (!source) return pile.cursor

  // The chip follows the face, or it would name the member that just left.
  setClockChip(root, list[pile.cursor], pile.locale)

  const { current, incoming } = pile
  incoming.src = source

  if (motionReduced()) {
    current.src = source
    return pile.cursor
  }

  incoming.style.transition = 'none'
  incoming.style.transform = 'translateX(100%)'
  // Laid out before the slide is armed, or the first frame starts from nowhere.
  void incoming.offsetWidth

  const slide = `transform ${PILE_SLIDE_MS}ms ${PILE_EASING}`
  current.style.transition = slide
  incoming.style.transition = slide
  current.style.transform = 'translateX(-100%)'
  incoming.style.transform = 'translateX(0)'

  window.setTimeout(() => {
    current.style.transition = 'none'
    incoming.style.transition = 'none'
    current.src = source
    current.style.transform = 'translateX(0)'
    incoming.style.transform = 'translateX(100%)'
  }, PILE_SLIDE_MS + 20)

  return pile.cursor
}

/**
 * Puts a pile's face on a named member with no slide, so a close lands on the
 * file that flew in and the ticker starts its beat from there. `cursor` is the
 * member's position in the pile's own group. See docs/features/maps.md.
 */
export function setPileFace(root, items, cursor) {
  const pile = root?.__pile
  const list = Array.isArray(items) ? items : []
  if (!pile || !list.length || cursor == null) return

  const index = ((cursor % list.length) + list.length) % list.length
  pile.cursor = index
  setClockChip(root, list[index], pile.locale)

  if (PILE_TURN) {
    const source = clusterMemberSrc(list[index])
    if (!source) return
    pile.current.style.transition = 'none'
    pile.current.src = source
    pile.current.style.transform = 'translateX(0)'
    return
  }

  const box = root.querySelector?.('.trip-photo-cluster-box')
  if (box) setStagePicture(box, list[index])
}

/** One `<img>` of a two-stage picture, with the crop the shared class carries. */
function stageImage(className, src) {
  const image = document.createElement('img')
  image.className = className
  image.alt = ''
  image.setAttribute('aria-hidden', 'true')
  image.draggable = false
  image.src = src
  return image
}

/**
 * Puts one file's two-stage picture into a stage: the blurred miniature under
 * the preview, which fades in over it once it is whole and then lets the base
 * go. **One markup for the pin, the pile and the album**, and the CSS classes
 * are the grid tile's own, so the crop and the blur cannot drift.
 * See docs/features/maps.md.
 */
function setStagePicture(stage, media) {
  stage.classList.remove('is-ready')
  stage.querySelectorAll('img').forEach((node) => node.remove())

  const miniature = miniatureSrc(media)
  const preview = previewSrc(media)
  const nodes = []
  let base = null
  let shot = null
  if (miniature) {
    base = stageImage('thumb-base', miniature)
    nodes.push(base)
  }
  if (preview) {
    shot = stageImage('thumb-shot', preview)
    nodes.push(shot)
  }

  nodes.forEach((node) => stage.append(node))

  if (!shot) return
  shot.addEventListener(
    'load',
    () => {
      stage.classList.add('is-ready')
      // The base is covered pixel for pixel from here on, and a live blur on
      // every mark is the one cost this map cannot pay. As in the viewer.
      if (base) window.setTimeout(() => base.remove(), PIN_PREVIEW_FADE_MS)
    },
    { once: true },
  )
}

/** The same drop, larger, with the child count inside the head. */
export function clusterIconOf(count, color = PIN_COLOR) {
  const size = 42
  const fontSize = count >= 1000 ? 6 : count >= 100 ? 7 : 8
  const inner =
    `<text x="12" y="9" text-anchor="middle" dominant-baseline="central" fill="#fff" ` +
    `font-family="inherit" font-weight="700" font-size="${fontSize}">${count}</text>`
  return L.divIcon({
    html: pinSvg(inner, size, color),
    className: 'trip-pin',
    iconSize: [size, size],
    iconAnchor: [size / 2, size * 0.92],
    popupAnchor: [0, -size * 0.85],
  })
}

/** Single-media pin, accent colour. */
export const pinIcon = pinIconOf(PIN_COLOR)

/* The square photo pin the trip and day maps draw. Smaller than the teardrop,
   with a white frame instead of a filled drop, and the same miniature-then-
   preview pair every wall of thumbnails uses. See docs/features/maps.md. */
export const PHOTO_PIN_SIZE = 44
const PHOTO_PIN_TAIL = 7
/** The preview's own fade, which the miniature has to outlive before it goes. */
const PIN_PREVIEW_FADE_MS = 300

/*
  One icon per file **and per map**, kept across a rebuild: grouping can put the
  same file in a different marker on the next zoom, and a fresh icon would mean a
  fresh <img> and a fresh load for a picture already in the browser. Two maps are
  live whenever one is expanded, so the cache is the map's, never the module's.
*/
const photoPinCaches = new Map()

/** The icon cache of one map, made on first use. */
function cacheOf(scope) {
  let cache = photoPinCaches.get(scope)
  if (!cache) {
    cache = new Map()
    photoPinCaches.set(scope, cache)
  }
  return cache
}

/** Drops one map's cached pins, or every map's when no scope is named. */
export function clearPhotoPinIcons(scope = null) {
  if (scope == null) photoPinCaches.clear()
  else photoPinCaches.delete(scope)
}

/**
 * One square photo pin: a blurred miniature underneath, the preview fading over
 * it. `withTime` stamps the file's own clock above the frame - a **day** map is
 * read as a sequence of hours, so there the hour is worth saying, and `locale`
 * shapes that clock. The trip map takes neither. See docs/features/maps.md.
 */
export function photoPinIcon(media, { withTime = false, locale = '', scope = null } = {}) {
  const id = media?.id ?? media?.fileName
  // A day pin and a trip pin for one file are different marks, and a clock is
  // in the reader's language, so both belong in the key.
  const key = id == null ? null : `${id}|${withTime ? 1 : 0}|${locale}`
  const cache = key != null && scope != null ? cacheOf(scope) : null
  if (cache) {
    const cached = cache.get(key)
    if (cached) return cached
  }

  const icon = buildPhotoPinIcon(media, { withTime, locale })
  if (cache) cache.set(key, icon)
  return icon
}

/** Writes a chip's hour, hiding the chip when the file has none to show. */
function writeClock(clock, media, locale) {
  const text = formatShortTime(media?.created, locale)
  clock.textContent = text
  clock.hidden = !text
}

/** The chip a day mark stamps above its frame: the hour of the file it shows. */
function clockChip(media, locale) {
  const clock = document.createElement('span')
  clock.className = 'trip-photo-time'
  writeClock(clock, media, locale)
  return clock
}

/** Rewrites a standing chip for a face change, never making one where none is. */
function setClockChip(root, media, locale) {
  const clock = root?.querySelector?.('.trip-photo-time')
  if (clock) writeClock(clock, media, locale)
}

function buildPhotoPinIcon(media, { withTime, locale }) {
  const root = document.createElement('div')
  root.className = 'trip-photo-pin'

  const box = document.createElement('div')
  box.className = 'trip-photo-pin-box thumb-stage'
  setStagePicture(box, media)
  root.append(box)

  // The clock stands **above** the frame, outside the picture's box, so a long
  // stamp is not cut to a 40px picture. A pile and the trip map carry nothing.
  if (withTime) root.append(clockChip(media, locale))

  return L.divIcon({
    html: root,
    className: '',
    iconSize: [PHOTO_PIN_SIZE, PHOTO_PIN_SIZE + PHOTO_PIN_TAIL],
    iconAnchor: [PHOTO_PIN_SIZE / 2, PHOTO_PIN_SIZE + PHOTO_PIN_TAIL],
  })
}

/** The pane the route chevrons live in: above the line, below every pin. */
export const ROUTE_PANE = 'tripRoute'
export const ROUTE_PANE_Z = 450

/*
  The pane the grounds of a pile's members live in: above the chevron row, so a
  dot is read over the arrows it terminates, and below every pin. A pane is what
  orders one draw against another. See docs/features/maps.md.
*/
export const ROUTE_DOT_PANE = 'tripRouteDots'
export const ROUTE_DOT_PANE_Z = 550

/**
 * Where the box's corner and a ground land at the view a zoom gesture is
 * heading for, in layer coordinates - `at.subtract(origin)` is the ground's own
 * place in the box. Shared, so the route canvas and the album's card cannot
 * derive the animated point differently. See docs/features/maps.md.
 */
export function animatedProjection(map, latlng, zoom, center) {
  return {
    origin: L.point(map.containerPointToLayerPoint([0, 0])),
    at: map._latLngToNewLayerPoint(latlng, zoom, center),
  }
}

/*
  How the route between two pins is drawn. `arrows` is the row of chevrons,
  which says which way the day went; `line` is the plain solid line, which only
  says that the two are on the same walk. One constant, so the two can be
  compared by hand. See docs/features/maps.md.
*/
export const ROUTE_STYLE = 'arrows'

/* Every arrow figure lives in `services/routeArrows.js`; the pane and the style
   stay here because the pane is the map's. */

/** Muted drop for reference points from neighbouring days. */
export const neighborIcon = pinIconOf(NEIGHBOR_COLOR, 26)

/*
  The last point taken before the file and the first after - the two that
  actually place it. Cool for behind, warm for ahead, both full size.
  See docs/features/maps.md.
*/
export const BEFORE_COLOR = '#4f7ca8'
export const AFTER_COLOR = '#3f8f6f'

export const beforeIcon = pinIconOf(BEFORE_COLOR, 30)
export const afterIcon = pinIconOf(AFTER_COLOR, 30)

/**
 * A base map with CARTO tiles. By default the wheel scrolls the page and only
 * Ctrl/Cmd + wheel zooms, with `onScrollHint` fired otherwise; `wheelZoom` lifts
 * that for a map filling the window. Reduced motion builds it with Leaflet's own
 * zoom animation off, so a zoom is a plain jump. See docs/features/maps.md.
 */
export function createBaseMap(container, { center, zoom, onScrollHint, wheelZoom = false } = {}) {
  const map = L.map(container, {
    scrollWheelZoom: wheelZoom,
    // Reduced motion takes Leaflet's animated zoom off: its own path waits out a
    // 250ms fallback that no `transitionend` ends once the transitions are cut,
    // and the marks would stand on the old view until then. See docs/features/maps.md.
    zoomAnimation: !motionReduced(),
  }).setView(center ?? FALLBACK_CENTER, zoom ?? FALLBACK_ZOOM)
  L.tileLayer(TILE_URL, { attribution: ATTRIBUTION, maxZoom: MAX_ZOOM }).addTo(map)
  map.attributionControl.setPrefix(false);

  if (wheelZoom) return map

  container.addEventListener(
    'wheel',
    (event) => {
      if (!event.ctrlKey && !event.metaKey) {
        onScrollHint?.()
        return
      }
      // Stop the browser's own ctrl+wheel page zoom and zoom the map instead.
      event.preventDefault()
      const latlng = map.containerPointToLatLng(map.mouseEventToContainerPoint(event))
      map.setZoomAround(latlng, map.getZoom() + (event.deltaY < 0 ? 1 : -1))
    },
    { passive: false },
  )

  return map
}
