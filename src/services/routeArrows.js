/**
 * The route between two pins, drawn onto **canvases** instead of a marker per
 * chevron - the way a game tiles a texture along a path. A canvas draws only what
 * the box shows and costs one element.
 *
 * Two of them, in two panes: the chevrons in the route pane, the grounds of a
 * pile's members one pane above it, because a dot has to be read over the row it
 * terminates and a pane is the only thing that orders one draw against another.
 * Both share the projection and the transform, so the row and its terminals cannot
 * drift apart. See docs/features/maps.md.
 */
import L from 'leaflet'
import { ROUTE_PANE, ROUTE_DOT_PANE, animatedProjection } from './leaflet'
import { motionReduced } from './motion'

/**
 * Every number the arrows use, in one place, so the row can be tuned where it is
 * drawn. **Nothing outside this module holds an arrow figure.**
 */
export const ROUTE_ARROW = {
  /** Distance between chevrons along the visible path, in screen pixels. */
  spacing: 14,
  /** The most chevrons drawn inside the visible box; over it the row spreads. */
  max: 2500,
  /** The chevron's own size, tip to tail. */
  size: 3,
  /** The chevron's stroke weight. */
  width: 2.2,
  /** The plain line's stroke weight, for `ROUTE_STYLE = 'line'`. */
  lineWidth: 2,
  /** An explicit colour; empty uses the theme's accent. */
  color: '',
  /** The dot at a pile member's own ground: the row's terminal. */
  dotRadius: 2.2,
  /** The ring around it, in the mark's own frame colour, so it is not a chevron. */
  dotRing: 1.5,
}

/** How far outside the box a chevron is still drawn, so none pops at the edge. */
const DRAW_PAD = 24

/** The fallbacks when the theme's own colours cannot be read. */
const FALLBACK_COLOR = '#b3403f'
const FALLBACK_RING = '#ffffff'

/** A theme colour, as the canvas can use it. */
function themeColor(container, name, fallback) {
  const value = getComputedStyle(container).getPropertyValue(name).trim()
  return value || fallback
}

/** The accent, with the configured colour first. */
function strokeColor(container) {
  if (ROUTE_ARROW.color) return ROUTE_ARROW.color
  return themeColor(container, '--color-accent', FALLBACK_COLOR)
}

/** The ring a ground dot wears: the pin's own frame colour, at its edge. */
function ringColor(container) {
  return themeColor(container, '--color-paper-raised', FALLBACK_RING)
}

/**
 * Liang-Barsky: the part of a segment inside the box, or null when it misses the
 * box entirely. Both ends come back, so the pieces chain into a visible path.
 */
function clipSegment(a, b, minX, minY, maxX, maxY) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const p = [-dx, dx, -dy, dy]
  const q = [a.x - minX, maxX - a.x, a.y - minY, maxY - a.y]

  let t0 = 0
  let t1 = 1
  for (let i = 0; i < 4; i += 1) {
    if (p[i] === 0) {
      if (q[i] < 0) return null
      continue
    }
    const r = q[i] / p[i]
    if (p[i] < 0) {
      if (r > t1) return null
      if (r > t0) t0 = r
    } else {
      if (r < t0) return null
      if (r < t1) t1 = r
    }
  }

  return [
    { x: a.x + dx * t0, y: a.y + dy * t0 },
    { x: a.x + dx * t1, y: a.y + dy * t1 },
  ]
}

/**
 * A route canvas for one map. `draw` is called on new content and on every pan;
 * `resize` when the box changes. Both are cheap because only the visible stretch
 * is ever stamped. See docs/features/maps.md.
 */
export function createRouteCanvas(map) {
  /** One canvas in its own pane; both are drawn, moved and sized as one thing. */
  function makeLayer(paneName) {
    const canvas = document.createElement('canvas')
    // Leaflet's own class for an element carried through a zoom, so the chevrons
    // ride the movement with the tiles instead of being swapped in after it.
    canvas.className = 'trip-route-canvas leaflet-zoom-animated'
    const pane = map.getPane(paneName)
    if (pane) pane.appendChild(canvas)
    return { canvas, context: canvas.getContext('2d') }
  }

  const row = makeLayer(ROUTE_PANE)
  const dots = makeLayer(ROUTE_DOT_PANE)
  const layers = [row, dots]

  let origin = L.point(0, 0)
  let width = 0
  let height = 0
  let boxWidth = 0
  let boxHeight = 0
  /** The view the canvas is last drawn for, so one gesture draws once. */
  let drawnView = ''
  /** What the last `draw` was asked for, so a zoom can redraw it. */
  let lastDraw = { route: [], style: 'arrows', grounds: [] }

  function pixelRatio() {
    return Math.min(window.devicePixelRatio || 1, 2)
  }

  /** Gives both canvases the same CSS box, at the device's own density. */
  function sizeCanvas(w, h) {
    if (w === boxWidth && h === boxHeight) return
    boxWidth = w
    boxHeight = h
    const ratio = pixelRatio()
    for (const layer of layers) {
      layer.canvas.style.width = `${w}px`
      layer.canvas.style.height = `${h}px`
      layer.canvas.width = Math.max(1, Math.round(w * ratio))
      layer.canvas.height = Math.max(1, Math.round(h * ratio))
    }
  }

  /** Sizes the canvas to the box and anchors it where the box begins. */
  function resize() {
    const container = map.getContainer()
    width = container.clientWidth
    height = container.clientHeight
    sizeCanvas(width, height)
    reposition()
  }

  /*
    Pins the canvases to where the box now begins, in pane coordinates. A pan moves
    the pane and the canvas together, so this only has to run when the box itself
    has moved relative to the map - which is every draw, since a pan brings new
    ground into frame.
  */
  function reposition() {
    origin = L.point(map.containerPointToLayerPoint([0, 0]))
    for (const layer of layers) L.DomUtil.setPosition(layer.canvas, origin)
  }

  function project(latlng) {
    return map.latLngToLayerPoint(latlng).subtract(origin)
  }

  function projected(points) {
    return points.map((latlng) => project(latlng))
  }

  /**
   * A dot at every ground the caller names - the members of piles, never the
   * centroid their mark stands on. It is the row's own terminal: the arrows'
   * colour, and a ring of the mark's own frame so a dot standing among chevrons
   * is not read as one of them.
   */
  function paintGrounds(context, grounds, color, ring) {
    if (!grounds?.length) return
    context.fillStyle = color
    context.strokeStyle = ring
    context.lineWidth = ROUTE_ARROW.dotRing
    for (const latlng of grounds) {
      const at = project(latlng)
      context.beginPath()
      context.arc(at.x, at.y, ROUTE_ARROW.dotRadius, 0, Math.PI * 2)
      context.fill()
      context.stroke()
    }
  }

  /** One chevron, turned to the stretch's bearing and drawn about its centre. */
  function chevron(context, x, y, angle, color) {
    context.save()
    context.translate(x, y)
    context.rotate(angle)
    context.beginPath()
    context.moveTo(-ROUTE_ARROW.size / 2, -ROUTE_ARROW.size)
    context.lineTo(ROUTE_ARROW.size / 2, 0)
    context.lineTo(-ROUTE_ARROW.size / 2, ROUTE_ARROW.size)
    context.strokeStyle = color
    context.lineWidth = ROUTE_ARROW.width
    context.lineCap = 'round'
    context.lineJoin = 'round'
    context.stroke()
    context.restore()
  }

  /** Length of a clipped piece; the pieces are plain points, not `L.Point`. */
  function pieceLength(from, to) {
    return Math.hypot(to.x - from.x, to.y - from.y)
  }

  /**
   * The chevrons along the visible path. `clip` is the part of the plane the box
   * will show, so the spacing and the cap are measured on what is on screen.
   */
  function stampRow(context, points, color, clip) {
    const { minX, minY, maxX, maxY } = clip

    // Only what is inside the box takes part: length, step and stamps alike.
    const visible = []
    for (let i = 0; i + 1 < points.length; i += 1) {
      const piece = clipSegment(points[i], points[i + 1], minX, minY, maxX, maxY)
      if (piece) visible.push(piece)
    }
    if (!visible.length) return

    let total = 0
    for (const [from, to] of visible) total += pieceLength(from, to)
    if (total <= 0) return

    // The cap is the count on screen, so a long route never spends it off frame;
    // over the cap the chevrons spread rather than piling up.
    const step = Math.max(ROUTE_ARROW.spacing, total / ROUTE_ARROW.max)

    let travelled = 0
    let nextAt = step / 2

    for (const [from, to] of visible) {
      const length = pieceLength(from, to)
      if (length <= 0) continue

      const angle = Math.atan2(to.y - from.y, to.x - from.x)
      while (nextAt <= travelled + length) {
        const t = (nextAt - travelled) / length
        chevron(context, from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t, angle, color)
        nextAt += step
      }

      travelled += length
    }
  }

  function strokeLine(context, points, color) {
    context.beginPath()
    points.forEach((point, index) => {
      if (index === 0) context.moveTo(point.x, point.y)
      else context.lineTo(point.x, point.y)
    })
    context.strokeStyle = color
    context.globalAlpha = 0.55
    context.lineWidth = ROUTE_ARROW.lineWidth
    context.lineJoin = 'round'
    context.stroke()
    context.globalAlpha = 1
  }

  /**
   * Draws into one window of the plane, in pixels relative to where the box
   * begins now. `win` is `{ x, y, width, height }`; the whole canvas is that
   * window, so a zoom out can cover ground a plain draw never reached.
   */
  function paint(win, route, style, grounds) {
    sizeCanvas(win.width, win.height)

    // Both are given the same window and the same projection, so a dot and the
    // chevron beside it cannot land apart.
    const ratio = pixelRatio()
    for (const layer of layers) {
      layer.context.setTransform(ratio, 0, 0, ratio, 0, 0)
      layer.context.translate(-win.x, -win.y)
      layer.context.clearRect(win.x, win.y, win.width, win.height)
    }

    const container = map.getContainer()
    const color = strokeColor(container)
    paintGrounds(dots.context, grounds, color, ringColor(container))
    if (!route || route.length < 2) return

    const points = projected(route)
    if (style === 'line') strokeLine(row.context, points, color)
    else
      stampRow(row.context, points, color, {
        minX: win.x - DRAW_PAD,
        minY: win.y - DRAW_PAD,
        maxX: win.x + win.width + DRAW_PAD,
        maxY: win.y + win.height + DRAW_PAD,
      })
  }

  /** Draws the route in the style asked for, over the box as it stands now. */
  function draw(route, style = 'arrows', grounds = []) {
    lastDraw = { route: route ?? [], style, grounds }
    if (!width || !height) resize()
    drawnView = ''
    reposition()
    paint({ x: 0, y: 0, width, height }, lastDraw.route, style, lastDraw.grounds)
  }

  /**
   * Draws the view a zoom gesture is heading for, once per gesture. The canvas
   * is `leaflet-zoom-animated`, so Leaflet carries it through the movement with
   * the tiles; the transform below is the one `L.TileLayer._animateZoom` writes.
   * A zoom out scales the frame down, and the settled box then reads ground the
   * plain draw never covered - hence the window is widened to what the settled
   * box will show, and the clip follows it, so the count stays the count on
   * screen. `zoomend` resyncs, and nothing moves at that handover.
   * See docs/features/maps.md.
   */
  function drawForView(view) {
    const scale = map.getZoomScale(view.zoom, map.getZoom())
    if (!Number.isFinite(scale) || Math.abs(scale - 1) < 0.001) return

    const key = `${view.zoom}|${view.center.lat}|${view.center.lng}|${width}x${height}`
    if (key === drawnView) return
    drawnView = key

    // The ground at the box's own corner, and where it lands at the target.
    const { origin: containerOrigin, at: offset } = animatedProjection(
      map,
      map.containerPointToLatLng([0, 0]),
      view.zoom,
      view.center,
    )
    const shift = offset.subtract(containerOrigin)

    const minX = Math.min(0, -shift.x / scale)
    const minY = Math.min(0, -shift.y / scale)
    const maxX = Math.max(width, (width - shift.x) / scale)
    const maxY = Math.max(height, (height - shift.y) / scale)

    paint(
      { x: minX, y: minY, width: maxX - minX, height: maxY - minY },
      lastDraw.route,
      lastDraw.style,
      lastDraw.grounds,
    )

    // The movement is armed from the transform that shows the frame as it
    // stands, so the first animated frame is the one already on screen.
    const start = L.point(containerOrigin.x + minX, containerOrigin.y + minY)
    const end = L.point(offset.x + scale * minX, offset.y + scale * minY)
    for (const layer of layers) {
      layer.canvas.style.transition = 'none'
      L.DomUtil.setTransform(layer.canvas, start, 1)
    }
    // Laid out before the movement is armed, or the first frame starts nowhere.
    void row.canvas.offsetWidth
    for (const layer of layers) {
      layer.canvas.style.transition = ''
      L.DomUtil.setTransform(layer.canvas, end, scale)
    }
  }

  /** Under reduced motion the zoom is a jump, and `zoomend` says it all. */
  function onZoomAnim(event) {
    if (motionReduced() || !width || !height) return
    drawForView({ zoom: event.zoom, center: event.center })
  }

  map.on('zoomanim', onZoomAnim)

  return {
    resize,
    draw,
    remove: () => {
      map.off('zoomanim', onZoomAnim)
      for (const layer of layers) layer.canvas.remove()
    },
  }
}
