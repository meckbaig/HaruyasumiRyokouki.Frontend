# Maps

Three maps, one Leaflet setup: the trip map over a date range, the day map on a day page,
and the coordinate picker in the media editor.

## Files

| File | Role |
| --- | --- |
| `src/services/leaflet.js` | Shared setup: tiles, pins, `createBaseMap`. |
| `src/components/map/TripMap.vue` | The map component used by the trip page and the day page. |
| `src/views/MapView.vue` | The trip page: range in the URL, calendar, fullscreen. |
| `src/components/editor/MediaLocationPicker.vue` | Coordinate picker (lazy-loaded). |
| `src/composables/useTripMedia.js` | `GET /media/locations` for a range; `routeFromMedia`. |

## Loading

**Leaflet is lazy and must stay that way.** `MediaLocationPicker` is a
`defineAsyncComponent` inside `MediaEditDialog`, because that dialog is mounted app-wide by
the selection toolbar - a static import puts Leaflet (~156kB) in the main bundle for every
visitor who never opens a map.

Leaflet objects are large and mutate constantly, so they are held in `shallowRef` and
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
| `TILE_URL`, `ATTRIBUTION` | CARTO Voyager by default - cleaner than raw OSM and keyless. Both overridable via `VITE_MAP_TILE_URL` / `VITE_MAP_ATTRIBUTION`, so a keyed provider with latin labels is a config change. |
| `PIN_PATH` | The teardrop every pin is cut from, exported so a legend can draw one. |
| `pinIconOf(color, size)` | Single pin: the drop with a white dot in its head. |
| `clusterIconOf(count)` | The same drop, larger, with the count in the head. Font shrinks past 100 and 1000. |
| `beforeIcon` / `afterIcon` | Cool blue and warm green - see below. |
| `FALLBACK_CENTER` / `FALLBACK_ZOOM` | Japan, roughly, when there is nothing to fit. |

Pins are inline SVG `divIcon`s, so a single marker and a cluster share one silhouette and
both theme cleanly without shipping PNGs. `.trip-pin` in `main.css` strips Leaflet's
default divIcon box.

### Wheel zoom

`createBaseMap(container, { wheelZoom })` decides between two behaviours:

| `wheelZoom` | Behaviour | For |
| --- | --- | --- |
| `false` (default) | Wheel scrolls the page; **Ctrl/⌘ + wheel** zooms the map, and a bare wheel calls `onScrollHint` so the caller can flash a hint. | A map embedded in a scrolling page. |
| `true` | Leaflet's own smooth wheel zoom. | A map that fills the window. |

The reason for the modifier is a page waiting to be scrolled behind the map. Full screen
there is no page, so the modifier would be a toll on the one gesture everybody reaches for.
Both the trip map and the picker make this distinction.

The guarded path calls `event.preventDefault()` to stop the browser's own ctrl+wheel page
zoom, and applies one zoom level per notch by hand.

### Re-framing is separate from drawing

`fitToPoints` is kept apart from drawing the markers because it has to run **again**. A map
built inside a box that has not been laid out yet - an overlay opening, a section
unfolding, a tab appearing - computes its zoom against a container of no size and keeps
that zoom for good. `invalidateSize` tells Leaflet the box changed and does nothing about
the framing, which is why a map sometimes sat at the wrong scale over the right centre.

Only until `userMoved`, though. After the reader takes the wheel the view is theirs, and
re-framing because a sidebar opened would be taking it back.

## Popups

Built as **real DOM, never an HTML string**, so a title or file name can never be
interpreted as markup.

The thumbnail repeats the grid's two-stage scheme: blurred miniature underneath, preview
fading in over it. It is a **landscape strip**, which is the shape a popup wants above a
caption and a date in a narrow column.

It was square for a while because miniatures then arrived pre-cropped and the box cropped
that again - a horizontal file came out zoomed in twice. Miniatures now carry the file's own
proportions, so there is only ever one crop.

The preview sits underneath at full opacity and the miniature fades **off** it, so one of
the two is always solid and the swap never flashes.

Popup links carry `withMediaLink({}, id)` - `?i=` alone, so the day opens with the file
outlined rather than full screen.

## The trip page

The range lives in the URL (`?from=&to=`) so a link shares the exact stretch. With nothing
picked, the effective range is the whole trip, taken from `days.orderedDates` - which is why
`reload` also watches `days.orderedDates.length`.

The calendar picks a start, then an end, then starts over. `rangeStartLabel` /
`rangeEndLabel` are passed here (and only here): a calendar answering the first click with
one dark square says nothing about what the second click is for.

### Fullscreen is a second map

A **new instance**, not this one teleported. A live Leaflet map carried through a
`Teleport` comes out broken - blank tiles, and dead once it is put back. The location
picker builds two for the same reason. Both are driven from the same media, so they show
the same thing and neither knows about the other.

The view locks `body` scroll while expanded and clears it on unmount - nothing else would
put the page back if the route left while expanded.

## The day map

`DayView` renders `TripMap` with the day's located media and `dayRoute`. It can be hidden
by default; the preference persists in `localStorage` under `haruyasumi.dayMapHidden` and
each day starts from it.

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
| The route line is drawn **before** the pins. | Dots say where the trip was; the line says which way it went, and that is what places a photograph. Same dashed red as the trip map - the same thing at a smaller scale. |
| The two anchors carry a permanent time label, not a `title`. | A native tooltip takes about a second and never appears on a touchscreen, while "how long before, how long after" is the whole reason the anchors are worth telling apart. |
| A margin round the map does not answer a click. | Every map control sits in a corner, and a press that missed one by a few pixels used to move the pin. Placing a point is deliberate; missing a button is not. The margin is sized from the box, so it reads the same on a 220px strip and full screen. |
| A paste of `34.304847, 133.090327` sets the point. | That is how anyone actually knows where a photograph was taken - Google Maps copies a place in exactly that form. Listened for on the **document**, since the map is not focusable, and ignored when a real input is the target, or pasting a description would move the pin. |
| Collapsing from full screen returns the small map **to the point**, not to where it was left. | Going full screen is what people do to place a pin precisely, so the pin is what they were looking at. |
| The inline map's wrapper is `isolate`. | Leaflet stacks its panes from 200 to 800; without a stacking context those numbers compete with the rest of the dialog, and the map painted over the tag suggestions dropping out of the field above it. |
| The neighbour-pin hint draws a pin **beside** the sentence. | The muted drops are the only thing on the map nobody put there deliberately. Named on their own they explained neither which marks they were nor what they were for. |
| The map hints occupy two fixed rows below the 220px map. | Reference points arrive after the editor opens; replacing the second row must not move the fields below. |

## Invariants

1. Leaflet stays lazily imported through `MediaLocationPicker`.
2. Leaflet instances live in `shallowRef` / `markRaw`.
3. Popups are built as DOM, never HTML strings.
4. Fullscreen builds a second map; never teleport a live one.
5. `wheelZoom: true` only for a map filling the window.
6. Map ranges live in the URL.

## Related

- The three-day reference window: [media-editor.md](media-editor.md).
- The calendar ribbon: [days-and-calendar.md](days-and-calendar.md).
- `[data-no-swipe]` so the map keeps its own drags: [days-and-calendar.md](days-and-calendar.md).
