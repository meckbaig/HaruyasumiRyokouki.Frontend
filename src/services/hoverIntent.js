/**
 * The geometry of a hand's trajectory toward a card: the point of the card
 * nearest that hand, and the triangle standing for the ambiguous band between
 * the trigger and the card. Pure functions; the sampling lives in the composable.
 * See docs/features/rich-text-and-links.md.
 */

/**
 * How long the pointer rests on a trigger before the card is due, in ms. A hand
 * merely passing over the text has left by then, so a sweep across a note opens
 * nothing.
 */
export const OPEN_DELAY_MS = 50

/**
 * How long a hand that has stopped outside the card may stand there before the
 * card settles, in ms. It only ever starts once the hand has stopped moving, and
 * it is measured from the last movement that meant anything.
 */
export const POINTER_STOP_MS = 140

/** Below this a pointer counts as still, in px/s. A resting hand trembles slower. */
export const STOP_SPEED_PX_S = 40

/** How far the safe triangle reaches past the card's corners, in px. */
export const SAFE_MARGIN = 16

/** A rectangle is `{ left, right, top, bottom }`; a point is `{ x, y }`. */
export function insideRect(point, rect) {
  return (
    point.x >= rect.left &&
    point.x <= rect.right &&
    point.y >= rect.top &&
    point.y <= rect.bottom
  )
}

/** The point of the rectangle nearest a point outside it, or the point itself. */
export function closestPointOnRect(point, rect) {
  return {
    x: Math.min(Math.max(point.x, rect.left), rect.right),
    y: Math.min(Math.max(point.y, rect.top), rect.bottom),
  }
}

/**
 * The band between a hand and a card, as a triangle: apex where the hand left
 * the trigger, base the edge of the card facing it, reaching `margin` past each
 * corner. A hand inside is neither plainly coming nor plainly going, so the card
 * waits. Virtual - nothing is added to the DOM.
 */
export function safeTriangle(origin, rect, margin = SAFE_MARGIN) {
  const dx = (rect.left + rect.right) / 2 - origin.x
  const dy = (rect.top + rect.bottom) / 2 - origin.y
  // The near edge is the one the pointer faces, taken along its larger offset.
  if (Math.abs(dx) >= Math.abs(dy)) {
    const x = dx >= 0 ? rect.left - margin : rect.right + margin
    return [origin, { x, y: rect.top - margin }, { x, y: rect.bottom + margin }]
  }
  const y = dy >= 0 ? rect.top - margin : rect.bottom + margin
  return [origin, { x: rect.left - margin, y }, { x: rect.right + margin, y }]
}

/** Ray casting: is the point within the polygon? Used on a `safeTriangle`. */
export function insidePolygon(point, polygon) {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]
    const b = polygon[j]
    if (a.y > point.y === b.y > point.y) continue
    if (point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}

/** A hand's movement between two samples: its vector, and its speed in px/s. */
export function movement(prior, last) {
  const dx = last.x - prior.x
  const dy = last.y - prior.y
  const dt = Math.max(last.t - prior.t, 1)
  return { dx, dy, speed: (Math.hypot(dx, dy) / dt) * 1000 }
}

/**
 * Is this movement closing on the card? Judged against the **nearest point** of
 * the card rather than its centre, so a hand going to the far corner of a wide
 * card still reads as coming toward it.
 */
export function headingToCard(point, move, rect) {
  const closest = closestPointOnRect(point, rect)
  return move.dx * (closest.x - point.x) + move.dy * (closest.y - point.y) > 0
}
