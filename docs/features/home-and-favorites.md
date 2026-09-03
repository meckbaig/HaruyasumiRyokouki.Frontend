# Front page and favourites

The landing page: a search field, a drifting wall of picked-out photographs, the calendar,
and the trip map.

## Files

| File | Role |
| --- | --- |
| `src/views/HomeView.vue` | The page. |
| `src/components/media/FavoritesShowcase.vue` | The drifting wall. |
| `src/services/favorites.js` | `toggleFavorite`. |
| `src/api/media.js` | `GET /media/favorites`, `PATCH /media`. |

## Favourites as data

`GET /v1/media/favorites` returns `MediaFileDto[]` **shuffled and capped by the backend**.
Nothing on the client sorts or trims it, and the order differs on every visit.

They arrive loose rather than inside their days, so each file's day comes from its own
`created` timestamp via `mediaDate()` - which is what the viewer's "open day" button
follows.

`favorite` rides on both media models but is **`null` for anyone not signed in**, so the
star on a tile is editor-only. Marking one is a PATCH carrying nothing but `favorite`, and
the new value is written back onto the cached object rather than refetched - see
[media-grid-and-selection.md](media-grid-and-selection.md).

A locale switch refetches: titles and tags arrive in one language. The set comes back
reshuffled, which is no loss on a wall that was random to begin with.

**A failed request leaves the wall out** rather than putting an error on the front page.
Nothing here is the reason a visitor came, and the calendar below is still the way in.

## The front page is not linkable

Deliberately outside the `?i=` contract. The list is shuffled and capped, so the same
parameter that works on a day would point into a set that no longer exists on the next
visit. `copyMediaUrl` takes a `path` override for exactly this: the viewer opened from the
wall shares a link to the file's own **day**.

## The drifting wall

Pictures hang at **one height and keep their own width**, so a portrait stands narrow
between two landscapes instead of every frame being cropped to the square the day pages
use. The edges fade out, so a picture enters and leaves rather than being cut off.

### Why it is a real scroll container

The drift is nothing but `scrollLeft` moving on its own. That is what lets the two coexist:
the wall can be pushed by hand at any moment and the drift picks up from wherever it was
left. An animated transform could do neither.

### Fractional scroll

The position is kept **in a local variable and only ever written**, never read back. A
browser returns `scrollLeft` rounded to whole pixels, so a step of a third of a pixel was
written and then read as nothing, over and over - the wall stood still while the loop ran
perfectly. Keeping the fractional position in hand is what makes a slow drift (22px/s)
possible at all.

`written` records the last value set, so a scroll originating anywhere else can be told
apart from the loop's own.

### The seam

Drifting needs somewhere to drift to, so **the wall is hung twice** and the scroll jumps
back by exactly one copy's width each time it has passed one - landing on an identical
picture in an identical place, so the seam is invisible.

The repeat distance is measured as **the distance between a frame and its twin**, not as
half the scrollable width, because that width also carries the container's padding and a
gap.

Standing still, one copy is all there is.

**This is why a file appears on the page more than once**, and one of the reasons
`markOpenedFrom` exists - see [media-viewer.md](media-viewer.md). `fileAt(index)` maps a
frame back to its file with `items[index % items.length]`.

### Motion

`drifting` honours the same choice as the rest of the site: the system's reduce-motion
setting unless the visitor opted back in. Standing still is a fine state - the wall is still
a scroll container, so every picture stays reachable by hand.

The drift is also held while a hand is on the wall and while the tab is in the background.

### Proportions

Each file carries `aspectRatio`, so the wall is laid out correctly on the first frame -
nothing is hung at a guess and corrected as pictures arrive, and no frame resizes under a
wall that is trying to drift.

A file without one is hung as a modest landscape (1.5) and corrected from its **miniature**,
which ships inline and can be measured before anything is fetched.

The wall waits up to `SETTLE_TIMEOUT` (1500ms) for miniatures before setting off regardless.

## Invariants

1. Never sort, trim or de-duplicate the favourites response.
2. The front page never writes `?i=`; sharing from it points at the file's day.
3. The drift writes `scrollLeft` and never reads it back.
4. Repeat distance is measured frame-to-twin.
5. A favourites failure is silent.

## Related

- The star on a tile: [media-grid-and-selection.md](media-grid-and-selection.md).
- Why duplicated tiles matter: [media-viewer.md](media-viewer.md).
- Sharing rules: [sharing-and-links.md](sharing-and-links.md).
