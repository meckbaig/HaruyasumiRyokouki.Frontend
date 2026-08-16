/**
 * Reading a similarity score.
 *
 * The server never cuts its answer off at a threshold. How alike is alike enough
 * depends on how narrow the subject is — "this exact torii" and "a shrine" want
 * wildly different lines — and there is no number that is right for both. So the
 * list always comes back full, sorted, and it is the person who decides where it
 * stopped being useful.
 *
 * That makes the score a working instrument rather than decoration, and it is
 * shown as a percentage: nobody reads 0.82 at a glance, everybody reads 82%.
 * The bands below are the ones observed in practice, and colouring by them turns
 * a column of numbers into a shape — the drop is usually visible before it is
 * read.
 */

/** Where the useful part usually ends. */
export const BANDS = [
  { id: 'series', from: 0.95 },
  { id: 'scene', from: 0.8 },
  { id: 'kind', from: 0.7 },
  { id: 'weak', from: -Infinity },
]

export function scoreBand(score) {
  const value = Number(score)
  if (!Number.isFinite(value)) return 'weak'
  return BANDS.find((band) => value >= band.from).id
}

/** `0.823` → `82`. Two decimals of a cosine are noise; whole percent is not. */
export function scorePercent(score) {
  const value = Number(score)
  if (!Number.isFinite(value)) return 0
  return Math.round(value * 100)
}

/**
 * Classes for the little pill on a thumbnail.
 *
 * Strongest wears the accent, the middle band the gold of the front-page mark,
 * and the tail goes grey and quiet — by the time a reader is down there the
 * numbers are telling them to stop, and shouting it would be noise.
 */
const BADGE = {
  series: 'bg-accent text-paper',
  scene: 'bg-star text-ink',
  kind: 'bg-ink/70 text-paper',
  weak: 'bg-ink/40 text-paper',
}

export function scoreBadgeClass(score) {
  return BADGE[scoreBand(score)]
}
