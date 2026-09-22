/*
  Builds the hosted basemaps: both MapToolkit styles from the published Summer
  one, terrain, contours, noisy labels and the road shield stripped, and
  OpenFreeMap's dark scheme from its own Bright style.
  Flags: KEEP_TERRAIN, LABELS, CONTOURS, LEAN. See plans/maps-performance.md.
*/
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const BASE = 'https://styles.maptoolkit.org/summer.json'
const OPENFREEMAP_BASE = 'https://tiles.openfreemap.org/styles/bright'
const DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../public/map')

/*
  The dark tuning knobs. `100 - lightness` is compressed into
  [`INVERT_FLOOR`, `INVERT_FLOOR + 100 * INVERT_SCALE`], so nothing is pure
  black or pure white. Hue and saturation are kept, which is what keeps water,
  parks and roads readable in the dark.
*/
const INVERT_FLOOR = 4
const INVERT_SCALE = 0.9
const SATURATION = 1

/** A `raster-dem` source and the layers drawn from it are the 3D relief. */
const RELIEF_TYPES = new Set(['hillshade', 'color-relief'])

const COLOR = /(hsla?)\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%\s*(?:,\s*([\d.]+)\s*)?\)/gi

const round = (value) => Math.round(value * 100) / 100

/** Removes the terrain layer: raster-dem sources, their layers, sky and light. */
function stripTerrain(style) {
  const dem = new Set(
    Object.entries(style.sources)
      .filter(([, source]) => source.type === 'raster-dem')
      .map(([id]) => id),
  )
  style.layers = style.layers.filter(
    (layer) => !dem.has(layer.source) && !RELIEF_TYPES.has(layer.type),
  )
  for (const id of dem) delete style.sources[id]
  delete style.sky
  delete style.light
  delete style.terrain
}

/*
  The contours are a whole second vector source, fetched on every zoom once it
  is in range. A photo backdrop does not need them; `CONTOURS=1` keeps the
  relief for a hiking map. See plans/maps-performance.md.
*/
function stripContours(style) {
  if (process.env.CONTOURS === '1') return
  style.layers = style.layers.filter((layer) => layer.source !== 'contours')
  delete style.sources.contours
}

/*
  The labels a minimal style keeps: a place name and a water name, nothing else.
  Placement runs on the main thread, so a road sub-label costs a frame on every
  arriving tile. `LABELS=full` restores every label; `none` drops them all.
*/
const KEPT_LABEL_SOURCES = new Set(['place_label', 'water_label'])

function pruneLabels(style) {
  const mode = process.env.LABELS ?? 'minimal'
  if (mode === 'full') return
  style.layers = style.layers.filter((layer) => {
    if (layer.type !== 'symbol') return true
    if (mode === 'none') return false
    return KEPT_LABEL_SOURCES.has(layer['source-layer'])
  })
}

/*
  The blur and hatching variants redraw the same road geometry for a subtle glow
  or a rail pattern. `LEAN=1` drops them: the cheapest overdraw to remove without
  touching the roads' own contrast. See plans/maps-performance.md.
*/
const LEAN_LAYERS = /(_blur_|_hatching$)/

function stripLean(style) {
  if (process.env.LEAN !== '1') return
  style.layers = style.layers.filter((layer) => !LEAN_LAYERS.test(layer.id))
}

/** The sprite served the road shield alone, which the label set drops. */
function stripSprite(style) {
  const usesIcon = style.layers.some((layer) =>
    Object.keys(layer.layout ?? {}).some((key) => key.startsWith('icon')),
  )
  if (!usesIcon) delete style.sprite
}

/** Inverts the lightness of every `hsl()` / `hsla()` literal in a string. */
function invert(text) {
  return text.replace(COLOR, (_, fn, hue, sat, light, alpha) => {
    const value = INVERT_FLOOR + (100 - Number(light)) * INVERT_SCALE
    const body = `${round(Number(hue))}, ${round(Number(sat) * SATURATION)}%, ${round(value)}%`
    return alpha == null ? `hsl(${body})` : `hsla(${body}, ${alpha})`
  })
}

/** One layer's paint, run through the inversion as a whole. */
function invertPaint(paint) {
  return JSON.parse(invert(JSON.stringify(paint)))
}

/*
  The OpenFreeMap dark pass. The night city takes the tones chosen for it - the
  ground, the buildings, the streets and the motorways - everything else is
  reflected, and the non-road lines keep a muted band above the ground.
  See docs/features/maps.md.
*/
const URBAN_COLOR = 'rgb(18, 17, 16)'
const BUILDING_COLOR = 'rgb(30, 30, 32)'
const ROAD_COLOR = 'rgb(28, 33, 37)'
const HIGHWAY_COLOR = 'rgb(74, 86, 97)'
const HIGHWAY = /motorway|trunk|primary/
/** A transportation line that is not a road: a rail, a ferry or a cable car. */
const NOT_ROAD = /rail|ferry|cablecar|aeroway/
const ROAD_HUE = 225
const ROAD_SATURATION = 25
const ROAD_FLOOR = 4
const ROAD_SCALE = 0.42
/** Line families kept in the muted band: the non-road lines above, borders. */
const LINE_SOURCES = new Set(['transportation', 'boundary', 'aeroway'])
/*
  Landuse fills drawn in the ground tone: the urban classes, so a city reads as
  one colour, and the special ones Bright tints, whose reflected pastels glare
  (hospitals, schools, cemeteries). See docs/features/maps.md.
*/
const URBAN_FILLS = new Set([
  'landuse-residential',
  'landuse-suburb',
  'landuse-commercial',
  'landuse-industrial',
  'landuse-railway',
  'landuse-hospital',
  'landuse-school',
  'landuse-cemetery',
])
/** Buildings: the fill in the building tone, the edge in the ground tone. */
const BUILDING_FILLS = new Set(['building', 'building-top'])
/** Route-number shields are a sprite plate we cannot recolour; they are muted. */
const SHIELD = /shield/
const SHIELD_ICON_OPACITY = 0.45
/** The low-zoom relief raster is dimmed, not inverted. */
const RASTER_BRIGHTNESS_MAX = 0.3

const COLOR_TOKEN = /hsla?\([^)]*\)|rgba?\([^)]*\)|#[0-9a-fA-F]{3,8}/g

/** `r`, `g` and `b` in 0-255 to `{ h, s, l, a }`, with `a` alone un-scaled. */
function rgbToHsl(r, g, b, a = 1) {
  const red = r / 255
  const green = g / 255
  const blue = b / 255
  const max = Math.max(red, green, blue)
  const min = Math.min(red, green, blue)
  const l = (max + min) / 2
  const delta = max - min
  if (!delta) return { h: 0, s: 0, l: l * 100, a }

  const s = delta / (1 - Math.abs(2 * l - 1))
  let h
  if (max === red) h = (green - blue) / delta + (green < blue ? 6 : 0)
  else if (max === green) h = (blue - red) / delta + 2
  else h = (red - green) / delta + 4
  return { h: h * 60, s: s * 100, l: l * 100, a }
}

/** Any of Bright's colour literals as `{ h, s, l, a }`, or null if it is none. */
function parseColor(token) {
  if (token[0] === '#') {
    let hex = token.slice(1)
    if (hex.length === 3) hex = [...hex].map((char) => char + char).join('')
    const value = parseInt(hex, 16)
    return rgbToHsl((value >> 16) & 255, (value >> 8) & 255, value & 255)
  }

  const parts = token.slice(token.indexOf('(') + 1, -1).split(/[,\s/]+/).filter(Boolean)
  const alpha = parts[3] == null ? 1 : Number(parts[3])
  if (token.startsWith('rgb')) {
    return rgbToHsl(Number(parts[0]), Number(parts[1]), Number(parts[2]), alpha)
  }
  return { h: Number(parts[0]), s: parseFloat(parts[1]), l: parseFloat(parts[2]), a: alpha }
}

/** Back to a literal MapLibre reads, with the transformed lightness. */
function formatColor({ h, s, l, a }) {
  const body = `${round(h)}, ${round(s)}%, ${round(l)}%`
  return a >= 1 ? `hsl(${body})` : `hsla(${body}, ${round(a)})`
}

const reflect = ({ h, s, l, a }) => ({ h, s, l: INVERT_FLOOR + (100 - l) * INVERT_SCALE, a })
/** A muted night line: a cool hue, a low saturation and a band above the ground. */
const nightRoad = ({ h, s, l, a }) => ({
  h: ROAD_HUE,
  s: Math.min(s, ROAD_SATURATION),
  l: ROAD_FLOOR + l * ROAD_SCALE,
  a,
})

/** The fixed tone for a road line, or null when the layer is not one. */
function roadTone(layer) {
  if (layer.type !== 'line' || layer['source-layer'] !== 'transportation') return null
  if (NOT_ROAD.test(layer.id) || layer.paint?.['line-color'] === undefined) return null
  return HIGHWAY.test(layer.id) ? HIGHWAY_COLOR : ROAD_COLOR
}

/** The same value with every colour literal run through `transform`. */
function recolor(value, transform) {
  if (typeof value === 'string') {
    return value.replace(COLOR_TOKEN, (token) => {
      const color = parseColor(token)
      return color ? formatColor(transform(color)) : token
    })
  }
  if (Array.isArray(value)) return value.map((item) => recolor(item, transform))
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, recolor(item, transform)]),
    )
  }
  return value
}

/* One layer of the dark scheme: the city takes the fixed tones, everything else
   is reflected, a road its own tone, the other lines their muted band. */
function darkLayer(layer) {
  if (layer.type === 'background') {
    const paint = { ...(layer.paint ?? {}), 'background-color': URBAN_COLOR }
    return { ...layer, paint }
  }
  if (URBAN_FILLS.has(layer.id)) {
    const paint = { ...(layer.paint ?? {}), 'fill-color': URBAN_COLOR }
    return { ...layer, paint }
  }
  if (BUILDING_FILLS.has(layer.id)) {
    const paint = {
      ...(layer.paint ?? {}),
      'fill-color': BUILDING_COLOR,
      'fill-outline-color': URBAN_COLOR,
    }
    return { ...layer, paint }
  }
  if (layer.type === 'raster') {
    const paint = { ...(layer.paint ?? {}), 'raster-brightness-max': RASTER_BRIGHTNESS_MAX }
    return { ...layer, paint }
  }
  if (SHIELD.test(layer.id)) {
    const paint = { ...(layer.paint ?? {}), 'icon-opacity': SHIELD_ICON_OPACITY }
    return { ...layer, paint }
  }
  const tone = roadTone(layer)
  if (tone) return { ...layer, paint: { ...layer.paint, 'line-color': tone } }
  if (!layer.paint) return layer
  const line = layer.type === 'line' && LINE_SOURCES.has(layer['source-layer'])
  return { ...layer, paint: recolor(layer.paint, line ? nightRoad : reflect) }
}

function writeStyle(name, style) {
  mkdirSync(DIR, { recursive: true })
  writeFileSync(resolve(DIR, name), JSON.stringify(style))
  console.log(`Wrote ${name} (${style.layers.length} layers)`)
}

const response = await fetch(BASE)
if (!response.ok) throw new Error(`MapToolkit style fetch failed: ${response.status}`)

const summer = await response.json()
if (process.env.KEEP_TERRAIN !== '1') stripTerrain(summer)
stripContours(summer)
pruneLabels(summer)
stripLean(summer)
stripSprite(summer)

summer.name = 'Maptoolkit Summer (hosted)'
writeStyle('maptoolkit-light.json', summer)

const dark = JSON.parse(JSON.stringify(summer))
dark.name = 'Maptoolkit Summer Dark (custom)'
dark.layers = dark.layers.map((layer) =>
  layer.paint && !RELIEF_TYPES.has(layer.type) ? { ...layer, paint: invertPaint(layer.paint) } : layer,
)
writeStyle('maptoolkit-dark.json', dark)

/*
  OpenFreeMap's dark scheme, from the same Bright style its light scheme uses:
  Bright's own labels and POIs, recoloured for the night. See docs/features/maps.md.
*/
const bright = await (await fetch(OPENFREEMAP_BASE)).json()
bright.name = 'OpenFreeMap Bright Dark (hosted)'
bright.layers = bright.layers.map(darkLayer)
writeStyle('openfreemap-dark.json', bright)
