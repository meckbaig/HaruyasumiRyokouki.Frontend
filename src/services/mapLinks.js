/**
 * Coordinates and the link out to a map service. **One place**, so the provider
 * can be swapped or made regional without hunting through components - an entry
 * here is the whole change. See docs/features/maps.md.
 */

/** Both coordinates present, which is what every "on the map" action needs. */
export function hasCoordinates(media) {
  return Number.isFinite(media?.latitude) && Number.isFinite(media?.longitude)
}

/** Every map service the UI offers, in the order it lists them. */
export const MAP_SERVICES = [
  {
    id: 'google',
    /** An i18n key, because UI copy lives in the locale files. */
    label: 'map.services.google',
    /**
     * The `q=` form rather than a coordinate pin: Maps reverse-geocodes it, so
     * the reader lands on the place the photograph was taken and not on a pin
     * labelled with its own numbers. `hl` follows the reader's language.
     */
    url: ({ latitude, longitude, locale }) => {
      const query = encodeURIComponent(`${latitude},${longitude}`)
      const hl = locale ? `&hl=${encodeURIComponent(locale)}` : ''
      return `https://www.google.com/maps?q=${query}&z=17${hl}`
    },
  },
]

/** The fallback when nothing else is said. */
export const DEFAULT_MAP_SERVICE = MAP_SERVICES[0].id

/** The service link for a file, or null when it carries no coordinates. */
export function mapServiceUrl(media, id = DEFAULT_MAP_SERVICE, { locale } = {}) {
  if (!hasCoordinates(media)) return null
  const service = MAP_SERVICES.find((entry) => entry.id === id) ?? MAP_SERVICES[0]
  return service.url({ ...media, locale })
}
