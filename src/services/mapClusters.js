/**
 * Grouping points by distance in projected pixels, shared by the pins and the
 * route dots. Pure and free of any map library, so the two cannot drift into
 * separate clusterings. The distance is to a cluster's running mean, never to a
 * member, so a chain of close points cannot drag a far one in. See docs/features/maps.md.
 */

/** The default merge distance, in screen pixels: about two thirds of a pin. */
export const CLUSTER_CELL = 30
/** How much the cell grows when the budget is exceeded; the smallest that fits wins. */
export const CLUSTER_STEP = 10
/** A ceiling, so a pile never swallows the map. */
export const CLUSTER_CELL_MAX = 240

/* The dots carry figures of their own: far more numerous than the pins, each
   standing for a single ground, so a smaller cell and a much lower ceiling. */
/** The dots' default merge distance, in screen pixels. */
export const DOT_CELL = 5
/** How much the dots' cell grows when their budget is exceeded. */
export const DOT_STEP = 5
/** The dots' ceiling, so a cluster never swallows a stretch of route. */
export const DOT_CELL_MAX = 50

/**
 * Clusters entries by distance to a cluster's running mean. `entries` are
 * `{ index, point: { x, y } }`; the result is a list of `index` lists.
 */
export function clusterByCell(entries, cell) {
  const clusters = []
  const grid = new Map()

  for (const entry of entries) {
    const x = entry.point.x
    const y = entry.point.y
    const cx = Math.floor(x / cell)
    const cy = Math.floor(y / cell)

    let best = null
    let bestDistance = Infinity
    for (let gx = cx - 1; gx <= cx + 1; gx += 1) {
      for (let gy = cy - 1; gy <= cy + 1; gy += 1) {
        for (const cluster of grid.get(`${gx},${gy}`) ?? []) {
          const distance = Math.hypot(cluster.x - x, cluster.y - y)
          if (distance <= cell && distance < bestDistance) {
            best = cluster
            bestDistance = distance
          }
        }
      }
    }

    if (best) {
      best.indices.push(entry.index)
      // The running mean of the members is the centroid the next point is
      // measured against.
      best.x += (x - best.x) / best.indices.length
      best.y += (y - best.y) / best.indices.length
      continue
    }

    const cluster = { indices: [entry.index], x, y }
    clusters.push(cluster)
    const key = `${cx},${cy}`
    const bucket = grid.get(key)
    // Pushed in place: a fresh array per insert is quadratic in a full bucket.
    if (bucket) bucket.push(cluster)
    else grid.set(key, [cluster])
  }

  return clusters.map((cluster) => cluster.indices)
}

/**
 * The groups at the smallest cell that keeps what the caller counts within
 * `budget`. `count` is handed the candidate groups and returns how many the
 * caller would draw: the box's own groups for the pins, the box's own clusters
 * for the dots. `startCell`, `step` and `maxCell` are the caller's own figures,
 * defaulting to the pins'.
 */
export function clusterWithinBudget(
  entries,
  {
    budget,
    count,
    startCell = CLUSTER_CELL,
    step = CLUSTER_STEP,
    maxCell = CLUSTER_CELL_MAX,
  },
) {
  let cell = startCell
  let groups = clusterByCell(entries, cell)
  let guard = 0
  while (count(groups) > budget && cell < maxCell && guard < 40) {
    cell = Math.min(maxCell, cell + step)
    groups = clusterByCell(entries, cell)
    guard += 1
  }
  return { groups, cell }
}
