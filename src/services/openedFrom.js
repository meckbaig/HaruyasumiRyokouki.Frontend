/**
 * Which thumbnail the viewer was opened from.
 *
 * The viewer is handed a list and an index, never an element — so to fly the
 * picture out of the thing that was pressed it used to go looking for it, by the
 * file's id, across the whole document. That is wrong in every case where a file
 * appears on the page more than once, and it appears more than once often: the
 * front page hangs its wall twice so it can drift endlessly, the pending queue
 * shows the same photograph as the strip inside a day being written, and the
 * "similar" panel shows one that is very likely also in the grid behind it. The
 * search found *a* tile — usually the first — and the picture set off from
 * somewhere the reader was not looking.
 *
 * Nothing about that is guessable after the fact, so the answer is handed over
 * instead: whoever answers the press says which element it was, and the viewer
 * takes it as it opens. One value, alive for the length of one click, which is
 * exactly as long as the fact is true.
 */
let pending = null

/** Call from the handler that is about to open the viewer. */
export function markOpenedFrom(element) {
  pending = element instanceof Element ? element : null
}

/** Taken once, by the viewer, as it opens. Null when nobody said. */
export function takeOpenedFrom() {
  const element = pending
  pending = null
  return element?.isConnected ? element : null
}
