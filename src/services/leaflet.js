import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

/**
 * Shared Leaflet setup so every map on the site looks and behaves the same.
 *
 * Tiles default to CARTO Voyager — far cleaner than raw OSM and free without a
 * key. Both the URL and attribution are overridable through the environment, so
 * swapping to a keyed provider with latin labels later is a config change.
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

/**
 * Leaflet resolves its default icon paths relative to the CSS, which the bundler
 * breaks. Point both the normal and the muted (neighbouring-day) pins at the
 * bundled images.
 */
const ICON_BASE = {
  iconUrl: new URL('leaflet/dist/images/marker-icon.png', import.meta.url).href,
  iconRetinaUrl: new URL('leaflet/dist/images/marker-icon-2x.png', import.meta.url).href,
  shadowUrl: new URL('leaflet/dist/images/marker-shadow.png', import.meta.url).href,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
}

export const pinIcon = L.icon(ICON_BASE)

/** Same pin, desaturated via CSS — used for reference points from other days. */
export const neighborIcon = L.icon({ ...ICON_BASE, className: 'marker-grey' })

/**
 * Creates a base map with CARTO tiles and ctrl-to-zoom on the wheel.
 *
 * Plain wheel zoom is hostile inside a scrolling page — the map swallows the
 * scroll — so the wheel only zooms while Ctrl (or ⌘) is held, the same
 * convention embedded maps use elsewhere. `onScrollHint` is called when the user
 * scrolls without the modifier, so the caller can flash a hint.
 */
export function createBaseMap(container, { center, zoom, onScrollHint } = {}) {
  const map = L.map(container, { scrollWheelZoom: false }).setView(
    center ?? FALLBACK_CENTER,
    zoom ?? FALLBACK_ZOOM,
  )
  L.tileLayer(TILE_URL, { attribution: ATTRIBUTION, maxZoom: MAX_ZOOM }).addTo(map)

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
