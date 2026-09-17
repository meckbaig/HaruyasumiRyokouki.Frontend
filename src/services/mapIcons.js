/**
 * The `d` strings for every icon the maps use. **One place**, so the
 * full-screen entry and its exit cannot drift apart, and the height control
 * keeps a mark of its own. Each is a 20x20 `viewBox`, stroked, no fill.
 * See docs/features/maps.md.
 */

/** Corners reaching out: enter a map that fills the window. */
export const MAP_EXPAND = 'M3 7V3h4M17 7V3h-4M3 13v4h4M17 13v4h-4'

/** Corners turning in: leave a map that fills the window. The mirror of the above. */
export const MAP_COLLAPSE = 'M7 3v4H3M13 3v4h4M7 17v-4H3M13 17v-4h4'

/** Arrows apart: make the map taller. */
export const MAP_TALLER = 'M7 8l3-3 3 3M7 12l3 3 3-3'

/** Arrows together: put the map back to its own height. */
export const MAP_SHORTER = 'M7 4l3 3 3-3M7 16l3-3 3 3'
