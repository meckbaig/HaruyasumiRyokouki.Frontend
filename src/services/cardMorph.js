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
 * @param {object} parts `frame`, `photo` and `footer` elements, any of the last
 *   two optional.
 * @param {object} from  `{ width, height, photoHeight }` - the pin's rectangle.
 * @param {object} to    The same three, measured off the laid-out card.
 * @param {boolean} reverse Plays the close instead of the open.
 */
export function playCardMorph({ frame, photo, footer, from, to, reverse = false }) {
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

  if (photo) {
    animations.push(
      photo.animate(
        [{ height: `${start.photoHeight}px` }, { height: `${end.photoHeight}px` }],
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
