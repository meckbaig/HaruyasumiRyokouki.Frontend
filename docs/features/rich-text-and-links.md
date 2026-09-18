# Rich text in notes and descriptions

A day note and a media description are stored as plain strings, but they carry a small
markup: links, and a file of the page referenced by its id. This covers the parser, the
renderer, the hover card, the editor field that highlights the markup, and the way back from
the viewer to the text.

## Files

| File | Role |
| --- | --- |
| `src/services/richText.js` | `parseRichText` (tokens with `ids` and `raw`), `linkLabel`, editor template builders. |
| `src/components/common/RichText.vue` | Token renderer; says which reference a card belongs to and emits references upward. |
| `src/components/common/MediaHoverCard.vue` | The card: a carousel of every file the reference names, with a bar and go-to-media. |
| `src/components/map/MapMediaCard.vue` | The card's sibling over a map pin - its own doc: [maps.md](maps.md). |
| `src/services/hoverIntent.js` | The hover thresholds, and the geometry of a hand's trajectory: the nearest point of the card, the safe triangle, the polygon test. Pure functions. |
| `src/composables/useHoverIntent.js` | When a card opens and closes: hover in and out, arrival at the card, a hand stopped outside it, a card shown by hand. |
| `src/components/layout/SteppedScrollbar.vue` | The card's bar: one record per step, draggable, drawn like the page's own. |
| `src/components/common/RichTextArea.vue` | The editor field: a textarea with the markup highlighted behind it, and a bubble for a marked run. |
| `src/services/textAnchor.js` | The remembered reference, `anchorSelector`, `returnToTextAnchor`. |
| `src/services/mediaPick.js` | The fleeting mode where a tile click fills a media template. |
| `src/composables/useTemplateInsert.js` | `insertTemplate` - writes a template at a caret and returns its range. |
| `src/views/DayView.vue` | Renders the note; decides the anchor; owns the viewer and the return. |
| `src/components/media/MediaLightbox.vue` | The return button and the description as rich text. |
| `src/components/editor/DayEditForm.vue` | Note field, template buttons, media picking. |
| `src/components/editor/MediaEditDialog.vue` | Description field and its template buttons. |
| `src/assets/main.css` | `.rich-link`, `.rich-media`, `.media-hover-card`, `.rich-editor*`, `.text-anchor-flash`. |

## The markup

| Written | Renders as | Note |
| --- | --- | --- |
| `[media=5]Caption[/media]` | A chip labelled "Caption" | A file resolved against the page's own list. |
| `[media=5,7,9]Caption[/media]` | One chip for three files | Ids split by commas, **no spaces**; the chip carries them all. A space would let a caption be read as a second id. |
| `[url=https://...]Name[/url]` | A link labelled "Name" | Opens in a new tab. |
| `https://...` alone | A link | Labelled by `linkLabel`. |

`linkLabel` keeps the host without `www.`, then the last path segment, the middle replaced
by an ellipsis: `https://www.youtube.com/live/KwDqqZ9anRc?si=...` becomes
`youtube.com/.../KwDqqZ9anRc`. A single-segment path keeps that segment; query and fragment
are dropped. A trailing comma, period or bracket belongs to the sentence and is left as text
after the link.

A link and a chip are inline text: they wrap and break with the words around them, so a
long label never runs past the page edge on a phone. A chip is a `<span role="button"
tabindex="0">`, not a `<button>`: a button is laid out atomically, so its label can never
wrap and the whole chip is pushed to the next line. Both also carry
`overflow-wrap: anywhere`, since a label may hold no space to break at.

## Tokens, not HTML

`parseRichText` returns ordered tokens (`text`, `media`, `link`). Each also carries `raw`,
the exact source it came from: the renderer ignores it, the editor paints it. Nothing is
concatenated into an HTML string and `v-html` is never used, so a note cannot inject markup,
and the editor's highlight layer is guaranteed to show the same characters as the field.

## The hover card

Pointing at a chip shows the card to its right, and so does a tap on a touch screen: a 160px
square thumbnail on the left with the clock stamped onto its bottom corner the way a day's
tiles stamp theirs, and the title and description on the right. **The date is deliberately
absent** - the card is only ever
shown over a day page, so the day is a fact the reader already has. Links are not chipped
this way; only media references have a card.

### Every file of a reference

A chip may name several files, so the card is a carousel rather than a single picture.

- **The records are a vertical strip, not a fade.** They are stacked in a track the viewport
  shows one of, and a step moves the track by one record's height - a record slides out over
  the card's edge while the next arrives behind it, the way the full-screen viewer turns a
  page. State between two records is never cross-faded: the movement is the point.
- **The strip is clipped by the card itself**, not by an inset inside it: the viewport
  cancels the card's padding, so a record arrives from the card's edge rather than from ten
  pixels inside it.
- **The step takes `SLIDE_MS`**, the same constant the viewer's own turn uses
  (`src/services/motion.js`), so the two movements read as one gesture.
- **A wheel notch is one record.** `WHEEL_NOTCH` (`24`) of accumulated delta turns the list,
  and `STEP_LOCK_MS` (`220`) keeps a trackpad's stream of tiny deltas from running through
  it. A swipe on a touch screen does the same, committing past `SWIPE_COMMIT` (`30`); the
  viewport is `touch-action: none`, so the gesture is the card's and not the page's.
- **A `1/N` badge sits bottom-left**, in the same stamp as the clock but the opposite
  corner, so the two never sit on each other. The clock stays bottom-right. A video's
  play mark follows the badge in the same row, the way a grid tile marks its own.
- **Our own scrollbar is drawn on the card** by `SteppedScrollbar`, the same shape as the
  page's bar and placed by the card through its class. Behind the thumb runs a **channel
  for the whole range**, so how many records a reference names is readable at a glance; a
  thumb the height of one record moves down by the records before it. It can be
  **dragged**, and stays *stepped* under the hand: the pointer picks a record, not a pixel,
  and the thumb's own transition carries it between the steps, so it never teleports.
- **The thumbnail is `MediaThumb`**, the two-stage miniature and preview every other wall
  uses, not a single `<img>` on `preview || miniature`.
- **Opening full screen does not fly out of this card.** Its 160px picture is a
  stand-in, so the open marks "no source" and the viewer plays its plain fade,
  never searching for a tile. See [media-viewer.md](media-viewer.md).
- **The first record's box, then a group.** A reference that resolves to nothing shows the
  missing panel; a reference where only some files are missing still steps through them, a
  null slide saying so.

- **The card is placed in document coordinates and lives on `<body>`.** Scroll offsets are
  added to the chip's viewport rectangle, so the card scrolls with the page instead of
  hanging over it. It flips to the left of the chip when the right would run off screen.
- **The card fades in and out.** A `Transition` named `hover-card` wraps it. It is a hint,
  not a dialog, so it only fades - no rise, no drift. The leaving card stops answering the
  pointer at once, so it cannot swallow the hand on the way back to the chip.
- **A swap is played, never teleported.** The card is keyed by the reference, so when
  another one arrives while this leaves, the transition has two elements to play at once:
  the old fades out where it stood while the new fades in where the hand has gone. That is
  the card changed by hand as well - a tap on a second reference on a touch screen - which
  otherwise repainted the same element's content in place.
- **The hand's trajectory decides, not a timeout.** Leaving the chip starts no clock: the
  pointer is followed, its position sampled at most once a frame, and the card is kept only
  while the hand closes on it. Whether the reader meant it is never a matter of waiting.
- **Closing is judged against the nearest point of the card**, not its centre, so a hand
  going to a far corner of a wide card still reads as coming toward it.
- **A virtual safe triangle spans the gap.** Its apex is where the hand left the chip, its
  base the card's near edge, reaching a margin past each corner. A hand inside it is neither
  plainly coming nor plainly going, so the card waits. Nothing is added to the DOM.
- **A hand at rest is not a hand arriving.** Movements under `STOP_SPEED_PX_S` (`40px/s`)
  are the tremble of a resting hand, not a direction. A card is given `POINTER_STOP_MS`
  (`140ms`) from the last movement that meant anything, and that window is what decides a
  hand which has stopped sending moves at all - as a hand does when it stops. Long enough
  not to punish a pause, short enough that nothing hangs in the gap.
- **Arriving at the card ends the analysis.** Entering it stops every timer; leaving it
  hands the judgement back to the trajectory.
- **A reference crossed on the way does not take the card over.** While the hand is in
  transit, one it passes over is only remembered: the card it is heading for stands until
  the hand comes to rest on the other, and that rest is the same window as the stop. So a
  hand sweeping past the other references in the line changes nothing, while a hand that
  stops on one gets that one's card.
- **The card is due after a short wait.** `OPEN_DELAY_MS` (`50ms`): a hand merely passing
  over a reference has left by then and the card is never painted, which is what keeps a
  sweep across the text from opening cards. A card a finger or a keyboard has already
  opened swaps at once, since no hand is following it.
- **A cross closes it by hand**, and so does a press outside a card that a tap or a keyboard
  focus opened: that card has no hand following it to keep it open.
- **A mouse hovers; a touch taps.** A touch reports an enter and a focus too, and answering
  either put the card under the finger, where the click a browser invents from the tap then
  landed on the card's own picture. So the card opens on a mouse's enter or on a keyboard
  focus, and on a touch screen it opens from the tap's click. The trajectory is a mouse's as
  well: a tapped card has nothing hovering to keep it open, so it goes on a press anywhere
  outside it, or on the cross.
- **A tapped card swallows the click from before it was open.** A card shown by a touch
  answers nothing for `GHOST_CLICK_MS` (`services/ghostClick.js`), the same window the grid
  and the viewer use for that invented click.
- **The card carries a way to the file's tile.** It makes the action a mouse click on the
  text makes, offered on a touch screen where the tap shows this card instead, and left on a
  mouse where it repeats what the text already does.
- **A missing file still opens a card.** The id did not resolve against the page's list, so
  the card says so and shows the reference's own text.

## The way back

A mouse click on a chip singles the files out with `?i=<id,id,...>` and scrolls to the first
of their tiles; the thumbnail in the card opens one full screen. On a touch screen the tap
shows the card, and the card's own button singles the files out. `RichText` only reports what
was followed - it emits `{ mediaId, ids, index }`, `mediaId` the file the reference is
anchored by, `ids` every file it named, and `index` the occurrence, since one file may be
referenced more than once - and the page decides what to do with it.

**The address carries every id, not just the first**, so the outline and the link agree and a
copied address names the whole block.

- **A way back is kept when the jump scrolls and carries the line out of the band a reader
  reads.** `followLeavesLine` works out where the block will land (the page may run out of
  room first) and where the line ends up after that scroll; a nudge that leaves the line in
  view only outlines the file, and neither the viewer's arrow nor the page's own button is
  offered.
- **The dim outlasts the glide.** Following a reference dims the rest of the wall
  (`emphasis` in `DayView`); on a phone a block far down the page took longer to reach than
  the dim's fixed window, so it lifted before the block arrived. Every scroll while the dim
  stands pushes its end back, and it is spent on arrival rather than en route.
  See [media-grid-and-selection.md](media-grid-and-selection.md).
- **Only a departure pushes a history entry.** A follow that scrolls calls `departFromText`,
  which records the anchor and pushes `?i=<ids>`; that entry is the note's, and the browser's
  Back returns to it. Opening and paging the viewer **replace** the same entry, so a picture
  turned to never buries the note under one more step.
- **The way back is kept until the line is readable again.** Closing the viewer, paging, or a
  press elsewhere must not take it away; a settled scroll on which the reference reaches the
  band a reader actually reads - clear of the sticky header and of the bottom edge,
  `referenceReadable` - is the one thing that spends it. A word peeking at the very top is
  not the line being back.
- **The way back also stands in the page.** While a line is remembered, a translucent round
  button sits bottom-right with the viewer's own arrow and does the same thing, so the way up
  is not reachable only from inside the full-screen viewer.
- **The browser's Back is the same way back as the arrow.** A `popstate` onto an entry with
  no `o=1` closes the viewer, and if an anchor is remembered that step also scrolls to the
  reference. A step that does ask for the viewer leaves it open. `onPopState` holds off the
  writes it would otherwise cause - the close's own write on that step, and the link's own
  scroll while the note is being restored - because either would fight the step itself.
- **The arrow stays while paging.** The anchor names a place in the text, not the picture it
  opened, so paging away does not lose it.
- **Returning scrolls, lights and clears.** `returnToTextAnchor` scrolls the chip to the
  middle, adds `.text-anchor-flash` for 1.6s, and drops the anchor - after which the arrow is
  gone from the UI. The flash is a static background, not an animation, so it survives
  reduced motion.
- **The anchor is cleared when the day changes and on unmount**, because in each case it
  named a note the reader is no longer looking at. **Closing the viewer does not clear it**:
  the memory is what lets the browser's Back reach the note after a look at a picture.

The anchor lives in one module ref in `services/textAnchor.js` and nowhere else. It is **not**
mirrored into `history.state`: vue-router rewrites that state on every navigation, so a
mirror came and went on its own, and nothing ever read it.

## The editor

- **Buttons sit level with the field's label**, not in a row of their own under the field.
- **The media button picks one file or several.** A single tile click fills the reference
  outright and ends the pick - no confirmation, because a click is already a decision. Once a
  *selection* stands (in the grid, the same gesture as an edit), the reference is rewritten
  live as the selection changes and a **Confirm bubble** hangs under the reference itself; the
  bubble is the way to settle the block, and it is placed in the field's own coordinates so a
  scroll of the field carries it along.
- **The bubble is a slot, not a floating dialog.** `RichTextArea` marks the run (the ids)
  and renders whatever the caller puts in `#mark-action` under it; the field that is editing
  owns the button and the meaning.
- **`RichTextArea` highlights the markup.** It is a textarea whose own text is transparent,
  with a `<pre>` of the same tokens painted behind it, scrolled in step. The two layers share
  every metric - font, padding, line height, `scrollbar-gutter` - or the highlight drifts
  away from the words.
- **The field opens at the height its text needs, plus two lines.** It only ever grows from
  `rows`; typing does not resize it under the reader.
- **The field does not draw the global focus ring.** The wrapper's border already says it has
  focus, and an accent ring around the whole field read as a selected tile.
- **A selection is a translucent tint, not a solid one.** The field's text is transparent, so
  an opaque selection background would paint over the highlighted layer and hide the very
  text being selected.
- **The media button then waits for a tile.** Pressing it writes `[media=id]…[/media]` with
  the placeholder selected and calls `startPick`; a click on a tile in the grid hands its id
  to `insertTemplate`'s remembered range and does not open the viewer. Typing, or unmounting
  the form, cancels the wait.
- `insertTemplate` dispatches `input`, so a `v-model` always follows.

## Invariants

1. Rendering is token-based; `v-html` is never used for note or description text.
2. `raw` on a token is the exact source; the editor layer and the field must agree
   character for character.
3. The anchor is kept only when the reference is off screen.
4. Only a follow that takes the line off screen pushes; every other write replaces.
5. The anchor lives in one module ref and nowhere else; there is no `history.state` mirror.
6. A media reference is resolved against the page's own list, and a miss is shown, not
   dropped.
7. The card is positioned in document coordinates so it scrolls with the page.
8. A tile click while picking must not open the viewer.
9. The viewer closes on any step onto an entry without `o=1`, anchor or not.
10. A selection in the editor field must stay translucent.
11. A hover belongs to a mouse: a touch enter or focus must not open the card, or the click
    the tap invents lands on the card's own picture.
12. A tapped card is dismissed by a press outside it or the cross, never by the hover
    trajectory.
13. A mouse click on a reference follows it to its tile; a tap shows the card, whose own
    button follows it instead.
14. The address names **every** id of a reference; the outline is the link's state, so the
    two agree and a copied address carries the whole block.
15. A follow that takes the line off screen pushes a history entry, so Back returns to the
    text.
16. The way back is spent **only** by seeing the reference again; closing the viewer or
    paging never clears it.
17. The card steps with a real scroll. Two records are never cross-faded.
18. The card is **not** the flight origin; opening from it marks "no source", so the
    viewer does not search for a tile and plays the plain fade.
19. A media reference's ids are read from the run that is marked, never rebuilt from the
    caption.
20. A follow places the block: centred when it fits the window, its first record at the
    top when it does not.
21. The dim a follow raises outlasts the glide; a scroll while it stands extends it.
22. A media reference is an inline span with a button's role, never a `<button>`: a
    button's label cannot wrap, so the whole chip would jump to the next line.
23. The card closes on the way the hand is moving, never on a fixed delay. The only timers
    are the open delay and the one armed after the pointer has already stopped outside the
    card.
24. The safe triangle is virtual: nothing is added to the DOM for it.
25. A card opened by hand - a tap, a keyboard focus - is never judged by the trajectory, and
    a touch never opens one by hovering.
26. A reference crossed on the way to the card never takes it over; only coming to rest on
    one does, and that rest is the stop window.
27. A swap of reference is a leave and an enter played at once, never a repaint of the same
    element in place.
28. The card's element is taken from the newest copy: a swap has two on the page for the
    length of the fade, and the one leaving must not blank the one being measured.

## Related

- The viewer that owns the return button: [media-viewer.md](media-viewer.md).
- The note and its drafts: [day-editor-and-pending.md](day-editor-and-pending.md).
- `?i=` deep links, which this reuses: [sharing-and-links.md](sharing-and-links.md).
