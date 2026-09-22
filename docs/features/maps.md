# Maps

Three maps, one MapLibre setup: the trip map over a date range, the day map on a day page,
and the coordinate picker in the media editor.

## Files

| File | Role |
| --- | --- |
| `src/services/mapEngine.js` | Shared setup: the basemap style registry, pins, piles, clock chip, `createBaseMap`, `setBaseScheme`, `Marker`. The only importer of `maplibre-gl`. |
| `scripts/build-map-style.mjs` | Builds every hosted style: both MapToolkit ones from the published `summer.json`, and OpenFreeMap's dark scheme from its `bright`. |
| `public/map/maptoolkit-light.json` | MapToolkit's `summer` with the terrain stripped; the light scheme points at it. |
| `public/map/maptoolkit-dark.json` | The same with every colour's lightness inverted; the dark scheme points at it. |
| `public/map/openfreemap-dark.json` | OpenFreeMap's `bright` recoloured for the night; the dark scheme points at it. |
| `src/components/map/TripMap.vue` | The map component used by the trip page and the day page; owns the pin album. |
| `src/components/map/MapMediaCard.vue` | The album over a pin: one file at a time, arrows, keyboard. |
| `src/views/MapView.vue` | The trip page: range in the URL, calendar, fullscreen, viewer, the expand mark in the map's corner. |
| `src/views/DayView.vue` | The day page: its map's toolbar (open on the trip map, taller, full screen). |
| `src/components/editor/MediaLocationPicker.vue` | Coordinate picker (lazy-loaded). |
| `src/composables/useTripMedia.js` | `GET /media/locations` for a range; `routeFromMedia`. |
| `src/services/mapLinks.js` | `hasCoordinates`, and the one place a map-service URL is built. |
| `src/services/mapIcons.js` | The `d` strings for the map buttons: expand, collapse, taller, shorter. |
| `src/services/cardMorph.js` | The pin-into-preview unfold, played from JavaScript. |
| `src/services/routeArrows.js` | The whole route on two canvases stacked over the map box, chevrons or a plain line, with a ringed dot at every distinct ground a pile holds. |
| `src/services/mapClusters.js` | The cell clustering the pins and the route dots share. |
| `src/assets/main.css` | The two-stage thumbnail class the pin, the pile and the grid tile share; the card's closed geometry and the quarter-fold timing of its chrome; the map's overlay z-index stack; the clock above a pin or a pile. |
| `src/services/deviceBudget.js` | `markerBudget()` and `dotBudget()`: how many marks this device class may draw. |
| `src/components/common/MediaStrip.vue` | The album's turn: the viewer's filmstrip on its own. |
| `src/components/media/MediaLightbox.vue` | The viewer's "show on the map" action, which lands back here. |

## Loading

**MapLibre is lazy and must stay that way.** `MediaLocationPicker` is a
`defineAsyncComponent` inside `MediaEditDialog`, because that dialog is mounted app-wide by
the selection toolbar - a static import would put MapLibre (~1MB) in the main bundle for
every visitor who never opens a map. `mapEngine.js` is the only module that imports it, and
it is reached from the lazy map views and the async picker alone.

MapLibre objects are large and mutate constantly, so they are held in `shallowRef` and
`markRaw`, never in plain reactive state.

## Data

One request per range: `GET /media/locations?from=&to=` returns only geotagged files.
There is no day-by-day walk.

`routeFromMedia(media)` sorts by `created` and returns `[lat, lng]` pairs. The line is the
path through the day - up the hill, along the river, back to the station - which on the
scale of one day is most of what a map has to say. The same function draws the trip line
across months and the day line on a day page.

`useTripMedia` aborts an in-flight request when the range changes; dragging the calendar
outruns the network easily.

## Shared setup

| Export | Notes |
| --- | --- |
| `mapStyleFor(scheme)`, `setBaseScheme(map, scheme)` | The provider registry and the one place the basemap is swapped; which provider is on is `MAP_PROVIDER`. See Basemaps below. |
| `Marker` | MapLibre's marker, re-exported so the engine module is the only importer. |
| `PIN_PATH` | The teardrop every pin is cut from, exported so a legend can draw one. |
| `pinIconOf(color, size)` | A teardrop with a white dot in its head - the picker's pins. |
| `clusterIconOf(count)` | The same drop, larger, with the count in the head. Used by the picker. |
| `photoPinIcon(media, { withTime, locale })` | The trip and day maps' pin: a **square** thumbnail as a DOM element the map attaches as a marker, so the miniature-then-preview pair can be attached. `withTime` stamps the file's own clock on the picture, which only a **day** map asks for. |
| `photoClusterIcon(count)` | A square pile with the count in it, matching `photoPinIcon`. |
| `BEFORE_COLOR` / `AFTER_COLOR` | Cool blue and warm green; the picker builds a pin of each. |
| `FALLBACK_CENTER` / `FALLBACK_ZOOM` | Japan, roughly, when there is nothing to fit. `[lng, lat]`. |

### Basemaps

One registry in `services/mapEngine.js` names every provider, and the environment picks one:
`VITE_MAP_PROVIDER` is `maptoolkit` (default), `openfreemap` or `carto`.

| Provider | Kind | Light | Dark |
| --- | --- | --- | --- |
| MapToolkit | vector | the hosted `public/map/maptoolkit-light.json` | the hosted `public/map/maptoolkit-dark.json` |
| OpenFreeMap | vector | `styles/bright` | the hosted `public/map/openfreemap-dark.json` |
| CARTO | raster | `voyager` | `dark_all` |

**Every provider is a MapLibre style**, so a raster provider is wrapped in a style of its
own: one `raster` source over the tile URL and one `raster` layer. That is what makes a
scheme change a single `setStyle`. MapLibre cross-fades the new tiles itself, so a theme
switch is a transition rather than a swap. `VITE_MAP_STYLE_LIGHT` / `VITE_MAP_STYLE_DARK`
override one scheme's URL, which is how a self-hosted or keyed style is swapped without a
component changing.

**The basemap follows the theme's `scheme`.** `createBaseMap` takes `scheme`, and `TripMap`
and `MediaLocationPicker` watch `resolvedTheme.scheme` and call `setBaseScheme`. `setStyle`
drops runtime layers, so the picker re-adds its reference lines on `style.load`.

**MapToolkit's licence wants the logo and the copyright line always visible.** The map is
built with `attributionControl: false`, and two controls of our own carry the copyright line
bottom-right and, for MapToolkit, the logo 24px bottom-left. MapLibre's own attribution
control collapses behind a button, which the licence does not accept. OpenFreeMap needs the
copyright line alone.

**The basemap is capped on a large viewport.** `createBaseMap` passes `pixelRatio` from
`pixelRatioFor(container)` - `min(devicePixelRatio, 1.5)`, and `1.25` above a 1920x1080
viewport - because painting cost scales with the framebuffer. `fadeDuration` is `150`, not
MapLibre's `300`, and `maxTileCacheSize` plus `prefetchZoomDelta` bound a pan's refetches.
The provider's tile, glyph and sprite hosts are `preconnect`ed before the first tile is
asked for.

Both MapToolkit styles are generated and hosted: `scripts/build-map-style.mjs` fetches the
published `summer.json`, **strips the terrain, the contours, the road labels and the road
shield's sprite**, and writes `public/map/maptoolkit-light.json` - 83 layers, 20 of them
symbols, over two sources. It then writes a dark copy with **every colour's lightness
inverted**, keeping hue and saturation, so the dark map carries summer's cartography in dark
tones. The flags are `KEEP_TERRAIN`, `LABELS`, `CONTOURS` and `LEAN`.

**OpenFreeMap's dark scheme is Bright, at night.** OpenFreeMap publishes no dark style built
to Bright's own standard - `dark` and `fiord` are unmaintained upstream forks with a
fraction of the labels - so the build script fetches `styles/bright` and writes a dark copy
of it: every label, every POI and every road Bright has.

**The night city is a fixed palette**, stated once as constants at the top of the OpenFreeMap
pass in [`scripts/build-map-style.mjs`](../../scripts/build-map-style.mjs): the ground and the
landuse fills, the buildings, the streets and the motorways. A casing takes the tone of the
road it carries, and every landuse class that Bright tint - urban, hospital, school,
cemetery - takes the ground tone, so nothing in a city glares. Change a tone there and the
style is rebuilt; no component and no document carries a colour.

**Everything else is the reflection of Bright** - water, parks, landcover, the labels and the
POIs (`INVERT_FLOOR`, `INVERT_SCALE`) - except the non-road lines (rails, ferries, boundaries,
runways, waterways), which keep a muted band above the ground (`ROAD_HUE`, `ROAD_SATURATION`,
`ROAD_FLOOR`, `ROAD_SCALE`). The route-number **shields** are a sprite plate that cannot be
recoloured, so they are muted with `icon-opacity`; the POI glyphs come from that same sprite,
so the POI **names** carry the night map rather than the icons.

### Why MapLibre, and not Leaflet

Leaflet could not carry a vector basemap smoothly. The `maplibre-gl-leaflet` bridge drew
MapLibre into a Leaflet pane and re-rendered it behind Leaflet's events: it throttled pan
updates to `updateInterval` (32ms, about 30fps), pre-rendered a 1.2x-area container, and
CSS-scaled a rasterised canvas through every zoom. That was a stray frame on each zoom, an
occasional blank map, a zoom that swapped layers in one frame, and a pan under 60fps. A pure
MapLibre map owns its own camera, tile cross-fade and render loop, so none of those exist.

**Terrain, contours and labels were the whole cost of that provider.** `rgb-tiles` and
`bathymetry` are DEM sources: on every pan MapLibre fetched terrain tiles and ran the
hillshade and depth shaders. The site is a flat photo backdrop, so the relief is dropped and
the low-zoom `naturalearth` raster is the only terrain cue left. The `contours` source is a
second vector source fetched on every zoom, so it is dropped too; `CONTOURS=1` restores it.

**The labels are the other half, and the part that still stutters.** The published style
carries 41 symbol layers, and MapLibre places labels on the **main thread** every frame a
tile arrives. POIs, house numbers, the road sub-labels and the road shield are dropped,
leaving 20 over `place_label` and `water_label` alone, and `crossSourceCollisions: false` in
`createBaseMap` drops the cross-source pass. Dropping the shield is also what lets the
sprite go. `LABELS=full` restores every label; `LABELS=none` drops them all.

Picker pins are inline SVG elements, so a single marker and a cluster share one silhouette
and both theme cleanly without shipping PNGs. The map attaches the element itself as a
marker, anchored by its tail.

The trip and day maps draw `photoPinIcon` instead: a 44px square of the file itself, in the
same miniature-under-preview arrangement every wall of thumbnails uses, with a white frame
and a small tail. It is HTML rather than an SVG string because the preview's `load` listener
has to be attached to fade it in over the miniature.

**The picture is one shared thing.** The crop, the miniature blur, the corner and the
`is-ready` handover are `.thumb-stage` / `.thumb-base` / `.thumb-shot` in `main.css` - the
same classes `MediaThumb` wears - so a pin, a pile and a grid tile cannot crop or blur
differently. A pile is a DOM marker element and can mount no component, so the shared part is a
class plus one factory (`setStagePicture`), never a second hand-written pair: that second
implementation is exactly how the pin's crop and the pile's blur came to drift from the wall.

**The figures are a fraction of the box, and the crop is not negotiable.** 10px of blur over a
~300px wall tile is a mush over a 44px pin, so `--thumb-blur` and `--thumb-scale` are stated
where the mark is: 2px and 1.02 on a pin or a pile. The crop itself (`cover`, about the
centre) is declared with `!important`, because a mark lives in the map's own marker layer and
the stylesheet that sizes the map's images must not be able to un-crop one - which is exactly
what it did to the turned pile's two sliding layers, the one picture the pair's own
rule never reached. `.trip-photo-cluster-img` is named in the guarded rule too, and the
blur is **theirs alone**: the quiet pair takes `.thumb-base` / `.thumb-shot` like a lone pin,
so a pile without the turn shows a preview rather than a blurred miniature of its own.

A **day** pin also carries its file's clock, on a chip **above the frame**, from the map's own
`mode` and `useI18n()` locale. The hour is the sequence a day page is read as, and the album is
otherwise the only place it is said. The picture is 40px wide and `2:35 PM` does not fit in it,
while the centre of the box is the subject and the bottom centre is the tail - so the chip stands
**outside** the picture's box, where nothing clips it, wearing the pile's own count badge at 10px
with its own background. A **pile** wears the same chip and names the member its face is on, so a
turn and a close that adopts a member both move it; the trip map says nothing at all. A pin's
icon cache is keyed by file **and** mode **and** locale, and a change of locale clears it -
without that, whichever map was built first decides whether the clock exists at all.

### Grouping

Pins are grouped by `TripMap` itself, **by distance in projected pixels at the current zoom**,
through `services/mapClusters.js` - the module the route dots cluster with too. Two files that
land on top of one another become one pile and separate again as the reader zooms in. A pan
changes no distance, so the grouping is recomputed on a zoom - but a pan does change **what the
box draws**, and that is what the budget is measured on, so a settle that drags into a denser part
of the trip may widen the cell. A settle never narrows it: the grouping is cut again on the next
zoom, so piles do not split under the reader's hand. The merge runs at every zoom but the deepest,
where the reader has zoomed in to pull two pins apart and a pile would be in the way.

| Constant | Value | Why |
| --- | --- | --- |
| `PIN_UNCLUSTER_ZOOM` | `MAX_ZOOM` (`19`) | Only the deepest zoom stops the merge, so a reader can always pull two pins apart by zooming to the end; until then the default cell applies and only the budget may widen it. At the deepest zoom the budget may **not**, or a large trip would re-merge the pins exactly where the reader asked for them apart. |
| `CLUSTER_CELL` | `30` | The default merge distance, in screen pixels: about two thirds of a pin, so two pictures that cover each other become one pile. |
| `CLUSTER_STEP` | `10` | How much the cell grows when the budget is exceeded. |
| `CLUSTER_CELL_MAX` | `240` | A ceiling, so a pile never swallows the map. |
| `DOT_CELL` | `5` | The dots' own default merge distance: they are far more numerous and each stands for a single ground. |
| `DOT_STEP` | `5` | How much the dots' cell grows when their budget is exceeded. |
| `DOT_CELL_MAX` | `50` | The dots' ceiling, so a cluster never swallows a stretch of route. |
| `CULL_PAD` | `120` | Markers are built this far outside the box, so one is ready before it scrolls in. |

**The distance is to a cluster's centroid, never to one of its members.** A point joins the
nearest cluster whose running mean is within the cell, so a line of close files cannot drag a
far one in - that chain is what once collapsed a whole country into one pile. The cell is then
grown by its own step until the number counted fits the budget, and the **smallest cell that
fits** is the one used, so a country view is one pin per city. The growth stops at the deepest
zoom, where the merge is off altogether and the budget is not allowed to bring it back.

`markerBudget()` is a fixed figure per device class: a phone or tablet gets 50, a desktop 500.
A measuring loop would spend the resource it guards, and its verdict would vary with whatever
else the machine was doing. It is counted against the groups the **box** draws, never against
the whole trip: a country of marks nobody can see is no reason to coarsen the street in front
of the reader, which is what counting the trip did.

**The dots under the pins carry a budget of their own** - `dotBudget()`, read exactly as the
marker one is: 100 on a phone or tablet, 1000 on a desktop. Their cap is counted the same way,
on the clusters **the box draws**, so a dense stretch off screen cannot coarsen the dots in
front of the reader; the canvas is not clipped and keeps every cluster for a pan, but only the
visible ones are seen. Over the budget the grounds are merged by the pins' own centroid rule at
the dots' **own** cell figures (`DOT_CELL`, `DOT_STEP`, `DOT_CELL_MAX`), one dot per cluster on
its centroid; under it nothing is merged at all, so an ordinary trip and the day map are drawn
exactly as before. The pass runs where the pin grouping runs - a zoom or new data - and never on
a pan, which does not move a ground.

**Only the visible ones exist.** `syncMarkers` draws the groups that fall in or near the box and
takes the rest out of the DOM on `moveend` and `zoomend`, so panning onto empty ground costs
nothing. A settle that could change the cell is answered a frame later
(`requestAnimationFrame`), so a burst of settles costs one recompute, never one per event. A
pin's icon is kept between rebuilds, **in the cache of the map that asked** (`photoPinIcon`
takes the map as its scope), so a zoom no longer makes a fresh `<img>` and a fresh load for a
picture already fetched - and two maps live at once, an inline one and an expanded one, never
share one DOM node. A loaded pin also **drops its blurred miniature**, after the preview's own
fade, because a covered blur on every pin is the one cost this map cannot pay - exactly as the
viewer does it in [media-viewer.md](media-viewer.md).

**A pile is a pin, and it keeps a picture.** `photoClusterIcon` builds the **pin's own shape** -
the 44x51 frame, the tail, the ground at the bottom centre - so a pile opens into a preview by
the same movement a single pin does. The count sits as a badge in the corner.

**The turn is a mode, and it is off.** `PILE_TURN` in `services/mapEngine.js`:

| `PILE_TURN` | Pile shows | Ticker |
| --- | --- | --- |
| `false` (shipped) | one member's full pair, miniature **and** preview, exactly as a lone pin | none |
| `true` | miniatures only - blurred, as every miniature is - sliding every `PILE_CYCLE_MS` on one shared tick | one timer per map |

The turn is visually busy, and loading a preview per pile is the cost that first argued for
miniatures; the quiet mode keeps a pile readable and lets its picture be a preview like every
other mark on the map. Both behaviours stay behind the one flag so a later pass can weigh the
trade-off again instead of re-deriving it.

In turn mode the two sliding layers take the shared guarded crop and carry the miniature blur
themselves; with the turn off the pair takes `.thumb-base` / `.thumb-shot` and the pile's
picture is as sharp as a lone pin's once its preview has loaded.

In turn mode one ticker turns **every visible pile on the same tick**, over `PILE_CYCLE_MS`
and with `MediaStrip`'s own curve and beat. It pauses while the tab is hidden and under
reduced motion. Nothing cycles in the album: an opened pin or pile **becomes** the preview,
stepped by hand.

**A pile publishes which member is in its frame.** The icon keeps its cursor, and the marker
copies it into `__clusterCursor` on every turn, so what is on screen and what a press opens
cannot disagree:

- **Open** starts the album on the member the pile shows, not on the group's first.
- **Close** adopts the member the card closed on - `setPileFace` writes it with no slide -
  and holds that pile's cursor for one `PILE_CYCLE_MS`, so the ticker cannot replace the
  picture the reader just came back to. With the turn off there is no ticker to skip and the
  landed member simply stays.

MapLibre's own clustering is not used. Its headline behaviours are the ones this map does
not want: a press that zooms, and a pile that fans out into a carousel of pins that no
longer sit where the files are. The shared pure module keeps the pile a pin's own shape.

A pile answers with the **earliest file it holds**, so the arrows that follow walk the same
chronology a single pin does, and it never zooms. With the turn on it answers with the member
its face is on, so the album opens on the picture that flew in - see the pile's face below.

**Every point knows the ground of its group.** Grouping records, for each point index, the
ground of the pile or pin it falls in - `groundOf(index)`. The album's anchor is that ground,
so a step inside one pile moves nothing and a step between two grounds pans the map to the new
one. Pinning the anchor to the whole session instead removed every pan, because the anchor
then never changed.

### The route is a row of arrows, on two canvases

`services/routeArrows.js` draws the whole route onto **canvases** rather than a marker per
chevron: `[pin] >>>>>> [pin]`. A marker per arrow put every chevron of a trip in the DOM
whether or not it was on screen, which is what made a long route jank; a canvas costs one
element and draws only what the box shows.

**Two of them, stacked over the map box.** The chevrons sit at `z-index: 1` and a pile's
grounds at `z-index: 2`, so a dot is read **over** the row it terminates while both stay under
every pin (`z-index: 3`). Both canvases share one projection and one redraw, so a dot and the
chevron beside it cannot drift apart. The stack is in `main.css`.

**The path is clipped to the box first**, and both the stamping and the cap work on what is
left: the chevrons are laid at an equal distance apart, and `ROUTE_ARROW.max` is the most that
may appear **on screen**, not along the whole trip. A route zoomed into one point therefore
keeps its spacing instead of spending the budget on the kilometres off frame; over the cap the
row spreads rather than piling up.

- **Redrawn on every `move`, once per frame.** MapLibre fires `move` through a pan and a zoom
  alike, so one rAF-guarded redraw keeps the row on the view actually on screen; a resize
  redraws too. Clipping keeps each draw to a handful of chevrons.
- **A dot at every pile member's own distinct ground.** The chevron row is stamped along the
  files' own coordinates while a pile's mark stands on their centroid, so without them the row
  begins and ends in mid-air. One dot per **distinct** coordinate in a pile: two files shot from
  one place are one point, and a pile whose members all share a coordinate stands on the mark's
  own point already, so it contributes nothing at all. Never the centroid, which the mark
  covers, and never a lone pin, whose own mark is the point the row runs to. It takes the arrows'
  own colour at 2.2px of radius with a ring of the mark's own frame (`ROUTE_ARROW.dotRadius`,
  `.dotRing`), so a dot standing among chevrons is not read as one of them. Painted in the same
  pass and the same projection as the chevrons, so they scale and travel with the row - and one
  z-index above them, so a chevron never covers a dot it passes. Over `dotBudget()` the grounds
  merged by the same centroid rule at the dots' own cell figures, and the cap counts the clusters
  **the box draws**; one dot stands on each cluster's centroid, and the canvas keeps every cluster
  for a pan.
- **The chevrons are the line**: in `arrows` mode no path is stroked at all. `ROUTE_STYLE`
  switches between `arrows` and `line`, so the plain solid line can be compared by hand.
- **Nothing rides a transform.** The chevrons are projected and drawn in **screen pixels** on
  every `move`, so there is no CSS scale of a rasterised canvas and no stale view to resync -
  the stray frame a transform was meant to hide cannot happen. A marker needs none of this:
  MapLibre carries every marker itself.
- **The canvases take no presses**, and they are clipped to the box: the distance between
  chevrons and the cap are measured on what is on screen, never on the whole trip.
- **Every arrow figure lives in this module** (`ROUTE_ARROW`): spacing, cap, size, stroke
  weight, line weight and an optional colour. Nothing outside it holds an arrow number.

### Wheel zoom

`createBaseMap(container, { wheelZoom })` decides between two behaviours:

| `wheelZoom` | Behaviour | For |
| --- | --- | --- |
| `false` (default) | Wheel scrolls the page; **Ctrl/⌘ + wheel** is MapLibre's own zoom, and a bare wheel calls `onScrollHint` so the caller can flash a hint. | A map embedded in a scrolling page. |
| `true` | The same MapLibre zoom on a bare wheel, with no modifier. | A map that fills the window. |

The reason for the modifier is a page waiting to be scrolled behind the map. Full screen
there is no page, so the modifier would be a toll on the one gesture everybody reaches for.
Both the trip map and the picker make this distinction.

**MapLibre's scroll zoom is always on; the guard is what differs.** A guarded map holds a
bare `wheel` in the **capture** phase and stops it before the map's own listener sees it, so
the page scrolls and the map does not. Ctrl/⌘ + wheel is not held back, so MapLibre gives it
its own smooth, trackpad-aware zoom and stops the browser's page zoom itself. A map built
with `wheelZoom` skips the guard and zooms on a bare wheel.

**Ctrl + drag pans, though MapLibre reserves it for rotation.** `generateMousePanHandler`
starts a drag only when `!e.ctrlKey`, and rotation is off on every map here, so Ctrl+drag
once did nothing at all. `addCtrlDragPan` re-dispatches the press without the modifier; the
moves that follow are accepted as they are, because only a drag's start is checked.

**Reduced motion is honoured where this code starts an animation itself.** MapLibre's own pan
and zoom are continuous camera movements with no reduced-motion switch, so the one place a
choice is made is `showMedia({ zoom: true })`: it `jumpTo`s under reduced motion and `easeTo`s
otherwise. Nothing else needs a branch, because nothing rides a transform.

### Re-framing is separate from drawing

`fitToContent` is kept apart from drawing the markers because it has to run **again**. A map
built inside a box that has not been laid out yet - an overlay opening, a section
unfolding, a tab appearing - computes its zoom against a container of no size and keeps
that zoom for good. `map.resize()` tells MapLibre the box changed and does nothing about
the framing, which is why a map sometimes sat at the wrong scale over the right centre.

**The fit leaves room for a pin above its point.** A pin is anchored by its tail at the
coordinate and stands upward, so the **top** margin is the side margin plus the pin's own
height - `PIN_H`, from `PHOTO_PIN_SIZE` and `PHOTO_PIN_TAIL`, never a second hardcoded
number. At the side margin alone the northernmost pin is cut off, and a taller pin in a
later pass would widen the gap without anyone remembering why it was there.

**The refit belongs to the first layout only.** A `framed` flag is set once, after the first
fit taken with a box that has a size, and no later resize re-fits: a resize keeps the centre,
because MapLibre pans by the change of centre and the ground that was under the middle lands
on the new middle. Handing a view to the expanded map is unchanged: `getView()` /
`initialView` still wins over any refit.

## The album over a pin

`MapMediaCard` is a Vue overlay inside the map's own box, not a map popup. A popup is DOM
handed to the map library, and this one has to unfold with an animation, take the keyboard
and read the app's stores - which is a component, not a string.

**The pin becomes the card.** While the card stands its marker is **not drawn**
(`paintSelection` sets `display: none` on it), so there is never a pin and a card for the same
file. The frame is anchored by its **bottom edge at the point** and pulled up by its own
height, so it grows **upward and sideways**, and its **tail** - the pin's own mark, a small
triangle at the bottom centre - keeps touching the point throughout.

The unfold is a **layout** animation, not a scale: the frame animates its width and height
from the pin's rectangle to the card's, the picture keeps its top edge and its height follows,
and the footer strip fades in once the box has opened far enough to hold it. A scale would
move the picture and shrink the text, and the point is that the title and the buttons
**appear** in the strip the pin opens underneath itself. It is played by
`services/cardMorph.js` from `enter`, which runs after the element is in the DOM and before
the first paint, so the card is never seen at full size first; the close is the same movement
reversed, and reduced motion resolves it at once.

**It is pinned to the ground, not to the file.** The anchor is the ground of the pin or pile
the file on show belongs to, so walking the files under a pile does not drag the card to their
own coordinates. `showMedia(id, { zoom: true })` is the one caller that pins it to a file,
because there the reader asked for that file.

### What a re-frame centres

**One rule, on a press and on a step alike: the card's own centre is brought to the middle of
the box.** It grows upward from the point, so its centre is half its height above the ground.
A step and the press that follows it therefore leave the card in the same place, and a repeat
press on a centred card moves nothing at all. The offset is **`reference - target`** and the
sub-pixel return stands.

`frameReason` still decides the one thing left: a step **inside one pile** pans nothing, the
ground on show having not changed.

**A step re-frames at once**, on the frame after the step, not when the turn lands: the
picture's own move and the camera's are then one movement rather than two. Only a press waits
for the unfold, because there the card's own height is the target.

**One frame, shared.** The pin, the pile and the card take their frame, border, radius and tail
from `--mark-frame`, `--mark-border` and `--mark-tail`, so the unfold has no seam - a white pin
frame against a themed preview was the loudest one - and a change of theme recolours all three
together.

**The closed state is the pin, down to the pixel - and stated in CSS.** The morph animates the
inner padding, the picture's radius and the opacity of the close, the arrows, the badges and
the footer along with the size, and the closed geometry is the pin's own: the same 44x51 box,
the same 7px tail allowance, the same 2px ring around a 40px picture (`--map-card-border` and
`--map-card-pad`, both stated by `.map-card.is-closed`), the same 8px radius, and a **square**
picture. `.map-card.is-closed` writes that box as well as animating to it, so when the morph
lets go of its own fill the card is still the pin and nothing snaps. The square matters: a 16:9
rule takes the pin's 40px picture to 22.5px and leaves the bottom gap the close was showing.

**The ring and the shadow hand over at the middle; the chrome goes at the ends.** The card's
inner box wears a wide shadow where the pin wears a tight one, and the chrome - the close, the
arrows, the badges, the text - is not on the pin at all. The ring and the shadow change half a
fold in; the chrome leaves inside the **first quarter** of a close and arrives in the **last
quarter** of an open, so it is never seen crossing a fold that has hardly moved. The two
directions therefore carry different transitions, which is what lets the delay belong to the open
alone. Reduced motion never applies the state, so there is nothing to time.

**The last of a close is a fade, and only a turned pile has one.** There the card was showing a
miniature the pin will not, so the pin comes back **under** the card - the pile has already
adopted the member that flew in - and the card fades away over it. The card is the pin's own
rectangle by then, so the two coincide and nothing is swapped in a single frame. Everywhere
else the fold's last frame is already the pin, so `done()` runs at once and the fade is only a
delay before the map comes back.

**The open box is measured, not the pin's.** The end of the morph is the card laid out, so
`enter` drops `is-closed`, reads the box and the picture, and puts the class straight back in
the same frame - the first painted frame is still the pin, and the padding transition is stood
down for that one reading so it is not mistaken for a movement. Measuring while the card was
still closed is what made an open end in a snap and a close leave a gap.

It travels with the map instead of hanging over it: the anchor is recomputed on every
`move`/`zoom`. It is a fixed width against the map box, its **height follows its content**
(capped at 360px, the most it ever needs), and it is **always above the point** - the card is
never clamped down over its pin, the frame moves instead.

**It follows the map on every frame of a movement.** The card is placed in container pixels
outside the map's own canvas, so `TripMap` recomputes its anchor from `map.project` on `move`,
once per frame. There is no separate zoom path and nothing to resync at a settle: MapLibre
fires `move` through the whole gesture, so the card is placed on the view actually on screen.

| Behaviour | How |
| --- | --- |
| A press on a pin opens it | `marker.on('click')`. `bubblingMouseEvents: false`, or the map's own click would put it straight back away. |
| A press on the picture | Opens the viewer full screen - the same way a grid tile does. |
| A press on the card elsewhere | Does nothing at all: neither opens nor closes. `TripMap` compares the press point against the card's rectangle. |
| A press on the map beside it | Closes it. |
| Stepping | The arrows, `←`/`→`, or a swipe. The card walks the pins in **capture order** and the map pans to the one chosen - it does not zoom. |
| The turn | `MediaStrip`, which is the viewer's own filmstrip on its own: only the file on show and its two neighbours are mounted, and the track slides a whole frame aside. A step arriving mid-slide is **queued**, never snapped. The card carries the **whole** of the viewer's guard - one remembered step dispatched a frame after the settle, "ignore while turning", and a settle fallback - so a **held** arrow keeps its beat instead of running the index on and snapping the strip there. Its content - badges, open-full target, service links, primary action - reads `shownIndex`, the frame `MediaStrip` reports it **settled** on, never `props.index`, which names where a running turn is going. |
| The frame making room | `frameCard` pans with `panBy`, keeping the zoom. The offset is **`reference - target`**, since `panBy` moves the centre by its offset and a point therefore by the negative of it. **What is centred follows the map and the action** - see above. A step re-frames at once, with its own slide, so the two are one movement; a step **inside one pile** does not pan at all, the ground on show having not changed. |
| Keyboard ownership | The handler listens in the **capture** phase and stops the event, so the day page's own arrow keys do not also page the whole day underneath it. It answers only while the card is **inside the viewport**: a map scrolled out of frame - the editor below it - hands the arrows back to the page. `hasOverlay()` stands it aside for a dialog or the viewer, which own the keyboard themselves. |
| The unfold | `<Transition name="map-card">` with **JavaScript** hooks. The start is the pin's rectangle and the end the card's own box, both measured in `enter`, so the card is never seen at full size first. |
| The tail | A triangle at the frame's bottom centre - the pin's own mark - its tip at the anchor, so the two read as one mark. |
| The close | Its own compact square target (`1.75rem`, glyph `0.875rem`) in the top-right corner, not the viewer's 40px disc, and it carries the viewer's `backdrop-filter: blur(10px)`: it stands on a picture rather than on a bar, and the colour alone left it flat against the image. |
| Opening full screen | `markOpenedFrom(photoElement())` - the card's picture **is** the tile the viewer flies from, so the opening is the grid's opening, from the same service and with the same flight. |

**It takes no presses of its own.** Only its controls answer a hand - `pointer-events: none`
on the frame, `pointer-events: auto` on the icons and on the text, which is there to be
selected. Everything else belongs to the map, and that is what makes a drag, a wheel and a
pinch over the picture behave like the map: the page does not scroll, and Ctrl+wheel zooms
the map instead of the browser. On a touch screen the card's own **swipe** is worked out in
`TripMap` from the touch's geometry - the card cannot receive the touch itself - with the
same axis lock the day page's gestures use.

**A gesture is decided where it begins.** A touch that starts inside the card stands the map's
own drag down for the length of that gesture - `dragPan.disable()` at `touchstart`, back with
the last finger - because the map's drag handler has already seen the same event and stopping it
later cannot undo the pan it began. The card's axis lock then has the gesture to itself: a
horizontal swipe pages the album and never moves the map, while a drag outside the card still
pans and a two-finger pinch over the picture still zooms.

**The marks under it take no presses.** A press on the card's picture falls through the frame to
whatever is under it, and a marker lying there answered with its own album - so pressing the album
opened a different pin than the one it stood over. While a card stands, every marker whose icon
rectangle intersects the card's own takes `pointer-events: none`; the ones beside it keep theirs,
so a press on one of those still moves the album to it.

It borrows `MediaHoverCard`'s look deliberately - the same badges, the same two-stage
picture - and the **Lightbox's own buttons**: `lightbox-chrome` carries the viewer's palette
without the dark room, so `.lightbox-icon` and `.lightbox-arrow` resolve on the card. Two
things differ, and each follows from where it stands:

- **No vertical scroll.** The list is moved with arrows, the keyboard and a swipe.
- **The stamp follows the page.** A day page has already said the date, so the card stamps
  the **clock** alone; the trip page says date and time, because there the day is not a fact
  the reader has.
- **Every action is an icon**, and the primary one is "open day" on the trip page and
  "go to media" on a day page - the action the reader is actually in a position to take.
- **The picture fills the card's width** as one landscape strip (`MediaThumb` with
  `aspect="16 / 9"`), and the whole of it is the way to the album - there is no separate
  button for that.

The links out to a map service come from `MAP_SERVICES` in `services/mapLinks.js`: the URL is
built in one place, so a provider can be swapped or a regional entry added without touching a
component.

### The viewer and the album speak

`TripMap` has one entry point that puts the album on a file - `showMedia(id, { zoom })` - and it
is the only place that knows what an album on a file means.

| Caller | Call | Effect |
| --- | --- | --- |
| The viewer closed | `showMedia(id)` | Opens the album on the file that closed, at the ground of its group, and never touches the view. A file this map does not hold closes the album, so a stale card goes with it. |
| The viewer's map action | `showMedia(id, { zoom: true })` | The same selection, framed at `FOCUS_ZOOM`. |
| An expanded map mounting | `showMedia(initialSelection.id)` | The album travels with the view, with no zoom and no fight with the handed-over view. |

The viewer hands over the id it was **showing when it closed**, not the one it was opened on,
so a reader who paged away is not handed back the wrong picture. Both views wire its `@close`;
neither listened before, and `MapView` had no map action at all.

**Only a viewer opened from a card moves the map, and the map itself says so.** The day page
opens one from a grid tile, a note's card and a shared link as well, and none of those asked the
map for anything. `TripMap` records that its own card opened the viewer and puts the album back
from its own state on the close; the day page drops that record whenever the lightbox is gone,
because a viewer can also leave with no close event. A flag in the view went stale the moment the
address was rewritten for the `?i=` pair, which is why a close from a card did nothing. `MapView`
needs no such gate: every viewer it opens comes from a pin.

**The action re-frames the album it did not open.** A card already standing is not re-mounted, so
its own unfold hooks cannot re-frame it; the zoomed `showMedia` therefore waits for the view to
settle - with a fallback, because a view already at its target fires no `moveend` - and then asks
for the frame. That leaves the **preview** centred, rather than the point centred with the preview
hanging above it.

## The trip page

The inline map wears the same corner mark the day page's full-screen control does - `MAP_EXPAND`
in `.map-float-control`, passed through `TripMap`'s `controls` slot. The slot renders after the map
box and before the album, so the mark needs one z-index over the map's own layers and stays under
the card. The header carries reset and share alone.

The range lives in the URL (`?from=&to=`) so a link shares the exact stretch. With nothing
picked, the effective range is the whole trip, taken from `days.orderedDates` - which is why
`reload` also watches `days.orderedDates.length`.

The calendar picks a start, then an end, then starts over. `rangeStartLabel` /
`rangeEndLabel` are passed here (and only here): a calendar answering the first click with
one dark square says nothing about what the second click is for.

### Fullscreen is a second map

A **new instance**, not this one teleported. A live map carried through a `Teleport` comes
out broken - blank tiles, and dead once it is put back. The location
picker builds two for the same reason. Both are driven from the same media, so they show
the same thing and neither knows about the other.

The inline map's **view is handed over** (`getView()` into `initialView`), so the expansion
opens where the reader stood and does not re-fit the points - which could land far wider and
read as "the world map". Given a view, the new map keeps it until the reader moves it.

**The album moves, it is not copied.** `getSelection()` into `initialSelection` puts the expanded
map's album on the file the inline one had open, through `showMedia`, and the inline map's own
album is closed in the same tick. A card left standing on the map behind is what killed the
arrows in full screen: both maps listen on `document` in the **capture** phase, and the one
behind is registered first, so it answered the key, stepped its invisible album and stopped the
event before the map in front ever heard it.

**Collapsing hands both back** - the full-screen map's `getView()` through `applyView`, and its
`getSelection()` through `showMedia` - a tick later, so the window's map is on the ground the
reader left, with the album they had open, and the pile behind it shows the file the album shows.

The collapse control wears `.map-float-control`: paper at four fifths over the viewer's own
`backdrop-filter: blur(10px)`, the glass the album's close stands on, so the mark reads as
floating over the map rather than as a flat box painted on it. The location picker's own
full-screen collapse takes the same class, so one control looks the same everywhere.

The view locks `body` scroll while expanded and clears it on unmount - nothing else would
put the page back if the route left while expanded.

## The day map

`DayView` renders `TripMap` with the day's located media and `dayRoute`. It can be hidden
by default; the preference persists in `localStorage` under `haruyasumi.dayMapHidden` and
each day starts from it.

**"Go to media" folds the map first.** The album's primary action on a day page follows the file
into the grid. While the map fills the window, that overlay sits over the grid the reader is being
sent to, so the action folds the map and waits for `map-full` to leave (the fold's own
`MAP_REVEAL_MS`) before it writes the link and scrolls. The album is not handed back to the inline
map: the reader is leaving the map, not returning to it.

| Control | Does |
| --- | --- |
| Open on the map | A link to the trip page with `?from=<date>&to=<date>`, so the day becomes the range there. |
| Taller / shorter | Swaps the height between `min(360px, 100vh)` and `min(900px, calc(100vh - 12rem))`. Both are `min()` expressions of the same shape, which is what lets the height interpolate; the icon changes to say which way the next press goes. |
| Full screen | A **second** map in a `Teleport`, exactly as the trip page builds one. The page stays where it is underneath. Both the viewer's close and its map action go to whichever map is in front, which is what makes the full-screen one answer at all. |

**The page search is stood down on the map's own flights.** The day page tells the viewer the page
is covered while its map fills the window, and, inline, while the viewer was opened from the map's
album. The element an opener handed over is untouched, so a grid tile and the album's card still
fly from and back to themselves - and the grid's own flight keeps its scroll follower; only a
search with no element to hand is stood down, and such a close plays the plain fade. See
[media-viewer.md](media-viewer.md).

The map body is `data-no-swipe`, so panning it never pages to another day.

### Coming from the viewer

The viewer's map icon (see [media-viewer.md](media-viewer.md)) hands a file back to the day
map. The viewer closes itself first, so the close's own path has already put the album on the
file that was on screen; `DayView.showMediaOnMap` then keeps its own extras - reveal and scroll
to the inline map when nothing is full screen, wait for the fold - and calls
`TripMap.showMedia(id, { zoom: true })` on whichever map is in front. That frames the file and
opens its album on it, at `FOCUS_ZOOM` (`14`), and the album **hides the pile the file sits
under** - so the pile cannot
stand between the reader and the file they asked for. Only the deepest zoom leaves the pin
standing on its own (see `PIN_UNCLUSTER_ZOOM` above); at `FOCUS_ZOOM` the pile is hidden
instead. The wait before the call is the fold's own 260ms plus a margin: a map framed before
it has been laid out computes its zoom against a box of no size.

This is the one place a pin **is** zoomed to, because the reader asked for that pin
specifically. A press on a pin never zooms.

**The note's card reaches the same file without the viewer.** A media reference's hover card
offers "open on the map" for the file on show when it carries coordinates, and the day page
answers it with the same `showMediaOnMap`, so the map is revealed, scrolled to and framed on
that file exactly as the viewer's own action does. The step remembers the line it was followed
from **and pushes a history entry**, so the page's own back button and the browser's Back both
return to the note. It writes **nothing into the address**, though: the files are not outlined in
the wall and the page is not scrolled to it, since the reader is going to the map. Only a follow
into the pile carries a `?i=`. See [rich-text-and-links.md](rich-text-and-links.md).

Long days are **paged** so the map is not a long scroll away: the day's grid opens on four
rows and keeps the rest behind one button. With "hide the map by default" the page assumes
the reader is not heading for the map and the grid is not paged at all. See
[media-grid-and-selection.md](media-grid-and-selection.md).

**A follow to the map settles the wall first.** With the map hidden by default the grid has
no page and reveals its own chunks, and one arriving under the glide pushed the map past the
point the scroll was aimed at, leaving the reader on grid that had just appeared. The page
calls the grid's `finishRevealing` before it aims the scroll. See
[media-grid-and-selection.md](media-grid-and-selection.md).

## The coordinate picker

Reference points come from a three-day window around the file - see
[media-editor.md](media-editor.md) for how they are fetched.

`bestView()` decides the opening frame, in order:

1. An existing coordinate → centre on it at zoom 15.
2. A selection's own points → fit their bounds. They are the subject of the map.
3. **The last point before and the first point after** → fit those two.
4. Only one side exists → centre on it.
5. Otherwise → fit everything known about that stretch.

Case 3 is the whole idea: those two are the answer, not context - whatever is being placed
happened between them, usually within a few hundred metres of the line joining them. They
are told apart by hue (cool for behind, warm for ahead) and by being full size rather than
muted like the rest. "Which of these is the earlier" is the question the picker exists to
answer.

`fitBounds` is capped at `maxZoom: 16`: a photograph taken seconds after the last one gives
a gap of a few metres, and framing that exactly puts the map on a rooftop with no idea
which rooftop.

### Picker details

| Rule | Why |
| --- | --- |
| The framing is applied **once per file**, and only once something is known. | A reader who has panned off looking for a rooftop must not be dragged back by a fetch landing a moment later. |
| The route line is drawn **before** the pins. | Dots say where the trip was; the line says which way it went, and that is what places a photograph. The same red as the trip map's route - the same thing at a smaller scale. |
| The two anchors carry a permanent time label, not a `title`. | A native tooltip takes about a second and never appears on a touchscreen, while "how long before, how long after" is the whole reason the anchors are worth telling apart. |
| A margin round the map does not answer a click. | Every map control sits in a corner, and a press that missed one by a few pixels used to move the pin. Placing a point is deliberate; missing a button is not. The margin is sized from the box, so it reads the same on a 220px strip and full screen. |
| A paste of `34.304847, 133.090327` sets the point. | That is how anyone actually knows where a photograph was taken - Google Maps copies a place in exactly that form. Listened for on the **document**, since the map is not focusable, and ignored when a real input is the target, or pasting a description would move the pin. |
| Collapsing from full screen returns the small map **to the point**, not to where it was left. | Going full screen is what people do to place a pin precisely, so the pin is what they were looking at. |
| The inline map's wrapper is `isolate`. | The map's own overlay layers are z-indexed; without a stacking context those numbers compete with the rest of the dialog, and the map painted over the tag suggestions dropping out of the field above it. |
| The neighbour-pin hint draws a pin **beside** the sentence. | The muted drops are the only thing on the map nobody put there deliberately. Named on their own they explained neither which marks they were nor what they were for. |
| The map hints occupy two fixed rows below the 220px map. | Reference points arrive after the editor opens; replacing the second row must not move the fields below. |

## Invariants

1. `maplibre-gl` is imported only by `services/mapEngine.js`, which is reached from the lazy
   map views and the async picker - never the main bundle.
2. Map instances live in `shallowRef` / `markRaw`; markers are plain objects held in a `Map`.
3. The pin album is a Vue component in the map's own box, never a map popup built from a
   string.
4. Fullscreen builds a second map; never teleport a live one.
5. MapLibre's `scrollZoom` is on for **every** map; `wheelZoom` only decides whether a bare
   wheel is held back. The guard runs in the **capture** phase, so a bare wheel never reaches
   the map's own listener, while Ctrl/⌘ + wheel is MapLibre's own and stays smooth. Ctrl+drag
   is re-dispatched without the modifier, because MapLibre reserves the modifier for rotation.
6. Map ranges live in the URL.
7. A marker is a DOM element, not the map canvas, so a press on a pin never reaches the map's
   own click - which would close the album the same instant it opens.
8. The album's key handler runs in the **capture** phase and stops the event it answers, so
   the day page's arrow keys do not page the day underneath it, and only while the card's
   rectangle meets the viewport, so a map scrolled out of frame gives the keys back. It is
   not an `overlayStack` token: that would hold the page's scroll lock through the viewer
   opened from it.
9. A press on a pin never zooms; the arrows pan and keep the zoom. The one place a pin **is**
   zoomed to is `showMedia(id, { zoom: true })`, reached from the viewer's own action.
10. Pins are grouped through `services/mapClusters.js` (`clusterByCell`), not by MapLibre's
    own clustering. The distance is to a cluster's **centroid**, never to a member, so a pile
    cannot chain across a country; a pile never fans out and never zooms.
11. The album is `pointer-events: none`; only its controls and its text take presses. A drag,
    a wheel or a pinch over the picture is the map's, which is what keeps the page from
    scrolling and Ctrl+wheel from zooming the browser.
12. The map box is wrapped in an `h-full` element of its own. A window-filling map is given
    its height by a flex parent, and a child's `height: 100%` needs a parent that has one -
    without it the fullscreen map is a black rectangle.
13. A map-service URL is built in `services/mapLinks.js` and nowhere else. The map icons are
    built in `services/mapIcons.js` and nowhere else, so an entry and its exit cannot drift.
14. The unfold is a **layout** animation, not a scale: the frame animates width and height
    from the pin's rectangle to the card's, and the picture keeps its top edge. A scale would
    move the picture and stretch the text. It is played from `enter`, after the element is in
    the DOM and before the first paint, so the card is never seen at full size first.
15. The card is **always above** its point, anchored by its **bottom edge**, and carries a
    tail at its bottom centre whose tip is the point. It is never clamped down over its own
    pin; the frame moves instead.
16. The pin is not drawn while its card stands: the pin becomes the card, and the close
    folds it back before the pin returns.
17. A press on the card's picture opens the viewer through `markOpenedFrom`, so the flight is
    the grid's own; the card is never a stand-in.
18. The route is drawn on **two canvases** stacked over the map box - the chevrons at
    `z-index: 1`, the grounds at `z-index: 2` and still below every pin. The path is **clipped
    to the box** and both the spacing and the cap are measured on what is left, so the cap
    counts chevrons on screen. It is redrawn on every `move`, so a pan and a zoom are the same
    case. `ROUTE_STYLE` picks between the chevron row and the plain line, and only one is
    drawn. The dots at a pile's **distinct** grounds are painted on the dot canvas, in the same
    pass and the same projection as the chevrons - never at the centroid the mark covers, and
    never on a lone pin, whose own mark is the point the row runs to. A pile whose members
    share one coordinate contributes no dot, and one that repeats a coordinate contributes it
    once. Over `dotBudget()` the grounds are merged by the shared centroid rule at the dots'
    own cell figures, and the cap counts the clusters **the box draws**; one dot stands on each
    cluster's centroid, and the canvas keeps every cluster for a pan.
19. The canvases ride nothing: the chevrons are projected and drawn in **screen pixels** on
    every `move`, once per frame behind an rAF guard, so the row is always on the view actually
    on screen. There is no CSS scale of a rasterised canvas and no stale view to resync, and
    reduced motion needs no branch here.
20. The turn is `MediaStrip` - the viewer's filmstrip on its own - and not a second
    implementation of it. A step arriving mid-slide is queued, never snapped. The card carries
    the viewer's **whole** guard, and its content follows the frame the strip **settles** on,
    never the index a running turn is heading for.
21. Markers are culled to the padded box and capped at `markerBudget()`, and the cap counts
    the groups **in that box**, never the trip: what is off screen costs nothing and must not
    coarsen what is on it. A settle may widen the cell because the box changed, never because
    a distance did. A marker's element is reused across a rebuild that keeps its key, so a zoom
    does not make a fresh picture; the map never draws a mark per file at a whole-country zoom.
    The dots are cut in the same pass as the pins, never on a pan, and their `dotBudget()` cap
    counts the clusters the box draws too.
22. The frame always brings the card's **own centre** to the middle of the box, on a press and
    on a step alike. The offset is **`reference - target`**, because `panBy` moves the centre by
    its offset. A step re-frames **at once**, so its own slide and the camera are one movement;
    a step inside one pile does not pan at all, which is the one thing `frameReason` still
    decides.
23. A pile is the pin's own shape. Its turn follows `PILE_TURN`, **off by default**: one
    member's full pair and no ticker, or miniatures only on one shared tick. The album never
    cycles: an opened pin or pile becomes the preview, stepped by hand.
24. The preview is anchored to the **ground of the group** the file on show belongs to, not to
    the file, so stepping the files under a pile does not move it. `showMedia(id, { zoom: true })`
    is the one caller that pins it to a file.
25. A pile publishes its face on the marker: the album opens on the member the pile shows, and
    a close adopts the member the card closed on and holds it for one cycle.
26. The pin, the pile and the card share `--mark-*` for frame, border, radius and tail, and the
    morph animates the inner padding, the picture radius and the chrome, so both ends of it are
    the pin - including the 44x51 box, the 7px tail and the closed 2px inset around a **square**
    picture. `.map-card.is-closed` states that box as well as animating to it, so nothing snaps
    when the morph releases its fill. The fade after it belongs to a **turned pile** alone: only
    there did the card show a miniature the pin will not. The ring and the shadow hand over at the
    **middle** of the fold; the chrome leaves inside its first quarter and arrives in the last of
    an open.
27. The pin, the pile, the grid tile and the turn's two sliding layers take their crop from
    **one shared rule**. A second hand-written pair is a defect, not a shortcut. The turn's
    layers carry the miniature blur themselves; the quiet pair takes `.thumb-base` /
    `.thumb-shot`, so a pile without the turn shows a preview, as a lone pin does. The figures
    scale with the box (`--thumb-blur`, `--thumb-scale`) - a 44px mark cannot take a 300px
    tile's - and the crop is declared `!important`, because a mark lives in the map's own
    marker layer.
28. The map is framed on the **first layout** only; a later resize keeps the centre, and a
    resize is never a reason to re-fit the points. The resize observer calls `map.resize()`, so
    MapLibre pans by the change of centre and the middle keeps its ground.
29. A day pin stamps its file's clock, and a change of locale drops the drawn markers and
    rebuilds them. Without that, whichever map was built first owns the mark.
30. The album has **one entry point**, `showMedia(id, { zoom })`: the viewer's close (which
    carries the id it closed on), the viewer's map action (`zoom: true`) and `initialSelection`
    all go through it, and a file the map does not hold closes the album. `getSelection()` into
    `initialSelection` carries the album over an expand and back over a collapse, and it is
    **moved** rather than copied - a second card left standing on the map behind answers the
    keyboard first. `applyView` brings the view back with it. A close moves the map only when the
    map's **own card** opened the viewer: the map records that itself and answers through
    `syncViewerClose`, so the answer cannot go stale as a flag in a view did. The action re-frames
    a card that was already standing, because such a card is never re-mounted.
31. Every map builds its own markers, so two maps live at once never share a DOM node; and
    while a card stands, the markers its rectangle covers take no press, or the press would
    move the album to a pin under it.
32. The card follows the map on every frame of a movement: it sits in container pixels outside
    the map's canvas, and `TripMap` recomputes its anchor from `map.project` on `move`. There is
    no separate zoom path and nothing to resync at a settle.
33. A gesture that begins on the card owns the map's own drag for its length: `dragPan` is
    disabled at `touchstart` and enabled again with the last finger, because the drag handler
    has already seen the same event and stopping it later cannot undo the pan it began.
34. A control a page floats over the map goes through `TripMap`'s `controls` slot, which renders
    after the map box and before the album: one z-index stands over the map's own layers and
    under the card.
35. On a day page the viewer is told the page is covered while the map fills the window, and,
    inline, while the viewer was opened from the map's album; it then neither searches the page
    for an origin nor takes a grid tile as a destination, the element an opener handed over being
    untouched. The viewer reads the flag **once as it opens**, so a close that drops it cannot
    swap the mark the flight is heading for. "Go to media" folds a full-screen map first.
36. The note card's map action is the day page's own `showMediaOnMap`, the same entry point the
    viewer's map button uses, and it carries the file **on show**, never the reference. It
    remembers the line and pushes a step to return from, but writes no `?i=`, so the wall is
    neither outlined nor scrolled to.
37. A follow to the map settles the wall before the scroll is aimed: a grid still revealing
    its own chunks is opened whole, so the map below it cannot move under the glide.
38. The basemap is one registry in `services/mapEngine.js`, selected by `VITE_MAP_PROVIDER`,
    and **every provider is a MapLibre style** - a raster one is a generated style with a
    `raster` source. The basemap follows the theme's `scheme` through `setBaseScheme`, driven
    from the components, never from the service.
39. MapToolkit's attribution is a **non-collapsible** line plus a 24px logo; both stay
    visible at every size and zoom, and neither may be hidden behind a toggle.
40. The basemap's canvas is capped on a large viewport (`pixelRatioFor`), so a 4K map is a
    little softer than the screen would allow. That softness is the price of holding frame
    time; the figure is one line and verified by hand. `fadeDuration` is below MapLibre's
    default for the same reason, and never zero, so a tile still fades in.
41. A fit leaves the **pin's own height** above its points: the top margin is the side margin
    plus `PIN_H`, read from `PHOTO_PIN_SIZE` and `PHOTO_PIN_TAIL`. A margin written as a
    number cuts the northernmost pin off the moment the pin is resized.
42. A hosted style is **regenerated, never hand-edited**: the build script writes it from the
    provider's own style. The night city's tones are constants at the top of the OpenFreeMap
    pass and live nowhere else - no colour belongs in a component or in this document. The
    dark scheme keeps the light one's labels, rather than falling back to a stripped provider
    style.

## Related

- The three-day reference window: [media-editor.md](media-editor.md).
- The calendar ribbon: [days-and-calendar.md](days-and-calendar.md).
- `[data-no-swipe]` so the map keeps its own drags: [days-and-calendar.md](days-and-calendar.md).
