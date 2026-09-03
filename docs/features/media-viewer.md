# Media viewer (lightbox)

Full-screen viewing of one file among a list: image layers, a draggable filmstrip,
pinch/double-tap zoom, pull-to-dismiss, a flight to and from the tile that opened it, and
two floating bars whose height the picture has to be fitted around.

`MediaLightbox.vue` is ~2400 lines and by far the densest component in the project. Most
of its complexity is timing, not logic. Read this document before editing it.

## Files

| File | Role |
| --- | --- |
| `src/components/media/MediaLightbox.vue` | Everything below. |
| `src/services/mediaAssets.js` | URL accessors: `miniatureSrc`, `previewSrc`, `fullScreenSrc`, `streamSrc`, `downloadSrc`, `mediaAspect`, `mediaDate`. |
| `src/services/openedFrom.js` | Hands the viewer the exact element that was pressed. |
| `src/services/mediaTiles.js` | `tilesFor` / `tileFor` / `boxOf` / `isOnScreen`. |
| `src/services/overlayStack.js` | Keyboard ownership and scroll-lock arbitration. |
| `src/composables/useMediaLink.js` | `pageIdentity` - used to close on real navigation. |
| `src/assets/main.css` | `.fit-media`, `lightbox-*` transitions, `[data-lightbox-flying]`. |

## Interface

```
<MediaLightbox :items="files" v-model:index="openIndex" @close="..." />
```

`index` is `null` when closed. The parent owns the list and the index; the viewer never
mutates the list. `items` may hold **either** model shape - `pickTranslation` handles both,
because the pending queue passes edit models whose flat fields do not exist.

## Image layers

Three sources per file, stacked, each standing in only until something better exists:

| Layer | Source | Purpose |
| --- | --- | --- |
| miniature | base64 inline on every file | Paints instantly, no request. |
| preview | `imageUrls.preview` / `videoUrls.preview` | The very URL the grid tile already downloaded, so it is served from cache. |
| full screen | `imageUrls.fullScreen` | Videos have none; they stream instead. |

The rule that makes this hard: **a layer that will never be wanted must never be
painted**, not painted and then faded out. A sharp picture going soft and clearing again
is worse than a slower first paint.

So each layer is asked about *before* the first render:

- `isCached(url)` probes a detached `Image` - answers for the memory cache.
- `revealIfCached()` runs in the `flush: 'post'` watcher, once elements exist - catches
  images held only on disk, which report `complete` before any `load` fires.
- `settleLayers({ instant })` marks lower layers done. `instant` is only legitimate
  before the first paint; after it, the layer is being taken from a reader who is looking
  at it and must fade.
- `beforeFirstPaint` is the flag that guards that distinction.

`revealWhenDecoded()` awaits `image.decode()` before declaring a layer ready. `load` means
the bytes arrived; without decoding first, the reveal happens during paint and the image
appears in bands.

`inHand` is a `Set` of full-size URLs this session has actually held. It exists so a file
already looked at slides past *sharp* as a filmstrip neighbour. It is a record rather than
a probe because probing an uncached URL issues a request - acceptable for the file being
opened, not for two neighbours on every page turn.

## Fitting: where the picture goes

The cell is the whole window, so scale 1 means "as large as the window allows". The two
floating bars are laid over the picture, so the picture is scaled *down* to clear them.

| Value | Meaning |
| --- | --- |
| `aspect` | The file's ratio. Comes from `mediaAspect(media)` - the **API states it**, so the fit is known before a byte arrives. `previewAspect()` is the fallback; `knownAspect()` is the accessor everything must use. |
| `bandTop` / `bandBottom` | Where the bars leave off, read from `band` (an element in flow between them) by `readBand()`. |
| `exactBand(ratio)` | Returns insets **only when the bars actually bind**. A landscape file runs out of width first and never meets them. |
| `fitWithin(insets, ratio)` | Pure. Returns `{ scale, offsetY }`. Being pure is what lets filmstrip neighbours be placed by the same sum. |
| `uiFitScale` / `bandOffsetY` | The open file's fit under the bars. |
| `restingScale` / `restingOffsetY` | The fit as the chrome currently stands: under the bars when visible, the full window when hidden. Also the far end of the zoom-out. |
| `atInitialFit` | False once the reader has taken the zoom into their own hands. Their size then survives a chrome toggle; only the limit beneath them moves. |

`.fit-media` sizes an element **to the picture** rather than capping it, which is what
makes the empty space beside it clickable - and what makes an under-sized preview enlarge
to match the open file instead of arriving smaller (`max-width`/`max-height` only shrink).

Sizing runs in a `flush: 'post'` watcher on `[open, current, uiVisible, aspect]` and
writes straight to the element. Deferring it by a tick lets a frame out at the wrong size.

## Gestures

One pointer surface handles all of them, because their meanings overlap.

| Gesture | Result |
| --- | --- |
| Two fingers | Pinch zoom around the midpoint, panning as the midpoint travels. |
| One finger, zoomed | Pan, clamped by `clampOffset()`. |
| One finger, horizontal | Drags the filmstrip; past `SWIPE_COMMIT` (12% of the frame) it turns the page. Resisted at 25% travel at the ends of the list. |
| One finger, vertical | Pull to dismiss, either direction, past `DISMISS_DISTANCE` (120px). |
| Mouse click on the picture | Toggles the chrome. |
| Mouse click beside the picture | Closes. |
| Tap (touch), anywhere | Toggles the chrome only. Never closes. |
| Double tap | Zoom to `TAP_ZOOM` (2.5) at that point, or back out. |
| Wheel | Zoom, with the transition held on ~180ms after each notch so discrete steps read as continuous. |
| `←` / `→` / `Esc` | Page, page, close. |

Details that look arbitrary and are not:

- **Axis is locked on the first decisive move** (`drag.axis`), so a page turn cannot
  become a dismissal halfway through.
- **A mouse never drags the strip** - it has the arrows and the keyboard.
- **A tap beside the picture does not close on touch.** A phone gives the picture nearly
  the whole screen, so a tap that misses was aimed at the picture. The close button and
  the downward pull are the deliberate ways out.
- **Mouse hit-testing uses `isOnPicture(x, y)`, not `event.target`.** The frame captures
  the pointer so a pan survives the cursor leaving it, and capture retargets every later
  event to the frame - so the target is never the image.
- **`pictureRect()` measures the preview while the full-size image is still loading.**
  The full-size element has no proportions yet and its box is flat, which put every tap
  beside the picture.
- **Single tap is delayed by `TAP_WINDOW` (210ms)** to find out whether it is half of a
  double tap. Acting immediately showed the chrome leaving and returning inside one
  double tap.
- **A dismissal does not fly back to the tile.** The reader already threw the picture
  somewhere; a second departure runs two animations at once.

## Paging

A turn - from a swipe, an arrow, or a key - always uses `slideOneFrame()`: the strip
slides one whole frame, the neighbour riding there lands centred, and the index changes
underneath it in the completion callback. So every route to the next file produces the
same movement.

- `turning` guards *only* turns. Using the general `animating` flag made hiding the
  chrome swallow the next arrow press.
- `queuedTurn` remembers **one** pending turn. A held-down arrow otherwise keeps turning
  after the key comes up.
- The queued turn is dispatched on `nextTick`, so the browser sees the strip at rest
  before the next slide starts from there.
- A zoomed picture cannot be slid, so `page()` there just calls `step()`.

`withAnimation(change, done, duration)` runs a change with a transition and then writes
the finished state. With motion reduced it runs both immediately - every caller therefore
writes the finished state in `done` and only sets up for it in `change`. A new call
settles any pending one first; dropping it stranded the strip a frame off centre with the
file underneath never swapped.

## Hero flight

One `<img>`, teleported to `body`, animated between the tile's box and the picture's box
via the Web Animations API.

- The source is `heroSource(item)`: the full-size image when it is already in hand or
  cached, otherwise the preview. A stand-in flown to full size arrives visibly soft.
  A watcher on `fullLoaded` swaps the source mid-flight when the real file lands.
- The crop resolves itself: a tile shows a square `object-fit: cover` crop, and the
  destination box has the file's own proportions, where cover and contain coincide. So
  the crop opens out with nothing animating it.
- Boxes are computed from the numbers that place the picture (`pictureBox()`), not
  measured off the element - so the flight can run before the picture exists and after it
  is gone.
- **Where it flies from** is handed over by `services/openedFrom.js`, not searched for.
  A file appears on the page more than once often: the front page hangs its wall twice,
  the pending queue shows the same file as the strip in the day being written, and the
  "similar" panel duplicates the grid behind it. Searching by id found *a* tile.
  `markOpenedFrom(el)` must be called from whatever handler opens the viewer.
- **Where it flies back to** (`tileBoxBack`) prefers the remembered `originTile`, even
  off-screen - the reader knows they scrolled. Any other tile must be on screen, or there
  is no destination and the plain fade does the work.
- `[data-lightbox-flying]` is stamped on `<html>` (not the dialog, which is unmounting)
  to suppress the room's own leave animation while a flight is running.

## Chrome (the two bars)

The bars size themselves to their contents - a long description, several rows of tags,
either expanded - so their height is measured, not assumed, and fed back into the fit.

- A `ResizeObserver` on header, footer, tag list and description calls `measureChrome()`.
- Measurement is **frozen** while a bar is expanded or animating shut (`chromeSettling`,
  `CHROME_SETTLE_MS` = 340ms > the 300ms CSS collapse). Otherwise the observer follows
  every frame of the collapse and drags the picture along with it.
- Bar height changes are animated on the elements themselves via `element.animate()` -
  a bar has no height of its own to transition between, only whatever its contents come
  to, and a keyframe can be given the two numbers where a stylesheet cannot.
- `recordBarsOnly` writes down a new height without animating to it, used when the bar
  has just finished moving under its own CSS transition. Without it, collapsing a tag
  list bounced.
- The picture needs no animation of its own: it reads from the bars, and the observer
  reports every frame.

## Invariants

Do not "fix" these:

1. `pageIdentity(route)` - not the raw address - is what the close-on-navigation watcher
   compares. The page below writes `?i=` into the query; watching the whole address made
   every file open and close in the same breath.
2. Closing happens when the **route actually changes**, not on the click. The page below
   answers a close by rewriting its address, and replacing an address mid-navigation
   cancels it - which made tag links inside the viewer do nothing from a search page.
3. Scroll unlock is delayed by `UNLOCK_DELAY` (120ms). A dismissal ends on `pointerup`
   while `touchend` is still pending; unlocking there hands the browser a page that
   became scrollable mid-gesture, and it eats the next tap as a fling-stop.
4. `releaseScroll()` checks `hasOverlay()`. A viewer opened from inside an edit dialog
   closes over a dialog that still needs the page held.
5. `onKeydown` returns unless `isTopmost(overlayToken)`. One Escape used to close the
   viewer *and* the edit dialog under it, with whatever had been typed into it.
6. Focus is returned with `preventScroll: true`. Focusing scrolls, the page scrolls
   smoothly, and a browser discards the click of any touch that began or ended while the
   page was moving.
7. `suppressClick` is cleared on `pointerdown`, not only after use - a gesture ending off
   the frame fires no click, and a lingering flag ate the next real tap.
8. Dismissal in `useMediaLink` listens on `pointerdown`, not `click`. A click is the tail
   of a gesture that may have started on the previous page.

## Related

- Deep linking and the share button: [sharing-and-links.md](sharing-and-links.md).
- Which tiles the viewer flies from, and selection: [media-grid-and-selection.md](media-grid-and-selection.md).
