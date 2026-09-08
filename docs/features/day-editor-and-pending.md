# Day notes and the pending queue

Writing a day's note in three languages, keeping a local draft of it, and the admin screen
that lists everything still waiting to be filled in.

## Files

| File | Role |
| --- | --- |
| `src/components/editor/DayEditForm.vue` | The note form: language tabs, thumbnails, drafts. |
| `src/services/dayDrafts.js` | Unsaved notes in `localStorage`. |
| `src/views/AdminPendingView.vue` | The queue: unfiled media above, unwritten days below. |
| `src/api/admin.js` | `GET /admin/pending`. |
| `src/api/days.js` | `GET /days/{date}/edit`, `PUT /days/{date}`. |

## The note form

Accepts **either** shape in `day` - a `DayDto` from a public page or a `DayEditDto` from
the queue. `hydrate()` handles both: with `translations[]` it reads rows; without, it puts
the flat `note` into the one language the response is labelled with.

For a public day it then fetches `GET /days/{date}/edit` for every note plus each
translation's **row id**, and save is blocked until it resolves - an existing note must
never be overwritten without its row id. The queue already carries the full model, so no
request is made there.

`buildTranslations()` sends only languages with a non-blank note, each keeping its `id`.

### Thumbnails

`showThumbs` puts the day's photographs above the note, so the day can be written while
looking at it. Required on the queue, where nothing else shows what the day held; off on
the day page, where the same grid is a few centimetres below.

The edit model carries no media, so the full day is pulled from the days store for file
names. Tapping a thumbnail opens the lightbox - a sixty-pixel square is not looking at it,
and that is the difference between naming a day and describing it. The handler calls
`markOpenedFrom(event.currentTarget)` like every other wall.

## Drafts

A day's note is the one thing on this site written at length, in a form that lives inside a
page - so a stray back gesture, a swipe to the next day or a closed tab took it with them.
The server hears nothing until Save and has no business hearing a half-written paragraph,
so the copy stays on the machine.

| Key | `haruyasumi.dayDraft.<ISO date>` |
| --- | --- |
| Value | `{ notes: { ru, en, ja }, savedAt }` |

Rules:

- Written **only while `dirty`** - the form says something the server does not. A day
  opened and closed untouched leaves nothing behind; with a ninety-day trip, drafts
  identical to the saved note are litter.
- Reverting the text by hand clears the draft: at that point there is nothing to recover.
- Written every 10s, on `beforeunload`, and on unmount. Both are needed - navigating to
  another day unmounts the form, and closing the tab unmounts nothing.
- `restoreDraft()` runs **after** `loadFullModel()` is awaited. For a public day the rows
  arrive from the server and overwrite the form, so a draft put back before that would be
  wiped by its own fetch.
- A stored draft matching the baseline was saved by other means; it is cleared, not
  restored.
- Every `localStorage` call is wrapped in `try/catch`. A full or disabled store costs the
  draft and nothing else.

`sameNotes(a, b, locales)` treats blank and absent as equal.

## Auto-translate

Same contract as the media editor. `PUT /days/{date}` with `{ day, autoTranslate }` saves
the notes it was sent, then answers `{ day: DayEditDto }` carrying translations it has
**not** stored. The form rehydrates from that and stays open; keeping the translation is a
second save. See [media-editor.md](media-editor.md).

## The pending queue

`GET /admin/pending` returns `{ media: MediaFileEditDto[], days: DayEditDto[] }` - media
without a description, and days whose note is not marked ready. **Both are already full
edit models**, which is why neither editor fetches anything extra on this screen.

### What removes a row

| Action | Removes? |
| --- | --- |
| Saving a file **with** "approved" ticked | Yes |
| Saving a file without it | **No** - a correction, not a decision. The file is still waiting, and taking it off the queue would hide it from the person who has yet to decide. |
| Saving a day with `isReady` | Yes |
| Deleting a file | Yes, locally - no refetch |

`onMediaSaved({ ids, approved })` builds a **`Set` from `ids`**. A bulk save answers for the
whole selection, and comparing each file against the *array* - which is what this used to do
- is never equal, so nothing was ever taken out.

### Hearing the floating toolbar

`SelectionToolbar` is mounted at app level so a selection survives navigation, which means
it cannot hand this page an event. The queue watches `editor.lastSave` and
`editor.lastDelete` instead. Without that, a selection approved in bulk stayed on the queue
until reload.

### Sync

`PUT /media/sync` rescans storage for new uploads. On success it reloads the queue,
**invalidates the days cache and refetches the day list** - new files change `mediaCount`
and can create days that did not exist.

### Tapping a file

A plain tap opens the lightbox, as everywhere else. Editing has a button on the tile and
the toolbar behind a selection, so spending the tap on a dialog cost this page the one way
of looking at a file - and the queue is exactly where a file most needs looking at before
anything is decided about it.

The media editor remains mounted after a backdrop or Escape dismisses it; it is minimised,
not destroyed. On the next edit it receives the new media through props and rehydrates the
form. The first tag captions come directly from each media model, so opening the editor
does not wait for the dictionary or briefly show slugs.

## Invariants

1. Save is blocked until the full day edit model has arrived.
2. Drafts are written only when dirty, and restored only after the model is hydrated.
3. Every `localStorage` access is guarded.
4. `onMediaSaved` compares against a `Set` of ids.
5. An unapproved save leaves the file on the queue.
6. The queue reads bulk results from `editor.lastSave` / `lastDelete`, not from events.
7. `syncMedia` must invalidate the days store.

## Related

- The dialog that empties the media half: [media-editor.md](media-editor.md).
- Selection and the toolbar: [media-grid-and-selection.md](media-grid-and-selection.md).
- `autoReveal: false` on this screen: [media-grid-and-selection.md](media-grid-and-selection.md).
