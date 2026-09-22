# Media editor

One dialog for editing a single file and for editing a selection of forty. Most of its
complexity is a single rule: **nothing is sent unless it was actually changed.**

## Files

| File | Role |
| --- | --- |
| `src/components/editor/MediaEditDialog.vue` | The dialog. |
| `src/components/editor/LanguageTabs.vue` | RU / EN / 日本語 tabs. |
| `src/components/editor/TriStateCheck.vue` | Checkbox with an indeterminate state. |
| `src/components/editor/MediaLocationPicker.vue` | Map coordinate picker (lazy). |
| `src/components/editor/SimilarMediaPanel.vue` | Filing by resemblance - see [similarity.md](similarity.md). |
| `src/services/mediaEdits.js` | `applySavedMedia`, `addTagLocally`. |
| `src/composables/useDelayed.js` | Holds a "loading" notice back until the wait is real. |

## Entry points

| Prop | Meaning |
| --- | --- |
| `media` | One file. |
| `items` | Many; **takes precedence** over `media`. |
| `date` | Owning day when the caller knows it, else derived from `created`. |
| `deletable` | Offers a delete button; the **parent** owns the confirmation and the request, because what to do with the hole differs per page. |

`editList` is a **computed**, deliberately not a ref updated by a watcher. Props are patched
one at a time in template order, so `open` becomes true a moment before `media` does - a
watcher holding the list therefore ran *after* the one reading it, the dialog found nothing
to edit and made none of its requests, and a second attempt only worked because the stale
value was still lying around. A computed has no order to get wrong.

## Why the form waits for `/media/edit`

The public model is flattened to **one** language, and that one is chosen by fallback: ask
for Russian for a file described only in Japanese and the response is *labelled* Russian
with Japanese text in it.

Seeding the editor from that put Japanese text in the Russian field, then refused to
overwrite it when the real rows arrived - so the actual Russian row never reached the
screen, and a save would have written the Japanese into it.

So the editor fetches `GET /media/edit` (every language, no fallback) and fills all three
from that. The fields sit inside a `<fieldset :disabled="loading">` until it lands: one
attribute takes every control out of the tab order and stops it answering, with no
per-field bookkeeping to forget. An empty field about to be filled is a field somebody
will otherwise start typing into.

Anything already an edit model - the pending queue - is used as-is; `isEditModel(entity)`
is `Array.isArray(entity.translations)`.

`SimilarMediaPanel` stays inside the fieldset so its spacing follows the editor fields.
It is not a save field and is not blocked by the panel's own collapsed state. It stays
mounted behind its collapsed heading, so its similarity request starts in the background
even when the editor does not need the results immediately. Expanding it reveals a
fixed-height scrolling work area; loading, failure, and results therefore do not move the
fields above it.

The three marks sit as one compact group, spaced half as far apart as the fields around
them. Each label's meaning is its hover title - `approvedHint`, `favoriteHint`,
`hiddenHint` - and the mixed-selection explanation joins that title as a second line only
while the box still shows a dash. On a bulk edit a single plural note under all three
marks says any changed mark reaches every selected file, once rather than per mark.

## The baseline rule

`baseline` records what each language looked like when the editor last received it.

The backend writes every field a request carries, so **sending a field unchanged is still a
write**. The dialog used to send every language on every save. On a bulk edit that was
destructive, not merely wasteful: bulk fields are prefilled from the first selected file
that has text, so saving a batch to set coordinates posted that one file's title and
description onto every other file in the selection.

| Concept | Rule |
| --- | --- |
| `localeChanged(locale)` | Title or description differs from baseline, trimmed. |
| Blank counts as a change | Clearing a description is a decision and must reach the server. |
| A translation is atomic | Title and description are one object server-side, so a change to either sends both. |
| Untouched languages | Not in the request at all. |

`rememberBaseline()` is called after hydrating from the server **and** after `prefillBulk`
- what is on screen there is a starting point to edit from, not something the editor has
said should go to every file.

## The three marks

`isApproved`, `favorite`, `private` each have a value **and** a `…Touched` flag.

All three show what the files actually carry, which is what makes them worth reading - and
exactly why their values must not be posted on their own account. Sending them regardless
would make every save answer a question nobody asked: a typo fixed on a file left
unapproved on purpose would approve it.

`markState(reader)` returns `true`, `false`, or **`null` when the selection disagrees**.
`null` is not a value - it is the absence of agreement, and drawing it as "no" would be a
claim about files that say yes.

`TriStateCheck` renders that as `indeterminate`, which is a **property, not an attribute**,
so it cannot be bound in a template and must be written onto the node. The box holds
`modelValue` underneath, so the first press settles the whole selection on ticked and the
second on unticked - what a browser does with an indeterminate box, and what people expect.

The mixed dash disappears once the box is pressed: after that it is a value like any other,
and a dash would describe a disagreement already settled.

This replaced an older bulk rule of "a tick means yes, an untick means nothing". With the
boxes now showing what the files carry, unticking is as legible as ticking - so **taking a
mark off forty files is finally possible**, and happens only when asked for.

## Tags in the dialog

Tags belong to the file, not to any translation, so they sit outside the language tabs and
a save carries them **beside** `translations`. Nothing about them needs translating - the
tag already knows its own three captions.

The media model already carries each tag as `{ slug, value }`. `MediaEditDialog` passes
those tags to `TagPicker`, which renders `value` immediately and does not wait for the
editor dictionary. The dictionary still loads in the background for autocomplete and for
resolving slugs to ids when saving.

The form holds **slugs**, while media models also carry the client caption. `resolveTagIds()`
looks the numeric ids up in the dictionary at save time, and **an unresolvable slug aborts the save
with a message** rather than being skipped: the save replaces the set, so a dropped slug is
not a tag left alone but a tag taken off.

The field starts from the **union** of what the selection carries. A blank field would read
as "these have no tags", and saving from it as "and now they have none". But `tagIds` is
only sent once `tagsTouched` - sending the union unprompted would hand every selected file
every tag any of them had, a silent merge nobody asked for.

## What a save sends

```
PATCH /v1/media  { ids, changes, autoTranslate }
```

| Field | Single | Bulk |
| --- | --- | --- |
| `translations` | Changed languages, each keeping its row `id` | Changed languages, **no row id** - the backend matches on `languageCode` |
| `latitude` / `longitude` | Always (null clears) | Only if `coordsTouched` |
| `isApproved` / `favorite` / `private` | Only if touched | Only if touched |
| `tagIds` | Always | Only if `tagsTouched` |

## Auto-translate

`autoTranslate: true` runs in two halves, and **only the first is persisted** (confirmed
with the project owner, 2026-09-03):

1. The backend saves the fields the request carried, exactly as a normal save would.
2. It then translates into the languages that were left empty and returns those in
   `{ items: MediaFileEditDto[] }` **without storing them**.

Keeping the translation is therefore a **second save**, made by the editor once they have
read it. That is the whole reason the dialog stays open on this path rather than closing:
leaving without saving again discards the machine's work, which is the intended escape
hatch when it got something wrong.

Two consequences that look like bugs:

1. **Every written language is sent when translating, changed or not.** The backend fills
   empty languages *from what it is given*; a request carrying no translations gives it
   nothing to work from and the tick achieves nothing.
2. **The response is hydrated with `asBaseline: false`.** It is the machine's work, and the
   whole reason the dialog stays open is that it must be read. Recording it as the server's
   own state left only the hand-typed language looking changed, and the translations went
   nowhere on the following save.

The dialog stays open, notifies "review the translation", and clears the tick.

## Writing the answer back

`applySavedMedia(target, saved, locale)` in `services/mediaEdits.js` projects the returned
edit model onto the read model the page holds, **mutating in place** - the files being
edited *are* the objects in the grid behind the dialog, handed down as props.

| Written | Not written |
| --- | --- |
| `title`, `description`, `languageCode` (from `bestRow`) | `imageUrls`, `videoUrls`, `miniature`, `aspectRatio` |
| `tags` (flattened to `{ slug, value }`) | |
| `latitude`, `longitude`, `favorite`, `private` | |
| `translations` - **only if the target already had them** | |
| `isApproved` - **only if the key already exists** | |

The URLs and proportions describe the file itself, which no edit touches, and the edit
model's copies are not always the ones the page was given - writing them across would swap
good data for data that merely looks like it.

`bestRow` picks the reader's language when it has content, else the first that does - the
same rule behind the "showing the original" notice, and `languageCode` is set to whichever
row won so that notice keeps telling the truth after a save.

The two conditional writes exist because giving a flat read model a `translations` array
would change what it *is*, and every page that decides what to fetch by looking for one
would start deciding differently. Conversely, an edit model that did **not** get its rows
back kept its old text: reopening it showed the pre-save state with no request to correct
the impression, because the object still looked complete.

`save()` emits `{ ids, applied, approved }`. `applied` is false when the response carried
nothing to write, and only then does the page refetch. `approved` is there because the
response carries no such field, and only the dialog knows whether the box was pressed.

## Minimising

A press on the backdrop is how people look at the page behind a dialog - the photograph
being described is right under it - so it folds to a bar at the foot of the screen with
everything still in it. The cross keeps its meaning: done with this, whatever it cost.
`ModalDialog` emits `dismiss` for the backdrop and `close` for the cross.

A fresh open is never a folded one, whatever the last one ended as.

The dialog component stays mounted when the user dismisses it: the parent keeps the
selected media, while `ModalDialog` is folded through `minimised`. Opening another file
hydrates the same component with new props; the form and tag line must therefore react to
new models rather than rely on a mount-only initialisation.

## The location picker

Lazy (`defineAsyncComponent`) so **MapLibre stays out of the main bundle** - this dialog is
mounted app-wide via the selection toolbar. Keep it that way.

Reference points come from one `GET /media/locations` over a **three-day window** around
the file, rather than fetching whole days. For a selection too: a bulk edit is almost
always a run of frames from one afternoon, and "where was I around then" is the question
its map has to answer as well.

Points are sorted by `created` because the picker joins them into the path that was walked
- a path drawn in server row order is a scribble. Each carries `before`, which lets the
picker frame the gap the photograph fell into rather than the whole day. Files being edited
are excluded. A failed fetch is silent; the picker still works.

The inline map remains 220px high. Its text below is a fixed two-row area: the first row is
the short map instruction, and the second row holds the point legend or the clear/paste
hint. Reference points may replace that row's content, but never add another row or change
the editor height.

## Invariants

1. `editList` is a computed, never a watcher-maintained ref.
2. Save is blocked until the full edit models arrive - a file is never saved without its id.
3. Untouched fields are not sent. Blank is a change; unchanged is not.
4. `tagIds` on a bulk save only when touched.
5. An unresolvable tag slug aborts the save.
6. Translated output is hydrated with `asBaseline: false`.
7. `applySavedMedia` never writes URLs, miniature or aspect ratio.
8. `MediaLocationPicker` stays lazily imported.

## Related

- Slug vs id: [tags.md](tags.md).
- The queue this dialog empties: [day-editor-and-pending.md](day-editor-and-pending.md).
- The panel beside it: [similarity.md](similarity.md).
