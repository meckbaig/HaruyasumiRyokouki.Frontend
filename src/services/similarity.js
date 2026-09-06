/**
 * Reading a similarity score. The server never cuts its answer off at a
 * threshold, so these bands are a reading aid and not a filter.
 * See docs/features/similarity.md.
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

/** Classes for the little pill on a thumbnail. See docs/features/similarity.md. */
const BADGE = {
  series: 'bg-accent text-paper',
  scene: 'bg-star text-ink',
  kind: 'bg-ink/70 text-paper',
  weak: 'bg-ink/40 text-paper',
}

export function scoreBadgeClass(score) {
  return BADGE[scoreBand(score)]
}
