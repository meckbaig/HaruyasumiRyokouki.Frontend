import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

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
 * that for a map filling the window. See docs/features/maps.md.
 */
export function createBaseMap(container, { center, zoom, onScrollHint, wheelZoom = false } = {}) {
  const map = L.map(container, { scrollWheelZoom: wheelZoom }).setView(
    center ?? FALLBACK_CENTER,
    zoom ?? FALLBACK_ZOOM,
  )
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
