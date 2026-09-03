# UI shell: overlays, dialogs, toasts, scrollbar

The pieces mounted once at app level, and the rules every full-window overlay has to obey.

## Files

| File | Role |
| --- | --- |
| `src/App.vue` | The shell. |
| `src/services/overlayStack.js` | Who owns the keyboard and the scroll lock. |
| `src/components/common/ModalDialog.vue` | Every dialog. |
| `src/components/common/ConfirmDialog.vue` | The one blocking question. |
| `src/components/common/ToastHost.vue` | Transient notifications. |
| `src/components/layout/AppScrollbar.vue` | The drawn scrollbar. |
| `src/components/common/` | `LoadingIndicator`, `ErrorState`, `EmptyState`, `SkeletonGrid`, `ShareButton`. |
| `src/composables/useDelayed.js` | Holds a "loading" notice back until the wait is real. |
| `src/services/cascade.js` | Stagger for a list arriving in a cascade. |

## The overlay stack

Every full-window overlay listens on `document`, because that is the only way to catch a
key wherever focus happens to be. With two up, one key reaches both: Escape over a viewer
opened from inside an edit dialog closed the viewer **and** the dialog underneath it,
taking unsaved edits with it.

The rule is the obvious one - the key belongs to whatever opened last - and it needs one
shared list, which is why this is a module rather than per-component state.

```js
pushOverlay(token)   // as it opens
popOverlay(token)    // as it closes, and again on unmount
isTopmost(token)     // gate every key handler on this
hasOverlay()         // "may the page scroll" comes down to this
```

Leaving twice is harmless. **Any new full-window overlay must do all three.**

`hasOverlay()` is also what page-level gestures check - day-stepping arrows and swipes ask
it rather than a local "is my viewer open" flag, because a viewer can be opened from inside
a dialog the page knows nothing about.

## `ModalDialog`

### Two ways out, two intentions

| Event | Meaning | Raised by |
| --- | --- | --- |
| `close` | "I am done with this" - a decision, whatever it costs | The cross |
| `dismiss` | "Get out of my way" - expected to be undoable by reopening | Backdrop press, Escape |

Treating both as the same event is how a form full of typing gets thrown away by a
misplaced click. What `dismiss` should do is the host's decision: `MediaEditDialog` and
`TagEditDialog` minimise; a dialog with nothing to lose points both at the same handler.

### Backdrop clicks

Closing requires the press to **both start and end on the backdrop**. Selecting text inside
the panel and releasing outside it must not count, or the dialog vanishes mid-selection.
The lightbox uses the same rule.

### Stacking

`stacked` raises a dialog above another one - a tag coined while a photograph is being
filed. Without it the two sit at the same height and the winner is whichever rendered last.

### Focus

The dialog traps Tab and restores focus on close. **The dialog does the focusing**, not the
field: `TagPicker` merely marks itself with `autofocus`, because two components racing for
focus is how the caret ends up somewhere neither meant.

## Confirmation

`ui.confirm(request)` returns a promise and is the only blocking question in the app.

`window.confirm` is a different application interrupting this one: it wears the browser's
chrome, ignores the theme, cannot say *which* files are about to go, and on a phone lands
wherever the browser feels like. Deleting is the one irreversible action here, so it is
worth a dialog that looks like the rest of the site and names what it is about to do.

One question at a time - a second while one is open resolves the first as **refused**,
which is the safe answer.

## Toasts

`ui.notify(message, tone)` with `tone` of `info` / `success` / `error`, auto-dismissed after
4s, rendered by `ToastHost` in `role="status"` `aria-live="polite"`.

Share buttons deliberately do **not** use toasts: the answer must sit beside the button
that was pressed, not in a page corner. `src/composables/useCopyFeedback.js` holds that,
and both share buttons call it. The footer's "share the site" link is the exception and
does use a toast - it is a line of text in a footer, with no button to sit beside.

## The drawn scrollbar

The native page scrollbar is hidden in `main.css`; `AppScrollbar` draws one over the page.

A desktop browser's bar takes a **lane out of the layout**, and a lane that appears and
disappears moves the whole page sideways - which is what made the picture jump as the
viewer opened and locked the page behind it. Reserving the lane permanently fixed that but
left an empty strip on every page that does not scroll. Drawing on top costs no width, so
there is nothing to reserve and nothing to move.

- Only for a pointer that can hover. A touchscreen has its own overlay bar and a thumb has
  no use for a four-pixel target; the CSS hides it there.
- `target` is null for the page, or an element for a scroller inside it - a dialog tall
  enough to need one, where the browser's own bar cuts a straight grey lane through a panel
  with rounded corners.
- Dragging scrolls with `behavior: 'instant'`: the page scrolls smoothly by default, and
  under a hand it must not lag behind.
- If this component fails to run the page still scrolls by every other means. What is lost
  is the drawn bar, not the scrolling.

## Waiting, quietly

`useDelayed(source, delay = 400)` turns on only once its source has stayed on that long,
and off immediately.

A request answered from nearby comes back in a few dozen milliseconds, and a line of text
that appears and vanishes before it can be read is not information - it is a flicker, and
it takes the rest of the form with it as the layout closes back up.

Used by both edit dialogs for their "loading the full model" notices.

## Arrival animations

`cascadeDelay(index)` returns `{ '--cascade-delay': '…ms' }` for `.cascade-item`.
35ms per step, **capped at 12 steps** - a page of a hundred thumbnails would otherwise leave
the last waiting several seconds for an effect meant to last a moment, and everything past
the fold is being scrolled to anyway.

`cascade` is for a page that is nothing but a grid; where the grid is one section among
many, the page's own arrival already covers it.

## Page transitions

In `App.vue`:

- `<Suspense>` **outside**, `<Transition>` inside. The reverse plays the departure and never
  resolves the arrival, leaving the page empty between header and footer.
- Keyed by `route.path`, not the full address - the viewer writes `?i=` into the query.
- `main` uses `overflow-x-clip`, not `hidden`: a page sliding sideways would otherwise reach
  past the edge and put a scrollbar under it for the length of the animation. Clipping does
  the same without making this a scroll container, which would take the sticky header with
  it.
- Direction comes from `navDirection` - `forward`/`back` only between two day routes.

## Invariants

1. Push, pop, and gate on `isTopmost` for anything full-window.
2. Release body scroll only when `hasOverlay()` is false.
3. `close` and `dismiss` stay distinct.
4. Backdrop close requires press and release both on the backdrop.
5. `Suspense` outside `Transition`; `RouterView` keyed by path.
6. Only one `ui.confirm` at a time; a superseded one resolves false.

## Related

- The heaviest overlay: [media-viewer.md](media-viewer.md).
- Dialogs that minimise on dismiss: [media-editor.md](media-editor.md), [tags.md](tags.md).
