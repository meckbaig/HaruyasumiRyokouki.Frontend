# Media viewer (lightbox)

Full-screen viewing of one file among a list: image layers, a draggable filmstrip,
pinch/double-tap zoom, pull-to-dismiss, a flight to and from the tile that opened it, and
two floating bars whose height the picture has to be fitted around.

`MediaLightbox.vue` is ~2400 lines and by far the densest component in the project. Most
of its complexity is timing, not logic. Read this document before editing it.

## Files

| File | Role |
| --- | --- |
| `src/components/media/MediaLightbox.vue` | Everything below except the flight. |
| `src/components/media/HeroFlight.vue` | The flight between a tile and the picture. |
| `src/services/motion.js` | `motionReduced()`, shared by both. |
| `src/services/pageChrome.js` | Where the page's own floating chrome leaves off. |
| `src/services/mediaAssets.js` | URL accessors: `miniatureSrc`, `previewSrc`, `fullScreenSrc`, `streamSrc`, `downloadSrc`, `mediaAspect`, `mediaDate`. |
| `src/services/openedFrom.js` | Hands the viewer the element pressed, or an explicit "none". |
| `src/services/mediaTiles.js` | `tilesFor` / `tileFor` / `boxOf` / `isOnScreen`. |
| `src/services/overlayStack.js` | Keyboard ownership and scroll-lock arbitration. |
| `src/composables/useDelayed.js` | `miniatureRetired` - when the miniature has done its job. |
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

Three sources per file, stacked sharpest on top: the blurred miniature is the permanent
base and each sharper layer settles over the one beneath it:

| Layer | Source | Purpose |
| --- | --- | --- |
| miniature | base64 inline on every file | Paints instantly, no request. |
| preview | `imageUrls.preview` / `videoUrls.preview` | The very URL the grid tile already downloaded, so it is served from cache. |
| full screen | `imageUrls.fullScreen` | Videos have none; they stream instead. |

The rule that makes this hard: **a layer that will never be wanted must never be
painted**, not painted and then faded out. A layer is transparent until it is whole, and
once whole it **stays** beneath the one above it instead of stepping down, so the layer on
top always renders over a real stand-in. That is the point of the arrangement: when the
browser evicts a full-size bitmap in a long session and must re-decode it, the repaint
happens over the preview still under it, never over the black room.

The **miniature is the one exception, and it is a rendering one.** It steps down
(`miniatureRetired`, `PREVIEW_FADE_MS` after the preview is declared loaded) exactly when
the preview has finished fading over it and it becomes invisible. A covered layer is not
occlusion-culled inside the paint layer that holds it, so while it stays mounted it is
drawn again inside every raster - and it is the one layer here carrying a filter, a full
screen of `blur(24px)`. What it stood in for is the preview, which is still there.

A layer the browser already holds is therefore marked ready *before* the first render, so
it settles in at full opacity from the first frame rather than fading up from the one
below:

- `isCached(url)` probes a detached `Image` - answers for the memory cache.
- `revealIfCached()` runs in the `flush: 'post'` watcher, once elements exist - catches
  images held only on disk, which report `complete` before any `load` fires.
- `settleLayers({ full, preview })` marks those layers ready.

A layer that arrives later fades up over the solid layer beneath it, so there is never a
moment with nothing underneath. The full layer's transition is suppressed while the opening
flight hides the strip (`flight?.active`): a full that arrives then is already solid when
the strip is revealed, so the reader never sees a preview-to-full redo for a file that
loaded during the flight. One that arrives while the reader is watching still fades in.

`revealWhenDecoded()` awaits `image.decode()` before declaring a layer ready. `load` means
the bytes arrived; without decoding first, the reveal happens during paint and the image
appears in bands.

**Every image in the strip is keyed by its file.** An `<img>` handed a new `src` goes on
painting the one it already holds until the new one loads, so a page turned before that
showed the file just left as the file coming next - visible whenever paging outran the
network, and corrected only once the animation ended. Keyed, a turn builds a new element,
which can show nothing but never the wrong thing.

`inHand` is a `Set` of full-size URLs this session has actually held. It exists so a file
already looked at slides past *sharp* as a filmstrip neighbour. It is a record rather than
a probe because probing an uncached URL issues a request - acceptable for the file being
opened, not for two neighbours on every page turn.

The strip mounts only the two neighbours, and the page underneath loads its thumbnails
lazily. On a long day a reader who starts at the first file and flips forward outruns the
page, turning to files whose preview was never fetched. So each page turn **warms** the
previews of the next few files with a detached `Image` - an off-DOM fetch that fills the
browser cache but paints nothing. The `Set` of warmed URLs makes a repeated turn cheap, and
the warmed file settles in the moment it is reached instead of loading mid-slide.

The **full-size** images of the neighbours are warmed the same way, so a turn lands on a
file that is already sharp rather than watching it arrive. **Opening warms both sides**,
because the reader may flip either way from the file they just opened; a turn warms only
the one they are heading towards, which is the direction they last paged. **Not in the
mobile layout**: on a small screen the swap is invisible, the spinner is already suppressed
there, and warming a neighbour would spend traffic for nothing.

Warming alone is not enough: a layer is drawn sharp only once its URL is known to be in
hand, and a fresh probe cannot see a fetch that has just finished. So the warm's own
`onload` records the URL in `fullCached`, and `watch(current)` settles the full layer from
that record the moment the file is reached - sharp on the first frame of the turn.

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
| Double tap | Zoom to `tapZoomScale()` at that point, or back out. |
| Wheel | Zoom, with the transition held on ~180ms after each notch so discrete steps read as continuous. |
| `←` / `→` / `Esc` | Page, page, close. |
| Anything on a video **player** | Left to the player. |
| The space **around** a player | Exactly what the space beside a picture does: a mouse closes, a finger toggles the chrome, and drags page and dismiss. |

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
- **A double tap targets the wider of `TAP_ZOOM` (2.5) and the window's vertical fill**
  (`ratio * height / width`). The scale is measured against the window, so a file wider
  than the window runs out of width at rest and fills less of its height: on a tall phone
  a fixed 2.5 left a panorama short of the top and bottom edges, and magnifying it until
  it meets them is the size the reader was reaching for. A file at or under the window's
  ratio already meets those edges at rest, where that sum falls below 2.5, so `TAP_ZOOM`
  remains the floor and the tap keeps its old size there.
- **A dismissal does not fly back to the tile.** The reader already threw the picture
  somewhere; a second departure runs two animations at once.
- **A video takes gestures beside it and none on it.** `onPlayer()` hands any press on the
  element itself straight to the controls - a scrubber is a drag and would otherwise read as
  a page turn. Around it the picture's rules apply unchanged; the only difference is that
  there is no pinch and no double-tap magnify, so a tap toggles the chrome at once instead
  of waiting to find out whether a second one is coming.
- The space around a player is a **surface of its own**, laid under a strip made
  pointer-transparent, with the player alone taking presses back. It cannot simply be the
  frame: `touch-action` narrows down the ancestor chain and can never be widened again, so a
  `touch-none` frame would take the player's scrubbing with it.

## Paging

A turn - from a swipe, an arrow, or a key - always uses `slideOneFrame()`: the strip
slides one whole frame, the neighbour riding there lands centred, and the index changes
underneath it in the completion callback. So every route to the next file produces the
same movement.

- `turning` guards *only* turns. Using the general `animating` flag made hiding the
  chrome swallow the next arrow press.
- `queuedTurn` remembers **one** pending turn. A held-down arrow otherwise keeps turning
  after the key comes up.
- The queued turn is dispatched on the **next frame**, not the next tick. A tick only means
  Vue has written the reset into the DOM; style is computed once per frame, so a slide begun
  in the same one is measured from where the strip stood before the reset and travels from
  the wrong place.
- A zoomed picture cannot be slid, so `page()` there just calls `step()`.

`withAnimation(change, done, duration)` runs a change with a transition and then writes
the finished state. With motion reduced it runs both immediately - every caller therefore
writes the finished state in `done` and only sets up for it in `change`. A new call
settles any pending one first; dropping it stranded the strip a frame off centre with the
file underneath never swapped.

### A swipe that lands while a slide is still turning

The arrow model never lets the strip be grabbed mid-slide: `page()` queues one turn and
lets the running slide finish. A finger drag cannot queue that way, because a drag is the
strip itself - so overwriting `dragX` while the CSS transition is still running yanked the
mid-flight strip back to the pointer, and the previous turn's pending settle then stepped
the index under the new finger. Rapid flipping read as a slideshow of frames jumping.

So a drag that starts while `turning` is true never takes the strip over (`drag.follows`
is false); the running slide is left to finish. On release that gesture only decides
whether to add one more page, and it does so through `page()`, which queues it until the
current slide has completed - "finish the current animation, then begin the next". A drag
that starts at rest behaves as before and follows the finger.

### Slides scale to the swipe

`slideOneFrame` takes a duration. A released swipe measures its own speed and shortens the
slide (`slideMs`), so a fast fling is not left running at full length while the reader is
already starting the next one; arrows and keys keep `ANIM_MS`. The strip's CSS
`transition-duration` is set inline from the same value, or the shortened slide would
still ease over the class's fixed 200ms. The floor is `MIN_SLIDE_MS`, so a flick never
becomes a snap.

## Hero flight

Owned entirely by `HeroFlight.vue`. The viewer says what to fly and between which two
boxes; everything below is the component's business.

```js
flight.value?.fly({ src, from, to, fromRadius, toRadius, insets })
flight.value?.setSource(sharperUrl)   // mid-flight upgrade
flight.value?.cancel()
flight.value?.active                  // reactive; the viewer hides its strip
```

Boxes are viewport rectangles, radii are pixels, `insets` is the page chrome to stay under.

### Why two elements

Animating `width`/`height` changes the layout box, so every frame runs style, layout,
paint and raster - and because the decoded-bitmap cache is keyed by target size, a
continuously changing size means the image is rescaled and re-uploaded on every frame. At
2160x2880 that is what made the flight stutter, and why WebP was worse than JPEG: a slower
decoder multiplied by the frame count. Whether the file was cached made no difference,
because the HTTP cache sits upstream of all of it.

So nothing animates but `transform`, which the compositor handles: the pair is laid out
once and rasterised once.

One transform cannot both reshape the window from square to the file's ratio and leave the
image undistorted, hence a pair:

| Element | Role | At the tile end |
| --- | --- | --- |
| outer `div` | the window, `overflow: hidden` | `translate(dx, dy) scale(sx, sy)` |
| inner wrapper | the whole picture, one or two stacked layers | `scale(k/sx, k/sy)` |

The counter transform sits on a wrapper holding the image layers rather than on a single
`img`, so a sharper image added mid-flight (the fade below) rides the same transform and
never drifts out of register with the window.

with `sx = tileW/baseW`, `sy = tileH/baseH`, `k = max(sx, sy)`. The image's net scale is
`(k, k)` - even, undistorted - while the window is the tile's rectangle. That is exactly
what `object-fit: cover` shows on a square tile, so the crop opens out as it always did.

**The pair is laid out in the larger of the two boxes** (`base`), so the raster is always
made at the resolution the picture ends up needing and only ever scaled down. Both
directions benefit: closing used to rasterise a full-size picture at tile size.

### Two of the three tracks are sampled

This is the part that is easy to get wrong, and was got wrong once.

`k/sx` and the pre-scaled radius are **quotients of the outer scale**, and interpolating a
quotient's endpoints is not the same as interpolating the quotient. Written as two
keyframes each, they are correct only at the ends:

| Progress | outer | inner | net image scale |
| --- | --- | --- | --- |
| 0 | (0.222, 0.167) | (1, 1.333) | (0.222, 0.222) |
| 0.5 | (0.611, 0.583) | (1, 1.167) | **(0.611, 0.681)** |
| 1 | (1, 1) | (1, 1) | (1, 1) |

An 11% stretch halfway across, which reads as jelly; the corner meanwhile swells to twice
the tile's radius. The box animation this replaced had neither problem, because
`object-fit: cover` and `border-radius` were recomputed from the box the browser had
already interpolated.

So `buildTracks` samples those two, deriving each sample from the outer scale that instant
actually has. The window keeps two keyframes on the real curve, so its path is exact.

**Sampled in even steps of distance, not of time.** The curve front-loads hard - the first
tenth of the flight covers 40% of the path - so evenly spaced times would describe that
stretch with two samples. `timeAtProgress` bisects the curve to place them. At
`SAMPLES = 48` the residual is 0.3% of distortion on a 3:1 panorama, under 0.1% on an
ordinary frame, and 0.04px of radius.

### Staying under the page's own header

The pair sits in a frame that is exactly the viewport - so it changes no coordinates -
carrying a `clip-path: inset(top 0 0 0)`.

**The clip is fixed for the whole flight and never released.** Two earlier attempts were
wrong in the same way. Clipping only when the *tile* touches the header misses the point:
the picture grows upwards and ends against the top of the window whatever tile it came
from. Releasing the clip partway simply lets it climb over the header, at a moment that
moves with the distance, which reads as the overlap being random.

It costs nothing at the end: the viewer's own top bar stands where the header did, and the
picture is fitted below it, so the last frame of the flight and the still picture that
replaces it are cut in the same place.

The header marks itself `data-page-chrome="top"` and `services/pageChrome.js` measures it,
so the flight knows nothing about the app's layout.

### Timing

`cubic-bezier(0.2, 0.8, 0.2, 1)` over a fixed 260ms. Both are constants at the top of the
component.

**The duration is fixed on purpose.** Scaling it with the distance was tried and reverted:
on a large display the flight then ran long enough to feel like it would not end. Changing
the curve is a matter of editing `CURVE`, but the sampling residual is tuned to this
curve's shape, so measure it again after.

The inner image is `object-contain`, matching the viewer's own picture element, so the
handover at the end of the flight is exact.

### Ordering that matters

- The start transform is written inline when the elements render, so the frame before
  `animate()` runs is not the untransformed base box.
- `data-lightbox-flying` is set **before** the first `await`. On the way out the room
  begins leaving in the same tick, and the rule in `main.css` that holds its fade is keyed
  on that attribute.

### Video

| Rule | Why |
| --- | --- |
| `play()` only when `element.isConnected` | A file paged past before its metadata arrived is detached, and starting it there leaves a player with no controls left to stop it: returning to the file builds a new element, so the sound goes on with nothing attached to it. Its proportions are no business of the file now open either. |
| Presses on the player are the player's | See the gesture notes above. |
| No pinch, no double-tap magnify | There is nothing to magnify, so a tap answers at once. |

### The rest

- The source is `heroSource(item)`: the full-size image only when the browser still holds
  it in memory (`isCached`). A stale `inHand` record cannot know the browser evicted the
  bitmap, and a stale full would fly empty; the preview is always present here and the full
  is overlaid the moment it decodes. A stand-in flown to full size arrives visibly soft.
- **The source is swapped mid-flight, by a fade.** A watcher on `fullLoaded` swaps in the
  real file the moment it lands, so the last frames of the expansion are already at full
  resolution. Without it, a 400px preview finishes its journey filling a 4K display, and
  the softness is glaring at exactly the moment the picture is largest and still. Do not
  remove this to save a decode. The swap lands at the slow, large end of the flight, where
  a hard cut is plainly visible, so `setSource` decodes the file off-DOM and fades it in
  over its stand-in rather than snapping. The two layers sit in the shared counter wrapper,
  so the fade changes only the resolution in place, never the framing; a swap too late to
  finish is cut cleanly by the handover, which already holds the full image.
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
  `markOpenedFrom(el)` must be called from whatever handler opens the viewer. The media
  hover card instead calls `markOpenedWithoutSource()`, since its picture is a preview,
  and the viewer must play its plain fade rather than search for a tile.
- **Where it flies back to** (`tileBoxBack`) prefers the remembered `originTile`, even
  off-screen - the reader knows they scrolled. Any other tile must be on screen, or there
  is no destination and the plain fade does the work.
- **A return flight follows the page if the reader scrolls before it lands.** The
  destination box is captured in viewport coordinates at close; scroll unlocks ~120ms in
  and the flight is 260ms, so a reader who scrolls mid-flight would otherwise watch it
  land beside the tile. The page scrolls on the window alone, so `HeroFlight` translates
  its content by the live scroll delta (a compositor transform - no layout, no re-raster)
  to keep the flight pinned to the tile. It is applied below the frame's header clip, so
  the clip itself stays put under the sticky page header.
- **The loading wheel waits for the flight to land.** The flying picture covers the
  middle of the window, where the wheel sits and where its fade runs, so a wheel let
  in during the flight was already opaque when the flight handed over - it snapped in
  rather than appearing. `spinnerShown` holds it back until `flight.active` is false.
- `[data-lightbox-flying]` is stamped on `<html>` (not the dialog, which is unmounting)
  to suppress the room's own leave animation while a flight is running.
- Reduced motion cancels the flight entirely; the plain fade does the work.

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

## Rendering cost

The picture is one transformed cell, so a magnified one is a screenful of image at 4x or
more. Two rules keep that off the frame budget; the rest is measured, not guessed at.

| Rule | Why |
| --- | --- |
| The cell carries a layer of its own while `pictureMoving` - magnified, or a movement is running. | Without one the transform is applied by a repaint, so a pan rasterises the visible part of the magnified picture on every frame. Promoted, the pan becomes the compositor's: nothing about the frame changes. |
| The miniature steps down once the preview is solid over it. | A covered layer is not occlusion-culled inside the paint layer that holds it, and this one carries a full-screen `blur(24px)` - so it would be blurred again inside every raster. Invisible: what it stood in for is the preview, which stays. |

**What a zoom costs, measured on a QHD phone (Snapdragon 855, 60Hz).** Lowering the screen to
720p makes every gesture smooth. Dropping the backdrop blur changes nothing, and so does
serving previews only - no full-size file fetched or painted at all. So the cost is **per
device pixel of the picture's own raster**: not bytes, not the arrival of a sharper file, and
not the chrome.

That also says why the promotion fixes a pan and not a zoom. A pan only moves the picture, so
the compositor moves a texture it already has. A zoom changes the scale, and a new scale means
a new raster - a screenful of it, again and again while the scale is moving. Every path here
that asks for a new scale in one style recalc therefore pays for a screenful in one frame: the
tap zoom, its back-out, the wheel, and the chrome's own rest.

**The covered blur was the excess.** With that layer gone the same gestures are smooth at
1440p, on the device the measurement above comes from. What is left is the shape of the cost
rather than a defect - a new scale still costs a screenful - so a larger display, or anything
else added under the picture, can bring the jank back. The lever then is to let the compositor
scale the texture the picture already has and re-raster once the movement stops: what photo
apps do, at the price of a moment of softness while the hand moves. It is not in the code.

A pan writes its transform through the component's own reactivity, so a pointer event is one
render of the viewer and one layout read. That is small beside a screenful of raster and it
has never shown up in a measurement; writing the transform straight onto the cell, and
measuring the frame once when the gesture begins, is the change to reach for if it ever does.

## Template and CSS

Rules that live in the markup, each of which looks arbitrary and is not.

| Rule | Why |
| --- | --- |
| **Every file lives in the filmstrip, video included.** | Video used to sit in a branch of its own. With no strip on screen there was nothing to slide, so a turn *away* from a video swapped while a turn *towards* it slid. What actually differs is the gestures, and those are turned off per file. |
| A video cell writes `aspect-ratio` out; a picture does not. | A video has no proportions until its metadata arrives, so `height: auto` would be settled from the 300x150 every `<video>` starts life at. The file states its shape, so the element is given it outright. |
| The video cell is clipped into the band by the same transform that places a picture there. | Otherwise the controls along its bottom edge sit behind the footer. There is nothing to zoom, so that transform never leaves its resting value. |
| **Each layer but the miniature stays beneath the one above it; none is stood down.** | The layer on top always paints over a solid stand-in, so there is never a gap to the dark room. A cached layer is marked ready before first paint and settles at once; one that arrives later fades up over the layer below. The miniature is unmounted once the preview has faded over it: a covered layer is still painted, and that one carries a full-screen blur. |
| A layer is transparent **until it is whole**, not merely until it starts arriving. | A picture still downloading is painted as far as it has got and left blank below - a half-drawn photograph on white. |
| The miniature is blurred and scaled past the blur inside a box that clips it. | It is a handful of pixels; without the overscan its softened edges fray against the dark. It ships inline, so it is the only thing on screen on the one path where nothing is cached - a shared link opened cold. |
| Every layer carries `draggable="false"`. | Without it a mouse press starts the browser's own image drag and the pan never receives its moves. |
| **The bars slide out of view; they do not fade.** | A backdrop filter and an opacity transition on the same element do not co-operate - the browser holds the blurred backdrop until the opacity settles, so the bar arrives first and the blur snaps in behind it. Sliding leaves it fully opaque throughout. The arrows leave the same way for the same reason. |
| The chrome wrapper is `pointer-events-none`; each bar takes them back. | The space between the bars has to stay with the gesture surface. |
| The arrows are positioned against the **window**, not laid out between the bars. | They belong to the screen. Letting the bars decide their height moved them whenever a description or a row of tags did. |
| A clipped description carries **both** a line clamp and a max-height. | The clamp is what ends a cut-off line in an ellipsis; the max-height is what can be animated, and what the overflow check reads. They agree on two lines, so the clamp decides how it looks and the height decides how it moves. |
| The tag expander's pill is a small affordance, but the **swipe that opens and closes the list is the whole bottom bar**; a tap still toggles only from the pill. | A swipe is not a control to be aimed at, and the tags beneath it are not hurt by the overlap. **Touch runs on touch events**, not pointer events: a browser cancels the pointer stream the moment it claims a scroll, so the `pointerup` that would end the swipe never arrives on a real phone. The lifted list is clipped rather than scrollable, so no bar appears mid-expansion and the whole bar stays one gesture surface. |
| Hover on the arrows, the icons and the tag chips is scoped to `@media (hover: hover)`. | A touch screen reports a hover that never ends: the state sticks to whatever was last tapped, which left an arrow looking held down until the reader tapped elsewhere. |
| The "open in this day" link writes `?i=` but **not** `?o=`. | The file was already being looked at full screen; opening it again on arrival would be no arrival at all. The link is left out on that day's own page. |
| A private file's share button is **removed**, not disabled. | The recipient would be sent to a day that, as far as they are concerned, does not contain it. An offer that is not there cannot be taken up by mistake; a disabled one still invites it. |
| The title and the description are **selectable**. | They are the one thing in the viewer worth copying out - a place name to search for. Everywhere else is a gesture surface, and `.lightbox` sets `user-select: none`; `.lightbox-selectable` turns it back on for that block. A press that ends a selection must not also expand the description, so `toggleDescription` reads the selection before acting. |

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
8. Clicks reaching the dialog within `GHOST_CLICK_MS` of opening are swallowed. The tile
   answers a tap on `touchend`, so the click a browser invents from it lands here, on
   whatever now sits where the finger was. See
   [media-grid-and-selection.md](media-grid-and-selection.md).
8. Dismissal in `useMediaLink` listens on `pointerdown`, not `click`. A click is the tail
   of a gesture that may have started on the previous page.
9. The hero's mid-flight source swap stays. It is what keeps the end of the expansion
   sharp on a large display.
10. Strip images are keyed by file, or a turn shows the file just left.
11. A queued turn waits a frame, not a tick.
12. A video is never played from a `loadedmetadata` that arrives after it was paged past.
13. Only **one** neighbour's full-size image is warmed, and it is the one the reader is
    heading towards.
14. The title and the description stay selectable; a selection must not expand them.
15. Hover styling is scoped to `@media (hover: hover)`; a touch device must never leave a
    control looking pressed.
16. The bottom bar answers the tag swipe, on touch events for touch and pointer events
    for the mouse; a tap toggles only from the pill. The lifted list is clipped, never
    scrollable, so no bar appears mid-expansion.
17. The cell is promoted while magnified or moving. The transform is not left to a
    repaint; see **Rendering cost**.
18. The miniature is unmounted `PREVIEW_FADE_MS` after the preview loads, not at `load`:
    unmounted sooner, the preview's own fade would run over the black room. It is the only
    layer that stands down, and only because it is invisible once the preview is opaque.

## Related

- Deep linking and the share button: [sharing-and-links.md](sharing-and-links.md).
- Which tiles the viewer flies from, and selection: [media-grid-and-selection.md](media-grid-and-selection.md).
