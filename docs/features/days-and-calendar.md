# Days, timeline and calendar

The trip is roughly ninety dated days. This covers the day list, the day page, navigation
between neighbouring days, and the calendar ribbon that both the day page and the map use.

## Files

| File | Role |
| --- | --- |
| `src/stores/days.js` | Day list plus per-date detail cache. |
| `src/views/DayView.vue` | The day page: grid, note, map, calendar, editor entry points. |
| `src/components/calendar/TripCalendar.vue` | Horizontal ribbon of every month the trip spans. |
| `src/components/calendar/CalendarMonth.vue` | One month grid. |
| `src/services/dates.js` | All date parsing and formatting. |
| `src/composables/useHorizontalSwipe.js` | Touch paging between days. |
| `src/api/days.js` | `GET /days`, `GET /days/{date}`, `/edit`, `PUT`. |

## The store

Two caches, both keyed by ISO date and nothing else.

| Member | Purpose |
| --- | --- |
| `list` | `DayShortDto[]` - `{ date, isReady, mediaCount }`. Fetched once and kept; ninety rows is nothing. |
| `details` | `Map<date, DayDto>`. The search page pulls days again when a visitor expands "show the rest of this day", hence a cache. |
| `orderedDates`, `byDate` | Derived indexes. |
| `neighbours(date)` | Previous/next **dates that exist in the timeline**, not calendar neighbours. |
| `invalidate()` | Drops everything. Must be called when the content language changes. |

`Map` mutations are not reactive on their own, so every write swaps the reference
(`details.value = new Map(details.value)`). Keep that when adding cache writes.

### In-flight deduplication

`loadDay` records the promise in an `inFlight` map, so two callers asking for the same
date share one request. This is what lets the router start a day loading in `beforeEach`
while the view also asks for it on mount - the request overlaps the page transition
instead of starting after it. The router's call is fire-and-forget; the view owns the
error state.

## The day page

`DayView` is reused across day navigations, so **everything reacts to `props.date`, not to
mount**. It holds:

| State | Notes |
| --- | --- |
| `day` / `media` | From the store, not local. |
| `expectedMedia` | `mediaCount` from the day list, known before the day itself arrives - this is what sizes the skeleton correctly. Null falls back to two rows. |
| `locatedMedia`, `dayRoute` | Geotagged files and the path through the day, built by `routeFromMedia` - the same function the trip map uses. |
| `mapShown` | Persisted default in `localStorage` under `haruyasumi.dayMapHidden`; reset per day. |
| `showFallbackNotice` | `isFallbackLanguage(day, locale)` - the server answered in another language. |

Watches that must exist:

- `props.date` → reload, reset the map to the persisted default, clear `answered`.
- `ui.locale` → `load(true)`, because the store cache was just invalidated.
- `editor.lastDelete` → reload. The selection toolbar is mounted app-wide and cannot emit
  to the page below it.

### Answering a `?i=` link

The watcher on `[media, mediaLink.link]` resolves the linked file against **this day's**
files, then either opens the viewer (`?o=1`) or scrolls to it.

- `answered` guards against answering the same file twice, and is reset when the date
  changes - the day's own map links back into the day it is on, changing nothing but the
  parameter, and a one-shot read left that link outlining nothing.
- An unresolvable id is cleared **only when `loading` is false**. A reload leaves the
  previous day's files standing until the new ones arrive, and a link answered against
  those would be discarded for the wrong reason.

## Navigation between days

Three routes to the same move, all going through `neighbours`:

| Input | Guard |
| --- | --- |
| `←` / `→` keys | Ignored when `hasOverlay()`, while editing the note, and while focus is in an input/textarea/select/contenteditable. |
| Touch swipe | `useHorizontalSwipe`, disabled when `hasOverlay()` or `editor.selectionMode`. |
| Header arrows | Plain `RouterLink`s. |

**`hasOverlay()`, not "is this page's viewer open".** A viewer can be opened from inside
the note editor's strip or from a dialog's "similar" panel - different component
instances the page knows nothing about. The overlay stack is the only thing that knows.

`useHorizontalSwipe` is built on **touch events, not pointer events**, deliberately: the
browser cancels the pointer stream the moment it decides the page is scrolling, so a swipe
across ordinary background never reported its end and the gesture only worked over media
tiles (which restrict `touch-action`). It is touch-only - a mouse has the arrows, and
treating mouse drags as swipes fights text selection. A gesture counts only when it is
≥60px, ≤800ms, and 1.5× more horizontal than vertical. Anything inside `[data-no-swipe]`
is skipped, which is how the calendar ribbon and the map keep their own horizontal drags.

## Dates

**Never `new Date(iso)` for a calendar date.** The API sends `2026-04-12` with no zone;
that constructor places it at UTC midnight and shifts the day for anyone west of
Greenwich. Every conversion goes through `parseIsoDate` / `toIsoDate`, which use explicit
year/month/day parts and stay local.

`new Date(iso)` **is** correct for `created`, which is a full timestamp - that is what
`formatShortDateTime` and `formatShortTime` use.

| Function | Output |
| --- | --- |
| `formatLongDate` | "12 April 2026" - headings, tab titles, link previews. |
| `formatShortDate` | "12 Apr" - badge on a picture. |
| `formatShortDateTime` | "12 Apr, 14:35" - the location picker draws from a three-day window, so a bare time could belong to any of them. |
| `formatShortTime` | "14:35" - where the day is implied by the page. |
| `formatWeekday`, `formatMonthTitle` | Headings. |
| `weekdayLabels(locale)` | Monday-first short labels, built from a known Monday (2024-01-01) so they always come from `Intl` and never a hardcoded list. |
| `monthGrid(monthDate)` | 6×7 of `{ date, iso, inMonth }`, Monday first. |

## The calendar ribbon

`TripCalendar` renders **every month the trip spans, always**. `anchor` only decides where
the ribbon is scrolled, so picking a day slides the ribbon rather than rebuilding it. On a
phone each column fills the width, so exactly one month shows.

- Scrolling is done by writing `scrollLeft` **by hand, never `scrollIntoView`** - that
  obliges every scrollable ancestor including the page, so on a day or map page where the
  calendar sits below the fold, arranging the ribbon dragged the reader down to it.
- Mouse drag-to-scroll is implemented locally (touch pans natively). A drag past 4px sets
  `suppressClick` so releasing does not also open the day under the cursor.
- The month loop is bounded by a `guard` of 60 iterations.

`CalendarMonth` cells carry three signals at once: whether the day exists in the timeline,
whether its note is `isReady`, and whether it is selected or inside a range.

**A calendar date can appear in two month grids** - 28 Feb is in February's cells and in
March's leading padding. Only the owning month draws selection or range highlight, so a
picked day never lights up twice.

`rangeStartLabel` / `rangeEndLabel` are blank on the day page (one date, no range) and set
on the trip map, where a calendar answering the first click with one dark square would say
nothing about what the second click is for.

## Editing from the day page

- `onMediaSaved({ applied })` - the dialog writes the saved model straight onto the file
  in the grid, so a reload is only needed when `applied` is false.
- `removeMedia` - confirmation and request live on the **page**, not the dialog, because
  what to do with the hole left behind differs per page. Deleting is offered wherever a
  file can be edited, not only in the pending queue: the frames worth removing are the
  ones noticed while reading the day.
- `onNoteSaved` reloads both the day and the day list - `isReady` may have changed, and
  that is what the calendar colours.

## Invariants

1. `parseIsoDate`/`toIsoDate` for calendar dates; `new Date()` only for timestamps.
2. Day caches are keyed by date alone, so a locale change **must** call `invalidate()` and
   every open page must refetch.
3. Day-stepping guards check `hasOverlay()`, never a local "is the viewer open" flag.
4. `TripCalendar` never uses `scrollIntoView`.
5. `answered` is reset on date change, and an unresolved `?i=` is only cleared once
   loading has settled.
6. Cache `Map`s are replaced, not mutated in place.

## Related

- The grid and selection inside a day: [media-grid-and-selection.md](media-grid-and-selection.md).
- `?i=` / `?o=`: [sharing-and-links.md](sharing-and-links.md).
- The trip map and `routeFromMedia`: [maps.md](maps.md).
