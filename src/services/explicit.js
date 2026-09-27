/**
 * The 18+ mark and the session's uncovered set. The API carries no explicit
 * column: the site tags such files `18+` (slug `18+`, id 800). Every list sees
 * the tag as `TagPublicDto { slug, value }`. See docs/features/explicit-content.md.
 */
export const EXPLICIT_SLUG = '18+'

/** Whether a tag is the 18+ one. Matched on the slug - the caption is translated. */
export function isExplicitTag(tag) {
  return tag?.slug === EXPLICIT_SLUG
}

/** Whether a media file, in either model shape, carries the 18+ tag. */
export function isExplicit(media) {
  return Array.isArray(media?.tags) && media.tags.some(isExplicitTag)
}

/*
  Ids the reader has uncovered, for this session only. Plain state, not a store,
  so a framework-free reader (the map engine) sees the very set the components do.
  Never persisted. See docs/features/explicit-content.md.
*/
const revealed = new Set()

/** Uncovering a file: the only way its main picture comes out from behind. */
export function revealExplicit(media) {
  if (media?.id != null) revealed.add(media.id)
}

/** Whether this file has been uncovered. */
export function isExplicitRevealed(media) {
  return media?.id != null && revealed.has(media.id)
}

/** An 18+ file whose main picture must stay dark until the reader uncovers it. */
export function isExplicitCovered(media) {
  return isExplicit(media) && !isExplicitRevealed(media)
}
