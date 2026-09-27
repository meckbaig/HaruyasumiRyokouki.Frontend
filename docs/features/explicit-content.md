# Explicit content (18+)

A file marked 18+ is kept behind its blurred miniature everywhere - grid, map, viewer -
until the reader uncovers it in place. There is no explicit column in the database: the mark
is the tag whose slug is `18+`, so detection is one service and one session set.

## Files

| File | Role |
| --- | --- |
| `src/services/explicit.js` | The mark and the session's uncovered set: `isExplicit`, `isExplicitCovered`, `revealExplicit`. |
| `src/composables/useExplicitReveal.js` | The reactive wrapper over that set: `isRevealed`, `reveal`, `isCovered`, `revealVersion`. |
| `src/components/media/MediaThumb.vue` | Every wall's two-stage thumbnail; withholds `is-ready` while covered. |
| `src/components/media/MediaTile.vue` | The grid tile; the uncover control and the corner badge. |
| `src/components/media/MediaLightbox.vue` | The viewer; layer gating, the centre control, flight and strip source. |
| `src/components/media/HeroFlight.vue` | The flight; takes a `blur` flag for a covered file's miniature. |
| `src/components/media/FavoritesShowcase.vue` | The front-page wall, which draws its own pair of images. |
| `src/components/map/MapMediaCard.vue` | The album over a pin; the badge in its own corner row. |
| `src/services/mapEngine.js` | Pins and piles; a covered mark draws only the miniature. |
| `src/components/map/TripMap.vue` | Rebuilds the marks when a reveal lands, so a pin never lags. |
| `src/components/editor/MediaEditDialog.vue` | The warning shown as the tag is set. |
| `src/assets/main.css` | `.explicit-mini` / `.explicit-mini-img`, `.lb-reveal`, and their keyframes. |
| `src/i18n/locales/{ru,en,ja}.json` | `media.revealExplicit`, `media.explicitHint`, `media.explicitBadge`, `editor.explicitWarning`. |

## The mark

The API carries no explicit flag. Such files are tagged `18+` (slug `18+`, id 800, coined by
hand), and every list sees the tag as `TagPublicDto { slug, value }`. `isExplicit(media)`
scans that array in either model shape. It matches the **slug**, never the caption: the
caption is translated, the slug is not.

## Covered, and for how long

`isExplicitCovered(media)` is `isExplicit(media) && !isRevealed(media)`. The uncovered set is
in memory, keyed by media id, and lives in `services/explicit.js` - framework-free, so a
reader that is not a component (the map engine) sees the same ids. `useExplicitReveal` wraps
it with a `revealVersion` signal for anything that must re-render. So a file uncovered on a
tile opens already uncovered, one uncovered in the viewer is uncovered on the grid behind it,
and a map pin settles the moment the reveal lands. It is **never persisted**: a fresh visit
starts hidden.

## The badge

A small `media.explicitBadge` plate stands in the bottom-left row of a preview - the grid
tile, the map's album card and the front-page wall - beside the hidden and video marks. It
is shown **whether or not the file is uncovered**: it reports what the file is, not what the
reader has done about it.

## Where the preview is held

Nothing about the loading changes - every layer is fetched exactly as before, only its
opacity is gated.

| Surface | Rule |
| --- | --- |
| `MediaThumb` | The stage never takes `is-ready` while covered, so `.thumb-shot` stays at the `opacity: 0` it already starts from. Uncovering adds the class and the preview fades in on the existing 260ms rule. |
| Lightbox layers | The preview and full-size `<img>` bind `opacity-100` only when the file is uncovered; the miniature is not retired (`miniatureRetired` needs `!covered`). |
| Lightbox wheel | `armSpinner` returns while covered, so no spinner is armed for a picture that will not be shown yet. |

## The blurred miniature

Away from a wall's own base, a covered miniature is drawn through **one** presentation:
`.explicit-mini`, a clipping box, holding `.explicit-mini-img` - `object-fit: cover`,
`transform: scale(1.1)`, `filter: blur(32px)`. That pair is shared by:

| Place | How |
| --- | --- |
| Viewer ground layer | The miniature layer holds an `.explicit-mini-img` in its fit box. |
| Filmstrip neighbour | A covered neighbour is an `.explicit-mini` box holding the same image. |
| Hero flight | The `blur` flag makes the flying image an `.explicit-mini-img`. |

So the viewer, the strip and the flight agree to the pixel and a handover between them cannot
jerk. The blur is a constant radius, so as the flight's window grows the softness travels with
it continuously; only the crop changes, exactly as it does for a sharp picture.

**The wall keeps its own base.** A wall draws the shared `.thumb-base`, at figures sized for a
small box (`10px` of blur, `scale(1.05)`). Holding the walls to the viewer's heavier figure
was tried and reverted: on a tile it read as a grey smudge rather than a photograph, and a
wall is a preview, not the picture. A flight out of a wall therefore crosses from the softer
base to the shared one - the one seam this design keeps, and the place to look first if it
ever shows.

| Alternative weighed | Why not |
| --- | --- |
| Hold the wall to the shared figures | Read as a grey smudge on a tile; a wall is a preview, not the picture. |
| Animate the blur across a flight | Keeps both ends, but adds a value to interpolate in step with the window - and the two forms still differ outside a flight. |
| Bake the blur into the bitmap (canvas) | Identity for free and the blur scales with the picture; costs a decode and a canvas pass per file and a fallback for the first paint. |
| Leave the movement unblurred | A miniature still shows its subject, so the picture leaks - the one thing the mark exists to prevent. |
| Skip the flight for covered files | Removes the movement the rest of the viewer has. |

**Why this does not cost a frame.** A `filter` puts the element in a composited layer of its
own: the blur is rasterised **once**, and a movement only composites that texture. The flight
animates `transform` alone, and a page turn slides the strip by `transform`, so neither
recomputes the blur per frame. If a measurement ever shows the turn re-rasterising, the lever
is to promote the strip while it turns (`will-change-transform`, as the picture cell already
does while moving).

## The uncover control

| Where | How |
| --- | --- |
| Grid tile | A centred button that is a **sibling** of the tile's own `<button>`, not a control inside it - a press inside that button would open the viewer. `hover-reveal`, so it arrives on approach (always, where nothing hovers). |
| Viewer | A centred `.lb-reveal` pill, keyframe enter/leave, held back until the chrome is measured and no flight is running. |

## The flight and the strip

`heroSource` and `stripSrc` return the miniature for a covered file. Opening and closing
therefore fly the blurred miniature, and a neighbour sliding past is its blurred miniature
too, so neither the flight nor a turn flashes the picture being hidden. `upgradeFlight` and
the `fullLoaded` watcher skip the mid-flight swap to the sharp image.

This is also the general rule about the miniature in a flight: it is flown **only when no
preview or full-size image is shown above it**. When the sharper layer is on show it flies
instead, and the miniature is not spent as a second, redundant layer.

## The map

`mapEngine.setStagePicture` settles the preview for a file the reader has uncovered, and
draws only the blurred miniature while it is covered - the check is the shared, framework-free
one, so a pin never lags a reveal made in the album or the viewer. A mark carries no uncover
control: it is too small to press. A pin is plain DOM rather than a component, so `TripMap`
rebuilds its marks when `revealVersion` changes, exactly as it does for a locale change. The
album card over a pin draws a larger `MediaThumb`, which blurs and uncovers with every wall.

## The editor

`MediaEditDialog` shows `editor.explicitWarning` beside the translation notice whenever
`18+` is on the tag list - the same place a save's other consequences are announced, before
the save is made.

## Invariants

1. The mark is the tag **slug** `18+` - never a column, never the caption, which is
   translated and would break on the first rename.
2. A fresh visit starts hidden. The reveal set is memory-only, shared for the session, and
   is discarded on reload; do not persist it.
3. Image loading is untouched. A covered file's preview and full-size layers are **loaded
   and left dark**, not skipped - switching the fetch off would make the uncover a wait.
4. The uncover control on a tile is a sibling of the tile's own button, never nested in it,
   because a press inside that button opens the viewer.
5. The uncovered set lives in the framework-free service; components read it through
   `useExplicitReveal` (so they re-render), and the map engine reads it directly. One set,
   so a reveal on any surface is seen by all of them.
6. The miniature joins a hero flight only when nothing sharper is shown above it.
7. A covered miniature is drawn through **one** presentation - `.explicit-mini` +
   `.explicit-mini-img` - by the viewer's ground layer, a filmstrip neighbour and the flight,
   so a handover between them agrees to the pixel. A wall keeps its own `.thumb-base`, at
   figures sized for a small box; the crossing from it to the shared one is a known, accepted
   seam. The filter's own layer is what keeps the blur off the frame budget, so do not move
   it onto an un-promoted ancestor.
8. The badge is always shown for an explicit file, uncovered or not.

## Related

- The two-stage thumbnail it rides on: [media-grid-and-selection.md](media-grid-and-selection.md).
- The viewer's layers and flight: [media-viewer.md](media-viewer.md).
- The tag dictionary and slugs: [tags.md](tags.md).
