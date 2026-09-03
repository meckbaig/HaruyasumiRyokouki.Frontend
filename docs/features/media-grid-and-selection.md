# Media grid, tiles and selection

The wall of thumbnails, the two-stage image load behind each one, client-side chunking,
and the press-and-drag selection gesture shared by four different walls.

## Files

| File | Role |
| --- | --- |
| `src/components/media/MediaGrid.vue` | The wall: chunking, cascade, selection wiring. |
| `src/components/media/MediaTile.vue` | One tile: image, badges, star, hide, pencil, outline. |
| `src/components/media/MediaThumb.vue` | The two-stage thumbnail. Every wall renders one. |
| `src/services/mediaTiles.js` | Finding the element(s) that stand for a file. |
| `src/composables/useTilePaint.js` | The paint gesture, shared. |
| `src/stores/editor.js` | Selection state, `lastSave` / `lastDelete`. |
| `src/components/editor/SelectionToolbar.vue` | App-level floating toolbar. |
| `src/components/media/MediaContextMenu.vue` | Right-click menu. |
| `src/services/cascade.js` | Stagger delay for arriving tiles. |
| `src/components/common/SkeletonGrid.vue` | Placeholder sized from `mediaCount`. |

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
| `chunkSize` (60) | Tiles revealed at a time. Only `visibleCount` are ever in the DOM. |
| `autoReveal` | Whether the sentinel reveals the next chunk on its own. |
| `cascade` | Stagger arriving tiles. For a page that is nothing but a grid; where the grid is one section among many, the page's own arrival already covers it. |

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
more. This is why `scrollToMedia` waits **two** ticks: one for the id, one for the reveal.

`IntersectionObserver` uses `rootMargin: '600px 0px'` so the next chunk starts before the
sentinel is actually visible.

## Tile props and what they mean

| Prop | Purpose |
| --- | --- |
| `variant` | `matched` (dark ring) / `expanded` (muted ring) - search-result outlines. |
| `highlighted` | Singled out by a link. Draws the **same** ring as a selection: both mean "this one, out of all of these", and selection is a transient editor state, so the two are never on screen for the same reason at once. |
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

### Opening the viewer

The tile calls `markOpenedFrom(element)` (`src/services/openedFrom.js`) before emitting
`open`. **This is mandatory for any new wall of thumbnails.** The viewer is handed a list
and an index, never an element, and a file appears on the page more than once often -
the front page hangs its wall twice, the pending queue shows the same file as the strip in
the day being written, the "similar" panel duplicates the grid behind it. Without it the
picture flies out of a tile the reader was not looking at.

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
2. Tiles must carry `data-tile-index` (paint) and `data-media-id` (links, hero flight),
   and are looked up only through `services/mediaTiles.js`.
3. `autoReveal` is false wherever the grid is not the whole page.
4. A shrunken list keeps its `visibleCount`.
5. Reveal comparisons use `getAttribute('src')`, never `currentSrc`.
6. `isPrivate` tests `=== true`; ids test `== null`.
7. Star/hide write onto the shared object rather than refetching, and only after success.
8. `suppressClick` is cleared at the start of each gesture, not only after use.

## Related

- The viewer these tiles open: [media-viewer.md](media-viewer.md).
- Bulk editing the selection: [media-editor.md](media-editor.md).
- Where a tile is found from: `src/services/mediaTiles.js`.
