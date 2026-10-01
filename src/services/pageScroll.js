/**
 * The scroll offset that keeps a box on screen while its height changes: the
 * growth is split by the box's own place in the view - half above and half below
 * when centred, all above when its bottom rests on the fold, none when its top
 * rests on the chrome. A box pushed past an edge is aligned to it. See maps.md.
 */
export function followBoxScroll({ scroll, top, height, nextHeight, viewport, topInset, bottomInset }) {
  const growth = nextHeight - height
  // The free space above and below the box, measured against the screen.
  const above = top - scroll
  const below = viewport - (top + height - scroll)
  const share = above + below > 0 ? above / (above + below) : 0.5
  const target = scroll + growth * share
  // Crossing an edge: align so the box still lies between the chrome and the fold.
  const highest = top - topInset
  const lowest = top + nextHeight - (viewport - bottomInset)
  return Math.min(highest, Math.max(lowest, target))
}
