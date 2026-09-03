# Filing by resemblance

The server keeps a fingerprint of each photograph's content and can compare across the
whole archive. Two screens use it, and both exist because **tagging one photograph is
rarely tagging one photograph**: the same subject was shot five times in a row, and again
from the other side of the square a week later.

## Files

| File | Role |
| --- | --- |
| `src/services/similarity.js` | Score bands, percentage, badge classes. |
| `src/components/editor/SimilarMediaPanel.vue` | "What does this file resemble" - inside the media editor. |
| `src/views/AdminTagCollectView.vue` | "What else belongs with this tag" - `/admin/tags/collect`. |
| `src/api/media.js` | `GET /media/{id}/similar`. |
| `src/api/tags.js` | `GET /tags/{id}/suggest`, `POST /tags/{id}/media`. |

## The two directions

| | `SimilarMediaPanel` | `AdminTagCollectView` |
| --- | --- | --- |
| Question | Given this file, what looks like it? | Given what already carries this tag, what else belongs? |
| Endpoint | `GET /media/{id}/similar` | `GET /tags/{id}/suggest` |
| Take | 200 | 300 |
| Measured against | One file's fingerprint | The centre of the tag's existing members |
| Where the tag comes from | The card above it | `?tag=` in the address |

Both apply through **`POST /tags/{id}/media`**, which *adds* a tag and leaves the others
alone - the opposite of the media PATCH, and the reason it exists. Filing by subject touches
files whose other tags are none of the operation's business. One tag per request, so several
tags are several requests, run **in sequence**: progress stays honest and a failure halfway
leaves a clear account of what landed.

After each success the tag is written onto the media objects on screen with
`addTagLocally` - `POST /tags/{id}/media` answers with a count and nothing else, so the tag
would otherwise exist on the server and nowhere on screen.

## The score is never a threshold

How alike is alike enough depends on how narrow the subject is - "this exact torii" and
"a shrine" want wildly different lines, and no number is right for both. So the server
always returns a full sorted list and **the person decides where it stopped being useful**.

That makes the score a working instrument rather than decoration. `services/similarity.js`
turns it into something readable at a glance:

| Band | From | Colour |
| --- | --- | --- |
| `series` | 0.95 | accent |
| `scene` | 0.80 | gold (the front-page star colour) |
| `kind` | 0.70 | dark grey |
| `weak` | - | muted grey |

`scorePercent` rounds to whole percent - two decimals of a cosine are noise, and nobody
reads 0.82 at a glance while everybody reads 82%. Colouring by band turns a column of
numbers into a shape: the drop is usually visible before it is read.

By the time a reader is in the tail the numbers are telling them to stop, so the badge goes
grey and quiet rather than shouting.

## `seedCount`

`GET /tags/{id}/suggest` returns `{ seedCount, items }`. **Under three marked files the
server declines to guess** and returns no items - one or two photographs do not describe a
subject, and the suggestion would be noise wearing a number.

`seedCount` is what says so. An empty list beside a small count is an **expected state, not
an error**, and the view must present it as such (`tooFewSeeds`).

Applying re-asks, because every photograph just marked moves the centre the next answer is
measured from.

## Selecting a run

Scores fall away monotonically and the drop is usually visible, so what a reader wants is
almost always an **unbroken run from the top** followed by a few stragglers.

- `chooseThrough(index)` marks everything down to and including that tile. Marking three
  hundred tiles one at a time to express that is work the shape of the data makes
  unnecessary.
- `useTilePaint` is bound with `armed: () => true` - there is no "selection mode" to enter
  here, the wall exists to be marked. Three hundred tiles that could not be scrolled past
  would be the worst possible place to get the downward-drag handback wrong.
- Both screens call `markOpenedFrom(el.closest('[data-tile-index]'))` before opening the
  viewer.

## The filter in `SimilarMediaPanel`

With no tag chosen the panel shows the whole answer sorted by likeness. Choose a tag and
the list becomes the far more useful question: **which of these does not already carry it**
- a file that already has every chosen tag gains nothing from being ticked, and leaving it
in the wall means reading past it and deciding about it again.

Missing *any* chosen tag is enough to stay, not missing all: the button hands over every
chosen tag at once, so a file short of one of three is still a file the operation changes.

This is why `TAKE` is 200 - the answer has to arrive with enough in it to still be worth
reading after the filter takes a bite.

Two watchers keep the state honest:

- `props.tagSlugs` - tags can be added and removed in the card above while the panel is
  open. Anything no longer on the file cannot be handed to anyone, and a stale tick would
  hand it anyway.
- `shown` - a file the filter removed is a file the operation would not change, so it stops
  being ticked with it. Otherwise "12 chosen" counts things nobody can see and the button
  quietly does less than it says.

The panel loads independently and is allowed to be slow: the card above it must not wait on
a fingerprint search to be readable, which is why it sits outside that card's `fieldset`.

An **empty list means the file has no fingerprint** - a video, typically. That is an answer,
not a failure.

## The collect screen

The tag lives in the address (`?tag=slug`) so the screen can be linked from the tag list and
the tag form, and so a reload does not lose it.

`tags.load()` is awaited on mount, because **the dictionary is what turns a slug into an
id**, and `GET /tags/{id}/suggest` needs the id. The watcher re-runs `load()` once
`tags.loaded` flips.

`TagPicker` is reused in `single` mode. The alternative is a second autocomplete over the
same dictionary with the same matching rules - two to keep in step for one line of
behaviour.

## Invariants

1. Never impose a score threshold in the client.
2. `seedCount < 3` with no items is an expected state, not an error.
3. Apply through `POST /tags/{id}/media`, never a media PATCH - the latter replaces.
4. One tag per request, sequential, with local write-back after each.
5. Ticks are pruned whenever the visible list or the available tags change.
6. An empty `similar` response means no fingerprint, not a failure.

## Related

- Tag model and `addTagLocally`: [tags.md](tags.md).
- The card this panel sits in: [media-editor.md](media-editor.md).
- The paint gesture: [media-grid-and-selection.md](media-grid-and-selection.md).
