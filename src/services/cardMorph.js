/**
 * The unfold of a map pin into its preview. The **pin's rectangle is the start**:
 * the frame is already the pin at the first painted frame, and it then grows in
 * width and height while the picture keeps its top edge - the footer strip opens
 * underneath because the frame clips what does not fit yet.
 *
 * Layout properties, not a transform: a scale would move the picture and shrink
 * the text, and the point is that the text appears rather than stretches. This is
 * one element over a tap, so the layout cost is the one the scale paid before.
 * See docs/features/maps.md.
 */
import { motionReduced } from './motion'

/** The beat, shared with the stylesheet's own card transition. */
export const CARD_MORPH_MS = 260
const EASING = 'cubic-bezier(0.2, 0.9, 0.3, 1)'

/**
 * Plays the morph and resolves when it settles.
 *
 * @param {object} parts `frame`, `inner`, `photo` and `footer` elements, the
 *   last three optional.
 * @param {object} from  `{ width, height, photoWidth, photoHeight, pad, border, radius }`.
 * @param {object} to    The same, measured off the laid-out card.
 * @param {boolean} reverse Plays the close instead of the open.
 */
export function playCardMorph({ frame, inner, photo, footer, from, to, reverse = false }) {
  if (!frame || motionReduced()) return Promise.resolve()

  const start = reverse ? to : from
  const end = reverse ? from : to
  const options = { duration: CARD_MORPH_MS, easing: EASING, fill: 'both' }

  const animations = [
    frame.animate(
      [
        { width: `${start.width}px`, height: `${start.height}px` },
        { width: `${end.width}px`, height: `${end.height}px` },
      ],
      options,
    ),
  ]

  if (inner) {
    /*
      The pin's own inset too. Left to its own transition the border was still
      the card's 1px when the fold released, so the last frame sat two pixels
      past the pin. See docs/features/maps.md.
    */
    animations.push(
      inner.animate(
        [
          { padding: `${start.pad}px`, borderWidth: `${start.border}px` },
          { padding: `${end.pad}px`, borderWidth: `${end.border}px` },
        ],
        options,
      ),
    )
  }

  if (photo) {
    /*
      Both dimensions. The crop lives in the picture's own box, so a ratio left
      to `aspect-ratio` flips in one frame and the picture jumps out of its
      frame; driving the width too makes the crop follow the fold.
      See docs/features/maps.md.
    */
    animations.push(
      photo.animate(
        [
          {
            width: `${start.photoWidth}px`,
            height: `${start.photoHeight}px`,
            borderRadius: `${start.radius}px`,
          },
          {
            width: `${end.photoWidth}px`,
            height: `${end.photoHeight}px`,
            borderRadius: `${end.radius}px`,
          },
        ],
        options,
      ),
    )
  }

  if (footer) {
    // The strip arrives once the box has opened far enough to hold it.
    animations.push(
      footer.animate([{ opacity: reverse ? 1 : 0 }, { opacity: reverse ? 0 : 1 }], {
        ...options,
        delay: reverse ? 0 : CARD_MORPH_MS * 0.35,
      }),
    )
  }

  // `cancel` releases the fill, so the stylesheet's own values come back and the
  // card is a normal laid-out box afterwards.
  return Promise.all(animations.map((animation) => animation.finished.catch(() => {}))).then(
    () => animations.forEach((animation) => animation.cancel()),
  )
}
