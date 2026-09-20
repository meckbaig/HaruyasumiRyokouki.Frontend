# Media grid, tiles and selection

The wall of thumbnails, the two-stage image load behind each one, client-side chunking,
and the press-and-drag selection gesture shared by four different walls.

## Files

| File | Role |
| --- | --- |
| `src/components/media/MediaGrid.vue` | The wall: chunking, cascade, selection wiring. |
| `src/components/media/MediaTile.vue` | One tile: image, badges, star, hide, pencil. |
| `src/components/media/MediaThumb.vue` | The two-stage thumbnail. Every wall renders one. |
| `src/services/mediaTiles.js` | Finding the element(s) that stand for a file. |
| `src/services/blockOutline.js` | The singled-out block's perimeter, as one SVG path. |
| `src/composables/useTilePaint.js` | The paint gesture, shared. |
| `src/stores/editor.js` | Selection state, `lastSave` / `lastDelete`. |
| `src/components/editor/SelectionToolbar.vue` | App-level floating toolbar. |
| `src/components/media/MediaContextMenu.vue` | Right-click menu. |
| `src/services/cascade.js` | Stagger delay for arriving tiles. |
| `src/components/common/SkeletonGrid.vue` | Placeholder sized from `mediaCount`. |
| `src/composables/useHiddenRecords.js` | Editor-only "hide the hidden files" state and filter. |
| `src/components/common/HiddenRecordsToggle.vue` | The one button that drives it, on the day and search pages. |
| `src/composables/useGridReadonly.js` | Editor-only read-only wall: the tile's edit controls answer nothing. |
| `src/components/layout/AppFooter.vue` | The one checkbox that drives it, beside the motion switch. |

## Two-stage image load

Every file ships a `miniature` - a tiny inline base64 image that costs no request and is
therefore on screen in the first frame. The real preview settles over it **only once it is
whole**.

**The miniature carries the file's original proportions, not a square.** Cropping it to
whatever shape a wall wants is the frontend's job: the tile draws it into an
`aspect-square` box under `object-cover`, and the viewer draws the same bytes into a box
with the file's own ratio. Nothing about the miniature assumes one shape, and no code
should treat it as pre-cropped.

Handing one `<img>` `preview || miniature` looks equivalent and is not: it means an empty
frame for as long as the network takes, then the picture appearing out of nothing. Two
elements, cross-faded, is the scheme.

**It lives in exactly one component.** `MediaThumb` owns the pair of images, the decode,
the failure fallback and the square box; `MediaTile` renders one and stacks its badges,
marks and outline over it, as do the editor walls. A new wall of thumbnails renders
`MediaThumb` - it does not re-implement this.

Three details that are load-bearing:

- `await image.decode()` before revealing. `load` means the bytes arrived; the browser
  still turns them into pixels while painting, which is what made a fresh preview appear
  in bands over the miniature. From cache it resolves immediately.
- The reveal compares `image.getAttribute('src')` against the bound value - **not**
  `currentSrc`, which the browser resolves to an absolute URL that would never match a
  relative one. A tile may be recycled to another file mid-decode.
- The miniature is drawn at `scale-105`. Blur bleeds inwards and leaves the edges
  semi-transparent, so an unscaled one lets the frame show through.

Previews, like miniatures, keep the file's original aspect ratio; the square is the tile's
`aspect-square` box, and `object-cover` does the cropping. That crop is what makes the
lightbox's hero flight work - see [media-viewer.md](media-viewer.md).

## Chunking

The API returns every result in one response by design, so throttling happens here.

| Prop | Effect |
| --- | --- |
| `chunkSize` (60) | Tiles revealed at a time. Only the revealed tiles are ever in the DOM. |
| `autoReveal` | Whether the sentinel reveals the next chunk on its own. |
| `cascade` | Stagger arriving tiles, one after another. Used by the pending queue, the day page and each search-result group. |
| `previewRows` | Pages the wall to that many **rows** and keeps the rest behind one "show all" button. Null keeps plain chunking. |

### A page of rows, and why

A day page puts a map **below** its wall, and a long day put it past several screens of
photographs. Given `previewRows`, the wall instead opens on that many rows and offers one
button that reveals the whole list, so the map is a press away rather than a scroll. How
many tiles a row holds is read from the window's own breakpoints (2 / 3 / 4 / 5), the same
numbers the grid's Tailwind classes use.

- The **day page** asks for four rows, unless "hide the map by default" is set - then the
  reader is not heading for the map, and a page in front of them would be lost.
- The **search page's "rest of this day"** opens on the same four rows, so unfolding a long
  day does not hand over the whole wall at once.
- A **link into the wall** opens the page **whole** - before the first tile is drawn when the
  address already names a file, and the moment it arrives when it comes later from a note.
  The file the reader was sent to often sits past the page, and a wall cut off just past it
  would leave the rest behind a button for no reason. A **chunked** wall (no `previewRows`)
  instead grows only far enough to hold the named file, through `reachFloor`, which outlives
  the link - folding the wall away under a reader who just closed the viewer would be worse.
  See [rich-text-and-links.md](rich-text-and-links.md).
- With `previewRows` set the sentinel is not observed at all; the button is the only way on,
  so `autoReveal` has nothing to do.

`autoReveal` **must be false where the grid is one section among several.** On the pending
screen the media queue sits above the day queue; with a few thousand files waiting, the
grid grew a chunk every time the bottom came near and the days below could never be
reached. There the button is the only way past.

### The shrink rule

A new result set restarts from the first chunk - but a *shrunken* one does not. Approving
a file removes it from the pending queue and hands the grid a new array; treating that as
a new answer folded four hundred revealed thumbnails back to sixty every time. A list
whose every id was already in the previous one is the same list minus something, so
`visibleCount` survives (clamped to the new length).

### Reaching a linked file

A `?i=` file must be in the DOM to be outlined or scrolled to, and the eightieth photo of
a day is one link away like any other. A watcher reveals up to `index + 1` - enough, no
more - and a **paged** wall is opened whole instead, since the page's own limit is not a
bound the link should have to respect. This is why `scrollToMedia` waits **two** ticks: one
for the id, one for the reveal.

`IntersectionObserver` uses `rootMargin: '600px 0px'` so the next chunk starts before the
sentinel is actually visible.

### A jump past the wall

A destination **below** the wall must not move while the page scrolls to it. The day's map
is one: with the map hidden by default the wall has no `previewRows` and reveals its own
chunks, so one arriving under the glide pushed the map down and the reader landed on grid
that had just appeared. The day page calls the grid's `finishRevealing` before aiming the
scroll: a wall that reveals its own chunks is opened whole, a paged wall is already finite
and is left alone.

## Tile props and what they mean

| Prop | Purpose |
| --- | --- |
| `faded` | Dimmed for a moment while a link's block is lit, so the block stands out of the wall. |
| `dimmed` | Shows the tile behind a dim, lifted on hover - the rest of a day behind what search matched. The value follows the theme scheme (0.8 light, 0.6 dark). |
| `showDate` | Stamps the day. For the pending queue, where files arrive from all over the trip with nothing else to place them by. |
| `showTime` | Stamps the clock **on approach**. Where the date is already established by the page or a group heading, the clock is the useful half - wanted often enough to offer, rarely enough not to print across every photograph. |
| `touchControls` | Keeps pencil and star visible without a cursor. Required on the queue (the whole page is work, and on a phone an invisible control is findable only by its author); wrong on a day or a set of results (those walls are photographs first). |

Both stamps render as **one** badge - they land in the same corner and read as a single
stamp anyway.

### Star and hide

`toggleFavorite` and `togglePrivate` (`src/services/favorites.js`, `privacy.js`) send a
single-field PATCH and then **write the answer straight onto the media object**. Every list
holds the very object the store cached, so one write makes the tile, the viewer and any
edit dialog agree at once - a boolean is not worth pulling a whole day back over the wire.
Nothing is written locally unless the request succeeded.

Both controls stay visible once set, unlike the pencil: the mark *is* the answer to "which
of these have I picked out / hidden", and a mark that only appears under the cursor cannot
be scanned - nor reached at all on a phone.

A request in flight does **not** disable the button. A disabled control takes the
not-allowed cursor, which reads as refusal rather than as work under way; repeat clicks
are ignored and `aria-busy` says so.

`isPrivate` tests `=== true`, not truthiness: `private` is null for anyone not signed in,
and null means "not being told", not "no".

### Badges and the tile's controls

Badges share the **bottom-left corner in one row** rather than each claiming a corner: a
file can be both a video and a hidden one, and two absolutely-placed badges sat on top of
each other the one time it mattered. The hidden mark comes first and carries a **word**,
not just a symbol - it is the only badge that is a warning rather than a description, and
an editor scanning a day should not have to work out what a crossed-out eye means.

The **hide button** therefore appears on approach like the pencil, unlike the star: the
badge in the corner already reports the state, and a button repeating it would state the
same fact twice. Its colour still reports the state it would undo.

`onTouchend` calls `preventDefault()` once it has answered a tap, so the click the browser
may invent does not land as well. That click is aimed at wherever the finger was, and by
then the viewer is open over that spot - which sent a tap at the foot of the screen after a
tag or the download link.

### The context menu

`MediaContextMenu` **replaces** the browser's own rather than merely suppressing it - it was
already suppressed, since a long press here means "select". It offers one action, a link to
the picture where it sits - or, when the tile pressed is one of a selection, to **every**
selected file at once, since the address already knows how to name a block (`?i=1,2,3`).
One action is still worth a menu: the alternative is a permanent button on every tile, and
the grid is meant to be photographs. It is placed at the click and nudged back inside the
window; anything at all closes it.

A private file's menu still **opens and says why**. The native menu has been suppressed on
these tiles since long before this, so a right-click producing nothing would read as a
broken page rather than as an answer. Private files are also **left out of a shared
selection**, and when nothing is left the menu says so rather than offering a link that
would single out nothing.

### A tap is read from the touch, not from the click

`MediaTile` answers a tap on **`touchend`**, not on `click`. A browser invents the click,
and only if it decides the touch belonged to the page: after a quick swipe it suppresses
the whole invented sequence, so a tile tapped straight after flicking a picture away
answered nothing at all.

That leaves the invented click to deal with, because it is aimed at **the point the finger
was at**, and the viewer is open over that point by the time it arrives. Opening a file at
the foot of the screen therefore followed a tag, or the download link, into a place the
reader never asked to go.

Two defences, both keyed on `GHOST_CLICK_MS` in `src/services/ghostClick.js`:

1. `onTouchEnd` calls `preventDefault()`, which stops the click from being invented at all.
2. `MediaLightbox` swallows anything that reaches it within that window of opening, for
   whatever forgets the first.

`onClick` compares timestamps rather than reading a flag. A flag waiting to be cleared by
the invented click sits there for ever once `preventDefault` stops that click being made,
and swallows the next real one from a mouse.

### Opening the viewer

The tile calls `markOpenedFrom(element)` (`src/services/openedFrom.js`) before emitting
`open`. **This is mandatory for any new wall of thumbnails.** The viewer is handed a list
and an index, never an element, and a file appears on the page more than once often -
the front page hangs its wall twice, the pending queue shows the same file as the strip in
the day being written, the "similar" panel duplicates the grid behind it. Without it the
picture flies out of a tile the reader was not looking at.

## A block singled out

A note reference may name several files at once, and a link carries all of them
(`?i=1,2,3`). `MediaGrid` then outlines them as **one** shape rather than a ring each.

- **One SVG path, stroked.** `services/blockOutline.js` turns the selected tiles into a closed
  loop on the grid's own lattice (a boundary line sits half a gap from the tile) and strokes
  its centreline. `stroke-width` makes the band a uniform 2px, so a straight run and an arc
  cannot differ in thickness nor come apart at the join. The tiles' positions are read as
  **layout offsets**, so the arrival transform of a page loaded with a link does not shift it.
- **Every corner is one radius.** Each edge is moved half a band inwards, then every corner is
  trimmed and joined by an arc of the same radius centred on the inside of the turn - the same
  sum for a convex and a reflex corner, so the inner bend of an L is rounded like an outer one.
  The band's outer edge lands where the editor's selection ring's does.
- **Adjacency is read from the laid-out rectangles**, not from indices, so it is right at
  every breakpoint - two columns on a phone, five on a wide window. Two selected tiles with a
  gap between them become two loops, and a block that only touches another at a corner splits
  there. **The tile draws no ring of its own**, since a ring cannot be glued across tiles; the
  editor's selection keeps its per-tile ring.
- **The outline fades in and out** (`tile-outline` keyframes). The wall never clicks between
  outlined and not.
- **The rest of the wall dims for a second** when a reference is followed from the note
  (`emphasis` in `DayView`), because a block may sit off screen and the outline alone would
  not be seen. It is an **overlay pseudo-element**, not the tile's own opacity: the tiles
  carry a filled `cascade-in`, and touching their `animation` replayed every arrival. Every
  scroll while the dim stands pushes its end back, so a long glide - a block far down on a
  phone - arrives while the wall is still dim rather than after it has lit again.
- **`highlightedIds` is the link's own ids**, never a second parallel state - so the address
  and the outline agree, and a press elsewhere puts both away at once. `highlightedId`
  remains for a link that names a single file.

## Hiding the hidden files

A signed-in editor gets a toggle, beside the share button on the day and search pages, that
drops the private files a page would otherwise show. It is a client-side filter over the
list already in hand - the cached day and the cached search answer are left whole, so the
private files come back the instant the toggle is turned off, with no request.

The choice is shared by both pages and persisted like the day map's own default
(`haruyasumi.hiddenRecordsHidden`), so it survives a reload. `useHiddenRecords` owns the
state and the filter; `HiddenRecordsToggle` is the one button. The search page's remainder
behind "show the rest of this day" is filtered too, or a hidden file would reappear the
moment a day was unfolded.

## The read-only wall

An editor who is only reading turns the footer's "read-only grid" on
(`haruyasumi.gridReadonly`, `useGridReadonly`; the switch sits beside the motion one). The
tile's three editing controls - the star, the hide control and the pencil - still **arrive on
approach** exactly as they do otherwise, but through `.hover-reveal-dim`: the same reveal at
half strength, so the control reads as not offered rather than as refused. A marked file's
star is the exception: it keeps the full strength it has everywhere else, on show at all
times, and dims as the **tile** is pointed at - the mark reads unchanged until the reader
reaches for the picture, and then plainly not offered.

Hovering a dimmed control shows a `title` - read-only mode, editing is blocked - because a
half-strength button that silently did nothing would read as broken. A press on one is **the
tile's own**: `passThrough` sends it to `activate`, so it opens the picture exactly as a press
anywhere else on the tile does. The cursor is deliberately left alone for the same reason -
the control is not refused, only not offered - and the controls are never `disabled`, which
would take a not-allowed cursor and swallow the press instead.

**Only the day and search walls honour it.** The pending queue is work, not browsing, and
keeps every control: it simply never passes the flag down (`MediaGrid` to `MediaTile`).
Selection, the context menu's own link and opening a file are untouched, because none of
those is an edit.

## The paint gesture

`useTilePaint` owns press-and-drag selection. It belongs to the container, not the tile,
because a stroke spans several. Tiles carry `data-tile-index`; the container binds
`onPointerDown`, `onTouchStart`, `onClickCapture`.

| Input | Behaviour |
| --- | --- |
| Mouse drag > 8px | Starts painting immediately. |
| Long press 450ms | Starts painting, mouse or touch. The touch way *in*. |
| Touch drag, `armed()` | Sideways beyond 24px starts painting; downwards hands the page back and ends the gesture. |

Each move recomputes the selection from `snapshot()` taken at press time plus the
origin→current range, so dragging back shrinks it again. The **origin tile's state decides
the whole stroke**: starting on a marked tile erases the range, on an empty one adds it.

`armed()` is true once a selection is already open - the finger is in that mode, and the
long press is the way into it rather than a toll on every stroke afterwards.

The composable knows only ids and hands the whole resulting list to `apply()`. Callers
keep their own idea of what selection means: `MediaGrid` maps ids back to whole media
objects (a bulk edit needs the files, and they can come from several days) and calls
`editor.setSelection`; other walls keep a plain `Set`.

### Why touch takes a separate path

A browser hands out pointer events only until it decides the gesture is its own - the
moment it starts scrolling it cancels the stream and sends nothing more. A press held
still on a phone is exactly the case it guesses wrong, which is why the long press worked
with a mouse and inside a devtools emulator and never on a real device. Touch events keep
arriving throughout, and `preventDefault` on a `touchmove` genuinely stops the page from
scrolling once painting has begun - something a `pointermove` cannot do.

The touch threshold (24px) is larger than the mouse one (8px) because a finger held still
still drifts several pixels.

## Selection state and the toolbar

`SelectionToolbar` is rendered **once at app level**, so a selection survives navigation
between the day page, search results and the pending queue. The consequence: the page
underneath never hears the toolbar's events. `editor.lastSave` and `editor.lastDelete` are
the broadcast channel - each replaced whole so a watcher fires even when the same files
are saved twice.

`editor.toggle` clears `selectionMode` when the last item is removed; leaving it on would
strand the toolbar with nothing to act on.

Bulk delete runs **one request per file in sequence** (the API deletes by id), so a
failure halfway leaves a clear account of what did go, and `reportDeleted(gone)` names
exactly those.

## Invariants

1. Any new wall of thumbnails must call `markOpenedFrom` before opening the viewer.
2. A `previewRows` wall opens **whole** whenever a link names a file in it, at arrival or
   later. A chunked wall grows only to the named file, through `reachFloor`. A latch that
   never let go made every wall unpaginated for the rest of the visit.
2. Tiles must carry `data-tile-index` (paint) and `data-media-id` (links, hero flight),
   and are looked up only through `services/mediaTiles.js`.
3. `autoReveal` is false wherever the grid is not the whole page.
4. A shrunken list keeps its `visibleCount`.
5. Reveal comparisons use `getAttribute('src')`, never `currentSrc`.
6. `isPrivate` tests `=== true`; ids test `== null`.
7. Star/hide write onto the shared object rather than refetching, and only after success.
8. `suppressClick` is cleared at the start of each gesture, not only after use.
9. Anything that answers a tap on `touchend` must also suppress the click it invents.
10. Hidden records are filtered client-side and the choice persists
    (`haruyasumi.hiddenRecordsHidden`); the cached lists are never rewritten.
11. A block outline is one stroked SVG path: a 2px band whose centreline is the block's
    boundary inset half a band, every corner trimmed and joined by an equal-radius arc.
12. The emphasis dim is time-boxed - extended while the page is still scrolling - and is
    not the search dim.
13. `highlightedIds` is the link's, never a parallel state of the page's own.
14. The read-only wall shows the star, the hide control and the pencil on approach as ever,
    but half-strength (`.hover-reveal-dim`) and with a `title` saying why. A press on one is
    the tile's own (`passThrough` to `activate`), so it opens the picture; the controls are
    never `disabled` and the cursor is left alone. A marked file's star stays on show at full
    strength and dims as the tile is pointed at. Only the day and search walls pass the flag;
    the pending queue never does.
15. A jump aimed **past** the wall settles it first (`finishRevealing`): a wall that reveals
    its own chunks is opened whole, so the destination below it cannot move under the glide.
    A paged wall is already finite and is left alone.

## Related

- The viewer these tiles open: [media-viewer.md](media-viewer.md).
- Bulk editing the selection: [media-editor.md](media-editor.md).
- Where a tile is found from: `src/services/mediaTiles.js`.
