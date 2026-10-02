# Media open and selection driven by the URL

## Why Back behaves differently from an ordinary URL change

The app treats the query pair `?i=` / `?o=` as an *input* it must keep in sync with a
separate, page-owned `lightboxIndex` ref, and it manipulates history by hand. The URL is
therefore not the source of truth, so the one input Back changes - the URL - cannot
reproduce the state that ordinary navigation produced through side effects.

Concretely, five independent mechanisms all decide the same thing:

1. **Three writers to `lightboxIndex`.** The page's resolve watcher, the lightbox's
   `watch(open)` side effects, and the composable's `popstate` handler that calls
   `close()`. Their relative order is not defined across components; Vue's parent-before-
   child flush order is an implementation detail, not a contract.

2. **Imperative history.** `history.back()` is called from watchers to "take back" a
   step, and the resulting `popstate` is classified with module-local booleans
   (`consuming`, `answering`, `pushed`, `adopted`). Two navigations race: the one the
   reader asked for and the one the code starts to undo it.

3. **`popstate` handlers read `window.location.search` directly**, bypassing the router's
   reactive route. They can see an address the rest of the app has not adopted yet.

4. **Remount vs in-place.** [`App.vue`](src/App.vue:43) keys the routed view by
   `current.path`. A Back that crosses a path boundary remounts the view; one that does
   not stays in place. Per-component history flags are lost on remount, so the day page
   and the search page run two different lifecycles for the same URL change.

5. **The resolve watcher watches the wrong signal on the search page.** It watches
   `search.results`, whose identity does not change for an `i`/`o`-only change, so Back
   and Forward never re-resolve there. The day page watches `mediaLink.link`, so it does.
   That is exactly the "search only highlights, day opens" split.

The double animation on the day page is a symptom of the same cause: the opening path
(URL -> resolve watcher -> `lightboxIndex`) and the closing path (imperative `close()` ->
flight) can both be in flight for one navigation, so two flights overlap.

## Target

One durable state: the query pair. One writer: the router. Everything transient - the
element a press flew from, the tile to fly back to - stays in a service, never in history.

| Concern | Today | Target |
| --- | --- | --- |
| Which file is singled out | local ref + resolve watcher | derived from `route.query.i` and `items` |
| Whether the viewer is open | local ref + `o=1` + watchers | derived from `route.query.o` |
| Opening | set ref; a watcher pushes history | `router.push` the pair |
| Turning | set ref; a watcher replaces history | `router.replace` the pair with the new id |
| Closing by hand | emit null; a watcher runs `history.back()` | `router.back()` if this session pushed the step, else `router.replace` without the pair |
| Back / Forward | `popstate` handler reads `window.location` | ordinary route change, projected like any other |
| Flight origin | local, captured at open | unchanged - `services/openedFrom.js` |

Because closing by hand uses `replace`, the entry loses `o`: Back leaves the page and
Forward does not reopen a picture the reader closed. Back and Forward are then just route
changes, and the same code path runs whether the change came from the router API or the
browser.

## Ownership

- `services/mediaLink` (`useMediaLink`) stays the only read/write of the pair.
- A new `composables/useMediaRouteViewer.js` derives selection and open index from the
  route plus the page's items, and exposes `open`, `turn`, `close` that only navigate.
  It also owns the one `scrollToMedia` reaction for a plain `?i=`.
- `MediaLightbox` stays a controlled component. Its opening and closing flights are both
  driven by `watch(open)`; `close()` becomes the intent only, emitting `update:index`
  null. This removes `defineExpose(close)` as a page hook and makes every close animate
  the same way.
- Pages that cannot be addressable (`home`, admin views, editor panels) keep their local
  `v-model:index`; they are unaffected because they never push a pair.

## Steps

1. Add `composables/useMediaRouteViewer.js`.
2. Move the closing flight in `MediaLightbox` from `close()` into the reactive close path.
3. Rewire `DayView` onto the composable; delete its resolve watcher and the history usage.
4. Rewire `SearchView` onto the composable; delete the results-identity resolve watcher.
5. Rewire `MapView`, or leave it as a decision (see below).
6. Delete `composables/useViewerHistoryStep.js` and every `popstate` / `history.back()`.
7. Update the feature docs and record the new invariants.
8. Walk the manual verification matrix.

## Decisions

- **Map page.** Adopts the pair like the day and search pages; nothing keeps a private
  step, so `useViewerHistoryStep` is deleted outright.
- **Hand-close address.** Drops the whole pair. The one retained flag is a boolean, "this
  session pushed the current entry": a hand-close leaves it with `router.back()`, while an
  entry the address brought is rewritten with `replace`. There is no `popstate` handler,
  no `consuming`, `answering`, `adopted` or `stepping`, and nothing reads `window.location`.
- **Selection scroll.** A plain `?i=` **always** scrolls to the file when the selected id
  changes, on arrival and on Back alike. This is the feature, so it is unconditional.

`router.back()` in the hand-close is not the old shamanism: with the route as the only
writer it is one ordinary navigation, and the viewer is closed by the projection reacting
to the resulting address, exactly as it is on the browser's own Back.

## Verification matrix

Each row on both the day page and the search page:

1. Press a tile, Back, Forward: closes, then reopens cleanly, one animation each way.
2. Press a tile, hand-close, Back, Forward: Back leaves the page, Forward does nothing.
3. Deep link pair, page, tag, Back: the file last seen is open, address matches state.
4. Plain `?i=`, no `o`: outlines and scrolls, never opens the viewer.
5. Back while the viewer is open, from a path-crossing and a same-path entry.
6. Follow a note reference from inside the viewer, then Back.
