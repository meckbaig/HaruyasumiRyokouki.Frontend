import { ref } from 'vue'
import { isExplicitCovered, isExplicitRevealed, revealExplicit } from '@/services/explicit'

/*
  The reactive wrapper over the shared uncovered set in services/explicit.js. The
  state itself is framework-free, so the map engine reads the same ids; this only
  adds the signal a component needs to re-render on a reveal.
  See docs/features/explicit-content.md.
*/
const version = ref(0)

export function useExplicitReveal() {
  /** Whether this file has been uncovered. */
  function isRevealed(media) {
    return isExplicitRevealed(media)
  }

  /** Uncovering a file: the only way its main picture comes out from behind. */
  function reveal(media) {
    revealExplicit(media)
    version.value += 1
  }

  /** An 18+ file whose main picture must stay dark until the reader uncovers it. */
  function isCovered(media) {
    // Read the signal so a computed or a render tracks a reveal; the answer
    // itself comes from the shared set.
    void version.value
    return isExplicitCovered(media)
  }

  return { isRevealed, reveal, isCovered, revealVersion: version }
}
