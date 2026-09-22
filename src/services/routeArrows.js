/**
 * The route between two pins, drawn onto **canvases** instead of a marker per
 * chevron - the way a game tiles a texture along a path. A canvas draws only what
 * the box shows and costs one element.
 *
 * Two of them, at two z-indexes over the map box: the chevrons under the grounds
 * of a pile's members, because a dot has to be read over the row it terminates.
 * Both share one projection and one redraw, so the row and its terminals cannot
 * drift apart. See docs/features/maps.md.
 */
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

/*
  How the route between two pins is drawn. `arrows` is the row of chevrons, which
  says which way the day went; `line` is the plain solid line, which only says
  that the two are on the same walk. One constant, so the two can be compared by
  hand. See docs/features/maps.md.
*/
export const ROUTE_STYLE = 'arrows'

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
 * a `move` redraws once per frame, so the row can never sit on a stale view.
 * Both are cheap because only the visible stretch is ever stamped.
 * See docs/features/maps.md.
 */
export function createRouteCanvas(map) {
  const container = map.getContainer()

  /** One canvas, absolutely placed over the box; the z-index is the stylesheet's. */
  function makeLayer(className) {
    const canvas = document.createElement('canvas')
    canvas.className = `trip-route-canvas ${className}`
    container.appendChild(canvas)
    return { canvas, context: canvas.getContext('2d') }
  }

  const row = makeLayer('trip-route-row')
  const dots = makeLayer('trip-route-dots')
  const layers = [row, dots]

  let width = 0
  let height = 0
  let boxWidth = 0
  let boxHeight = 0
  /** What the last `draw` was asked for, so a `move` can redraw it. */
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

  /** Sizes the canvas to the box; the canvases already begin at its corner. */
  function resize() {
    width = container.clientWidth
    height = container.clientHeight
    sizeCanvas(width, height)
  }

  /** Screen coordinates. Our data is `[lat, lng]`; MapLibre wants `[lng, lat]`. */
  function project(latlng) {
    return map.project([latlng[1], latlng[0]])
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

  /** Length of a clipped piece; the pieces are plain points, not map points. */
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

  /** Paints both canvases for the box as it stands now. */
  function paint(route, style, grounds) {
    if (!width || !height) resize()
    const ratio = pixelRatio()
    for (const layer of layers) {
      layer.context.setTransform(ratio, 0, 0, ratio, 0, 0)
      layer.context.clearRect(0, 0, width, height)
    }

    paintGrounds(dots.context, grounds, strokeColor(container), ringColor(container))
    if (!route || route.length < 2) return

    const points = route.map(project)
    if (style === 'line') strokeLine(row.context, points, strokeColor(container))
    else
      stampRow(row.context, points, strokeColor(container), {
        minX: -DRAW_PAD,
        minY: -DRAW_PAD,
        maxX: width + DRAW_PAD,
        maxY: height + DRAW_PAD,
      })
  }

  /** Repaints the content last asked for, over the view now on screen. */
  function redraw() {
    paint(lastDraw.route, lastDraw.style, lastDraw.grounds)
  }

  /** Draws the route in the style asked for, over the box as it stands now. */
  function draw(route, style = 'arrows', grounds = []) {
    lastDraw = { route: route ?? [], style, grounds }
    redraw()
  }

  /* MapLibre fires `move` through the whole gesture, so a redraw per frame keeps
     the row on the tiles with no separate zoom path. A burst costs one frame. */
  let frame = 0

  function onMove() {
    if (frame) return
    frame = requestAnimationFrame(() => {
      frame = 0
      redraw()
    })
  }

  function onResize() {
    resize()
    redraw()
  }

  map.on('move', onMove)
  map.on('resize', onResize)

  return {
    resize: onResize,
    draw,
    remove: () => {
      if (frame) cancelAnimationFrame(frame)
      map.off('move', onMove)
      map.off('resize', onResize)
      for (const layer of layers) layer.canvas.remove()
    },
  }
}
