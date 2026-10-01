# Rich text in notes and descriptions

A day note and a media description are stored as plain strings, but they carry a small
markup: links, and a file of the page referenced by its id. This covers the parser, the
renderer, the hover card, the editor field that highlights the markup, and the way back from
the viewer to the text.

## Files

| File | Role |
| --- | --- |
| `src/services/richText.js` | `parseRichText` (tokens with `ids` and `raw`), `splitParagraphs`, `linkLabel`, editor template builders, and `referenceAt` / `unwrapReference` / `markupSpans` for the field under a caret. |
| `src/services/favicons.js` | `faviconUrl` - the site icon a link is shown with, built from the host alone. |
| `src/components/common/RichText.vue` | Token renderer; says which reference a card belongs to and emits references upward. `preview` turns the card off, `ranges` draws search matches inside the plain runs. |
| `src/components/common/MediaHoverCard.vue` | The card: a carousel of every file the reference names, with a bar, the way to the tile, and the day's map for a file that carries coordinates. |
| `src/components/map/MapMediaCard.vue` | The card's sibling over a map pin - its own doc: [maps.md](maps.md). |
| `src/services/hoverIntent.js` | The hover thresholds, and the geometry of a hand's trajectory: the nearest point of the card, the safe triangle, the polygon test. Pure functions. |
| `src/composables/useHoverIntent.js` | When a card opens and closes: hover in and out, arrival at the card, a hand stopped outside it, a card shown by hand, one held while the viewer it opened is up. |
| `src/components/layout/SteppedScrollbar.vue` | The card's bar: one record per step, draggable, drawn like the page's own. |
| `src/components/common/RichTextArea.vue` | The editor field: a textarea with the markup highlighted behind it, a bubble under a marked run, a pick's hint cloud above that same run, and a report of where the caret stands. |
| `src/components/editor/MarkupToolbar.vue` | The three field controls - take the embed off, media, link - worn by both the note and the description, above and below the note. |
| `src/services/textAnchor.js` | The remembered reference, `anchorSelector`, `returnToTextAnchor`. |
| `src/services/mediaPick.js` | The fleeting mode where a tile click fills a media template. |
| `src/composables/useTemplateInsert.js` | `insertTemplate` - writes a template at a caret and returns its range. |
| `src/composables/useReferenceCaret.js` | `useReferenceCaret` - the reference under a field's caret, and the way to take one off. |
| `src/views/DayView.vue` | Renders the note; decides the anchor; owns the viewer and the return. |
| `src/components/media/MediaLightbox.vue` | The return button and the description as rich text. |
| `src/components/editor/DayEditForm.vue` | Note field, template buttons, media picking. |
| `src/components/editor/MediaEditDialog.vue` | Description field and its template buttons. |
| `src/assets/main.css` | `.rich-link`, `.rich-media`, `.rich-favicon`, `.rich-paragraph`, `.media-hover-card`, `.rich-editor*`, `.text-anchor-flash`. |

## The markup

| Written | Renders as | Note |
| --- | --- | --- |
| `[media=5]Caption[/media]` | A chip labelled "Caption" | A file resolved against the page's own list. |
| `[media=5,7,9]Caption[/media]` | One chip for three files | Ids split by commas, **no spaces**; the chip carries them all. A space would let a caption be read as a second id. |
| `[url=https://...]Name[/url]` | A link labelled "Name" | Opens in a new tab. |
| `[url=/day/2026-03-13]Name[/url]` | A link labelled "Name" | A path on **this** site: it takes the app's own mark, not a site lookup, and opens in a new tab like any other link. |
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

## Paragraphs

A day note sets its parts apart with a blank line - two newlines in the source. The
renderer splits the tokens there and draws each part as its own block, so the gap between
two is the page's to set: `.rich-paragraph` takes `0.5lh`, half the height an empty line
would have taken. Three or more newlines in a row make one gap, not several.

`RichText` does this only when the page asks (`halfBlankLines`), so the viewer's
description keeps the empty line exactly as written.

## Site icons

A link is shown with the icon of the site it leads to, ahead of its label. The icon is an
`<img>` of `1em`, lifted off the baseline by `vertical-align: -0.125em` and given its own
small margin, so it **cannot open the line box**: a picture left at its natural size, or sat
on the baseline, would. A site that serves no icon drops the mark - `@error` hides it - and
the label stays, so a dead icon never leaves a gap.

**The icon is asked for by host alone**, through `faviconUrl` and the template in
`src/services/favicons.js` (`VITE_FAVICON_URL`, defaulting to the DuckDuckGo icon service).
The whole address is never sent, so a reader viewing a note does not tell the linked site that
they were shown it; the request goes to one icon service instead. Point the variable at a
self-hosted proxy to take that service out of the picture too, which is the only way to keep
the hosts a note names from leaving the reader's browser at all.

**A relative address is resolved against the page's own origin first.** `[url=/day/x]` is
relative and has no host of its own, so it - and any absolute address on our own origin - is
given the app's mark (`/haru-logo.svg`) rather than a lookup that would just ask the icon
service about our own host. Only an address on another origin is sent to the service.

This is a **front-end fetch by nature**, with the costs that follow: the icon service sees the
host and the reader's address; a strict `img-src` in the page's CSP would block it; and an
offline or blocked service means no icons. `referrerpolicy="no-referrer"` keeps the note's own
address out of the request. A site's own `/favicon.ico` is the alternative and is worse on
both counts - it is missing on most modern sites, and fetching it opens the reader's browser
to every site a note mentions.

## Tokens, not HTML

`parseRichText` returns ordered tokens (`text`, `media`, `link`). Each also carries `raw`,
the exact source it came from: the renderer ignores it, the editor paints it. Nothing is
concatenated into an HTML string and `v-html` is never used, so a note cannot inject markup,
and the editor's highlight layer is guaranteed to show the same characters as the field.

## Away from the page that owns the files

`RichText` is also used where the page does **not** hold its own file list: a search
result's note, and the map album's description. There `preview` is turned off.

| Prop | Effect |
| --- | --- |
| `preview: false` | No hover card and no `rich-media-missing` mark. A reference is a plain link, and a press follows it instead of opening a card. The mark is left off because it says a reference is broken against the page's own list, and with no such list it would be a lie; the reference simply shows its caption. The viewer's description keeps the card, the file list being in hand there. |
| `ranges` | Match ranges in the text's own coordinates, drawn as marks inside the plain runs. A search result highlights its words here rather than through a second renderer. |

A token's own text is never split by a mark: only the plain runs carry them.

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
- **Opening full screen flies out of this card, and the close flies back into it.** Its
  160px picture is handed over with `markOpenedFrom`, so the viewer grows from the
  stand-in - the map card's own opening - and never searches the day's grid. The card
  **stays up** while that viewer is open (`hold`), so the same mark is still there to
  land on and the picture returns into the card on close, as it returns into a tile.
- **A held card sits under the room.** While the viewer is up the card is dropped to
  `z-index: 2350` (`.media-hover-card-held`, `keep-card-on-open`), below the lightbox's
  `2400` and the flight's `2700`, so it does not float over the picture; it is revealed
  again as the room fades on close, catching the returning picture. The card drawn
  **inside** the viewer's own description is not held and keeps `2600`, above the room.
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
  focus opened: that card has no hand following it to keep it open. A card just back from
  the viewer is one of these - `release` drops the hold as the viewer closes, and the card
  waits to be dismissed by a press outside it or by the cross.
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
- **The card also carries the day's map** when the file on show has coordinates. Both ways to
  the file are the pin album's own round `icon-button`s, right-aligned at the foot of the text
  column. They are **icons, not words**: two full labels wrap in the ~172px column in every
  language, and worst on the phone, where the action is needed most. The label lives in the
  `title` and the `aria-label`. The description is capped at **three** lines rather than five to
  give the 40px row its room.
- **The map button names the file on show**, not the reference: coordinates belong to a file,
  while the tile a follow reaches belongs to the whole block.
- **The map action is offered by the page, not assumed.** `canShowOnMap` is set only where a
  day map exists; the card drawn inside the viewer's description leaves it off, the viewer
  having a map action of its own. The label is the viewer's own `map.showOnMap`.
- **A missing file still opens a card.** The id did not resolve against the page's list, so
  the card says so and shows the reference's own text.

## The way back

A mouse click on a chip singles the files out with `?i=<id,id,...>` and scrolls to the first
of their tiles; the thumbnail in the card opens one full screen. On a touch screen the tap
shows the card, and the card's own button singles the files out; its map link, where the file
on show has coordinates, follows the reference onto the day's map.

That map follow is **not** the pile follow. The line is remembered and the step is given a
history entry of its own, so the page's back button and the browser's Back both return to the
note. But **no `?i=` is written**: nothing is outlined in the wall and nothing scrolls to it,
the page going to the map. The entry is a **forced push of the location already standing** -
`depart()` in `useMediaLink` - because vue-router skips a push to the same address as a duplicate
and would otherwise leave the step no place to return from. The anchor is built from the
reference's **own** first id, not the file on show, or a reference naming several files could not
be found again, while the map itself is framed on the file on show.

`RichText` only reports what was followed - it emits `{ mediaId, ids, index }`, `mediaId` the
file the follow points at, `ids` every file it named, and `index` the occurrence, since one file
may be referenced more than once - and the page decides what to do with it.

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
  Back returns to it. The map follow is a departure too, but pushes the location **unchanged**
  (`depart`), so a way back exists with nothing singled out. Opening and paging the viewer
  **replace** the same entry, so a picture turned to never buries the note under one more step.
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

- **The field controls are one shared component**, `MarkupToolbar` - the leftmost trash, then
  media, then link. They sit level with the field's **label**, and the day note wears a second
  set right below the field, so a reference can be started down there without scrolling back
  to the top. That lower set sits the same 4px under the field as the field sits under its
  label row, and is kept **out of the flow**, so the note-ready box below still stands its own
  distance from the field itself and not from the controls.
- **The media button picks one file or several.** A single tile click fills the reference
  outright and ends the pick - no confirmation, because a click is already a decision. Once a
  *selection* stands (in the grid, the same gesture as an edit), the reference is rewritten
  live as the selection changes and a **Confirm bubble** hangs under the reference itself; the
  bubble is the way to settle the block, and it is placed in the field's own coordinates so a
  scroll of the field carries it along.
- **The bubble is a slot, not a floating dialog.** `RichTextArea` marks the run (the ids)
  and renders whatever the caller puts in `#mark-action` under it; the field that is editing
  owns the button and the meaning.
- **The pick's hint hangs above the reference being filled.** It is a cloud in the field's own
  coordinates (`.rich-editor-hint`), placed on the marked run - the ids the pick is writing -
  so it reads as belonging to that reference instead of the field's first block, and never
  moves the form. It sits **above** the run while the confirm bubble sits **below** it, so the
  two cannot meet. It is **muted**, not accent: a note to the reader, not the block itself.
  Shown and withdrawn by the same rule as before: while a pick runs and no block is waiting to
  be confirmed (`picking && !confirmVisible`).
- **`RichTextArea` highlights the markup.** It is a textarea whose own text is transparent,
  with a `<pre>` of the same tokens painted behind it, scrolled in step. The two layers share
  every metric - font, padding, line height, `scrollbar-gutter` - or the highlight drifts
  away from the words.
- **The field opens at the height its text needs, plus two lines.** It **only ever grows**:
  `rows` is the floor, a height dragged by hand is kept, and a keystroke that overflows the
  box opens it instead of hiding the line under the scroll. The height the box already
  stands at is part of the measurement, so a hand-dragged field is never shrunk back to the
  text - which also means a switch to shorter text leaves it where it is.
- **The field does not draw the global focus ring.** The wrapper's border already says it has
  focus, and an accent ring around the whole field read as a selected tile.
- **A selection is a translucent tint, not a solid one.** The field's text is transparent, so
  an opaque selection background would paint over the highlighted layer and hide the very
  text being selected.
- **The media button then waits for a tile.** Pressing it writes `[media=id]…[/media]` with
  the placeholder selected and calls `startPick`; a click on a tile in the grid hands its id
  to `insertTemplate`'s remembered range and does not open the viewer. Typing, or unmounting
  the form, cancels the wait.
- **A caret inside a reference turns the media button into an edit.** The press does not
  stack a second reference: `referenceAt` finds the one under the caret, its files become the
  grid selection so the wall shows what is being edited, and the pick rewrites its ids as the
  selection changes - the gesture that builds one from nothing.
- **The leftmost control takes an embed off.** While the caret stands in a bracketed
  reference, a trash button appears before the others and strips the tags, keeping the label
  as plain text - a caption is never deleted with the reference that carried it.
- **Only the tags are painted as markup.** `markupSpans` splits a token so the label between
  its tags is drawn as ordinary text, and a caption is not coloured by the reference around it.
- **A reference is checked against the day's own files.** A file that is missing, or hidden,
  is named on the form's notice line - the same line the translation notice uses - because a
  visitor would be shown neither. An empty file list is not read as "all missing".
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
    text. The map follow is one of these: it pushes the location unchanged, not `?i=`, so it
    adds a step to return from without singling anything out.
16. The way back is spent **only** by seeing the reference again; closing the viewer or
    paging never clears it.
17. The card steps with a real scroll. Two records are never cross-faded.
18. The card's picture **is** the flight origin **and** destination: opening from it
    hands the element over with `markOpenedFrom`, so the viewer grows from the card
    and never searches the grid; the card is held while that viewer is up, so the
    close flies back into it. A held card answers no trajectory and no press until
    the viewer closes, after which it is a hand-shown one.
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
29. The card's two ways to the file are one right-aligned row of round `icon-button`s in the
    text column, labelled by `title` and `aria-label`. They are icons, not words, because two
    full labels wrap in that column in every language, worst on a phone; the description is
    capped at three lines to give the 40px row room. The map button follows the file **on show**,
    appears only when that file has coordinates and the page offers a map, remembers the line
    and pushes a step to return from, and writes **no** `?i=`: it outlines nothing.
30. A blank line between a note's parts is a **half-line gap** drawn by `.rich-paragraph`,
    not an empty line kept in the text. Only the day note asks for it; the viewer's
    description is rendered exactly as before.
31. A link's site icon is fetched **by host**, never by the whole address, and is sized in `em`
    and lifted off the baseline so it cannot open the line box. A missing icon is dropped
    rather than left as a gap.
32. A link is resolved against the page's own origin before its icon is chosen: a relative or
    own-origin address takes the app's mark, and only a foreign origin reaches the icon
    service.
33. A caret inside an existing reference makes the media button edit it, never stack a second
    one. The reference's files become the grid selection; the pick rewrites its ids.
34. The trash takes the tags off and keeps the text between them. It never deletes the label.
35. In the field only the tags are markup. The label is painted as ordinary text.
36. A field's caret is held when the field is left: a press on a button moves the focus first,
    and a caret dropped on blur would take that button away before its click lands.
37. A reference is checked against the day's own list, hidden files included, and an empty
    list is not read as "all missing". A miss, or a hidden file, is warned about, not dropped.
38. The pick's hint hangs above the run being edited, never at the field's first block and
    never in the flow under the note: a notice that comes and goes must not move the form, and
    it must belong to the reference it is filling. The confirm bubble takes the space below the
    run, so the hint above it is never covered. The day note's field controls appear above
    **and** below the field, from one shared `MarkupToolbar`. The lower set sits 4px under the
    field, matching the field's own gap under its label row, and is out of the flow - the
    note-ready box below keeps its spacing from the **field**, not from the controls.
39. Away from the page's file list, `RichText` renders a reference as a plain link: `preview`
    off means no card and no `rich-media-missing` mark, because without the list a miss cannot
    be judged. `ranges` draws search matches in the plain runs alone, never splitting a token.

## Related

- The viewer that owns the return button: [media-viewer.md](media-viewer.md).
- The note and its drafts: [day-editor-and-pending.md](day-editor-and-pending.md).
- `?i=` deep links, which this reuses: [sharing-and-links.md](sharing-and-links.md).
