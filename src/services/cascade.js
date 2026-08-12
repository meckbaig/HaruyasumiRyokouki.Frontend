/**
 * Stagger for a list that arrives in a cascade — see `.cascade-item` in
 * `assets/main.css`, which is what actually draws it.
 *
 * The delay stops climbing after a dozen entries. A page of a hundred
 * thumbnails would otherwise leave the last of them waiting several seconds for
 * an effect meant to last a moment, and everything past the fold is being
 * scrolled to anyway — by the time a reader arrives there, it has long since
 * played.
 */
const STEP_MS = 35
const MAX_STEPS = 12

/** Inline style carrying an entry's place in the cascade. */
export function cascadeDelay(index) {
  return { '--cascade-delay': `${Math.min(index, MAX_STEPS) * STEP_MS}ms` }
}
