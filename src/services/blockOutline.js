/**
 * The outline around a block of singled-out tiles, as an SVG path.
 *
 * One stroked centreline, not a rectangle or a set of side bars: a stroke is a
 * uniform band whose corners cannot come apart, so the arcs join the straight
 * runs exactly and the inner and outer corners share one radius.
 * See docs/features/media-grid-and-selection.md.
 */

/** The drawn band's width, the same as the editor's selection ring. */
const BAND = 2
/** Corner radius of the centreline; the band's outer edge is this plus BAND/2. */
const CORNER = 9

/* Screen directions: 0 = +x, 1 = +y, 2 = -x, 3 = -y. */
const DX = [1, 0, -1, 0]
const DY = [0, 1, 0, -1]
/* Right-hand normal of each direction, pointing into the block the loop wraps. */
const NX = [0, -1, 0, 1]
const NY = [1, 0, -1, 0]

const fmt = (value) => Math.round(value * 100) / 100

/** Just the direction of travel between two axis-aligned points. */
function dirOf(from, to) {
  if (to.x > from.x) return 0
  if (to.y > from.y) return 1
  if (to.x < from.x) return 2
  return 3
}

/** Distinct column lefts or row tops, tolerating sub-pixel drift in the rects. */
function cluster(values, tolerance = 2) {
  const sorted = [...values].sort((a, b) => a - b)
  const reps = []
  for (const value of sorted) {
    if (reps.length && value - reps[reps.length - 1] <= tolerance) continue
    reps.push(value)
  }
  return reps
}

/** A run of collinear vertices is one edge; drop the joints between them. */
function mergeStraight(points) {
  const out = [...points]
  let changed = true
  while (changed && out.length > 2) {
    changed = false
    for (let i = 0; i < out.length; i += 1) {
      const prev = out[(i - 1 + out.length) % out.length]
      const here = out[i]
      const next = out[(i + 1) % out.length]
      if (dirOf(prev, here) === dirOf(here, next)) {
        out.splice(i, 1)
        changed = true
        break
      }
    }
  }
  return out
}

/**
 * Rounds a closed rectilinear loop into path data.
 *
 * Each edge is moved half a band inwards, then every corner is trimmed and
 * joined by an arc whose centre sits on the inside of the turn - the same
 * construction for a convex and a reflex corner, so the radius is identical.
 */
function roundLoop(nodes, toX, toY) {
  let points = nodes.map(({ i, j }) => ({ x: toX(i), y: toY(j) }))
  points = mergeStraight(points)
  if (points.length < 4) return ''

  const count = points.length
  const dirs = points.map((point, k) => dirOf(point, points[(k + 1) % count]))

  /* The offset edges, then their crossings: the inset polygon's vertices. */
  const lines = points.map((point, k) => {
    const dir = dirs[k]
    return {
      vertical: dir === 1 || dir === 3,
      x: point.x + NX[dir] * (BAND / 2),
      y: point.y + NY[dir] * (BAND / 2),
    }
  })
  const inner = points.map((point, k) => {
    const prev = lines[(k - 1 + count) % count]
    const next = lines[k]
    return { x: prev.vertical ? prev.x : next.x, y: prev.vertical ? next.y : prev.y }
  })

  const start = []
  const end = []
  const sweep = []
  for (let k = 0; k < count; k += 1) {
    const point = inner[k]
    const dirIn = dirOf(inner[(k - 1 + count) % count], point)
    const dirOut = dirOf(point, inner[(k + 1) % count])
    const turn = (dirOut - dirIn + 4) % 4
    /* A right turn curves inwards, a reflex one outwards; hence the sign. */
    const side = turn === 1 ? 1 : -1
    const cx = point.x + side * CORNER * (NX[dirIn] + NX[dirOut])
    const cy = point.y + side * CORNER * (NY[dirIn] + NY[dirOut])
    start.push({ x: cx - side * NX[dirIn] * CORNER, y: cy - side * NY[dirIn] * CORNER })
    end.push({ x: cx - side * NX[dirOut] * CORNER, y: cy - side * NY[dirOut] * CORNER })
    sweep.push(side > 0 ? 1 : 0)
  }

  let path = `M${fmt(start[0].x)} ${fmt(start[0].y)}`
  for (let k = 0; k < count; k += 1) {
    path += `A${CORNER} ${CORNER} 0 0 ${sweep[k]} ${fmt(end[k].x)} ${fmt(end[k].y)}`
    const next = start[(k + 1) % count]
    path += `L${fmt(next.x)} ${fmt(next.y)}`
  }
  return `${path}Z`
}

/**
 * The path for everything singled out, or `''` when nothing is.
 *
 * `tiles` is every laid-out tile of the wall, each `{ selected, rect }` in
 * container coordinates - the whole lattice is needed so a gap between two
 * singled-out columns is not closed up. Tiles are read as cells of a grid; the
 * boundary between a cell and an empty neighbour is a lattice line at half a
 * gap from the tile, and the loop that wraps the selected cells becomes the
 * centreline.
 */
export function blockOutlinePath(tiles, gap) {
  if (!tiles.some((tile) => tile.selected)) return ''

  const half = (Number.isFinite(gap) && gap > 0 ? gap : 8) / 2
  const lefts = cluster(tiles.map((tile) => tile.rect.left))
  const tops = cluster(tiles.map((tile) => tile.rect.top))
  const width = Math.max(...tiles.map((tile) => tile.rect.width))
  const height = Math.max(...tiles.map((tile) => tile.rect.height))
  const ncols = lefts.length
  const nrows = tops.length
  const toX = (i) => (i < ncols ? lefts[i] - half : lefts[ncols - 1] + width + half)
  const toY = (j) => (j < nrows ? tops[j] - half : tops[nrows - 1] + height + half)

  const at = (x, list) => list.findIndex((value) => Math.abs(value - x) <= 2)
  const cells = new Set()
  for (const tile of tiles) {
    if (!tile.selected) continue
    const c = at(tile.rect.left, lefts)
    const r = at(tile.rect.top, tops)
    if (c >= 0 && r >= 0) cells.add(`${c},${r}`)
  }
  const has = (c, r) => cells.has(`${c},${r}`)

  /* Boundary edges, directed so the block is always on the right. */
  const outgoing = new Map()
  const edges = []
  const addEdge = (ci, cj, ni, nj, dir) => {
    const edge = { from: `${ci},${cj}`, to: `${ni},${nj}`, i: ci, j: cj, dir, key: `${ci},${cj}>${ni},${nj}` }
    edges.push(edge)
    const list = outgoing.get(edge.from) ?? []
    list.push(edge)
    outgoing.set(edge.from, list)
  }
  for (let c = 0; c < ncols; c += 1) {
    for (let r = 0; r < nrows; r += 1) {
      if (!has(c, r)) continue
      if (!has(c, r - 1)) addEdge(c, r, c + 1, r, 0)
      if (!has(c + 1, r)) addEdge(c + 1, r, c + 1, r + 1, 1)
      if (!has(c, r + 1)) addEdge(c + 1, r + 1, c, r + 1, 2)
      if (!has(c - 1, r)) addEdge(c, r + 1, c, r, 3)
    }
  }

  /*
    Follow the boundary into loops. Where two blocks meet only at a corner the
    node has two ways on; the sharpest right turn keeps each loop on its own
    block, the way a hand on a wall would.
  */
  const turn = (from, to) => (to - from + 4) % 4
  const order = [1, 0, 3, 2]
  const used = new Set()
  const loops = []
  for (const seed of edges) {
    if (used.has(seed.key)) continue
    const loop = []
    let edge = seed
    let closed = false
    for (let guard = 0; guard <= edges.length; guard += 1) {
      loop.push({ i: edge.i, j: edge.j })
      used.add(edge.key)
      if (edge.to === seed.from) {
        closed = true
        break
      }
      const options = (outgoing.get(edge.to) ?? []).filter((next) => !used.has(next.key))
      if (!options.length) break
      options.sort((a, b) => order.indexOf(turn(edge.dir, a.dir)) - order.indexOf(turn(edge.dir, b.dir)))
      edge = options[0]
    }
    if (closed && loop.length >= 4) loops.push(loop)
  }

  return loops
    .map((loop) => roundLoop(loop, toX, toY))
    .filter(Boolean)
    .join(' ')
}
