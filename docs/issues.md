# Known issues

Findings from the documentation pass. **Nothing here has been changed** - this is a list to
decide on.

**Status:** every feature area has been read against its source and against `swagger.json`.
Nothing below has been reproduced in a browser, so "visible" means "the code says this
happens", not "observed".

## How this list is ranked

**Severity**

| Label | Meaning |
| --- | --- |
| `visible` | Someone can see something wrong today |
| `latent` | Correct today, breaks on a plausible future change |
| `misleading` | No runtime effect, but actively misinforms whoever reads it next |
| `maintenance` | Duplication cost only; nothing breaks, everything costs twice |

**Effort**

| Label | Meaning |
| --- | --- |
| `trivial` | Edit text. No behaviour, nothing to verify |
| `small` | One file, a few lines, obvious verification |
| `medium` | Touches several files or a heavily used component; needs a visual pass |
| `large` | Its own reviewable task |

## Summary, most worth doing first

| # | Finding | Severity | Effort | Fix method |
| --- | --- | --- | --- | --- |
| C1b | `fetchTagSuggestions` JSDoc names a field that does not exist | misleading | trivial | comment |
| C1e | Three comments claim the miniature is square | misleading | trivial | comment |
| C1 | `editMedia` JSDoc omits `private`, `favorite`, `tagIds` | misleading | trivial | comment |
| C1c | `fetchMediaLocations` JSDoc understates the response | misleading | trivial | comment |
| D1b | Tag caption resolved three ways; heading and chip can disagree | visible | small | extract one helper |
| D1c | Locale list hardcoded where `SUPPORTED_LOCALES` exists | latent | small | use the constant |
| C3 | `inHand` keyed two ways in the lightbox | latent | small | one key |
| C1d | Dead branch in `fetchMediaEdit` | maintenance | small | delete |
| D3 | `tagsOverflow` computed by two paths | maintenance | small | one function |
| D2 | Tile lookup by `data-media-id` implemented twice | maintenance | medium | extract a service |
| D0 | `MediaTile` duplicates `MediaThumb` instead of using it | maintenance | medium | lift `failed`, then reuse |
| D1 | Three ways to say "copied" | maintenance | medium | one composable |
| C2 | Miniature data URI declares the wrong MIME type | latent | small | needs backend answer first |
| Q1 | `autoTranslate` contract unverified | unknown | - | needs a decision |
| S2 | In-code rationale now duplicates the docs | maintenance | large | its own pass |

The first four are worth doing as a single batch: they are pure text, carry no risk, and
each one is currently capable of sending the next reader down a wrong path.

---

# Comment-only edits

No behaviour changes. Nothing to verify beyond reading the diff.

### C1b. `fetchTagSuggestions` JSDoc names a field that does not exist

**misleading / trivial** - `src/api/tags.js`

Documented as `{ id, value, usageCount }`. Swagger's `TagSuggestionDto` is
`{ slug, value, usageCount }`; **there is no `id`**.

The consuming code (`SearchBar.vue`) correctly uses `tag.slug`, so nothing is broken today.
The JSDoc is an invitation to write `tag.id` and get `undefined`. Given that slug-vs-id is
the sharpest edge in the tag model, this is the highest-value trivial fix on the list.

### C1e. Three comments claim the miniature is square

**misleading / trivial** - two files

Confirmed with the project owner (2026-09-03): `miniature` carries the file's **original
proportions**. Cropping it to a square is the frontend's job, done in CSS.

| File | Line | Text |
| --- | --- | --- |
| `src/services/mediaAssets.js` | 12 | "a tiny base64 square shipped inline with every file" |
| `src/services/mediaAssets.js` | 22 | "**Always square**, so it stands in for a cropped preview rather than the original." |
| `src/components/media/MediaThumb.vue` | 13 | "a tiny base64 square that costs no request" |

No runtime bug: every consumer already draws it into a box of the shape it wants. But the
second one states a false **invariant**, which an agent would reasonably build on - by
skipping `object-cover`, or by using the miniature to infer proportions.

**This is provably stale rather than merely wrong.** `src/components/map/TripMap.vue`
documents the transition: _"It went square for a while because the miniature arrived
pre-cropped to a square and this box cropped that again... Miniatures now keep the file's
own proportions."_ So the behaviour changed, one comment was updated, and three were left
describing the old world. The strongest argument on this page for **S2**.

### C1. `editMedia` JSDoc omits fields callers actually send

**misleading / trivial** - `src/api/media.js`

Documented as `{ latitude, longitude, isApproved, translations }`. Swagger's
`EditMediaChanges` is `{ latitude, longitude, isApproved, private, favorite, tagIds,
translations }`, and callers send all of them. An agent reading the JSDoc will conclude a
field is unsupported.

### C1c. `fetchMediaLocations` JSDoc understates the response

**misleading / trivial** - `src/api/media.js`

Documented as `{ id, created, latitude, longitude, fileName, title, languageCode }`.
Swagger's `MediaFileLocationDto` also carries `aspectRatio`, `miniature`, `imageUrls` and
`videoUrls` - the map has thumbnails available and the doc says it does not. (The map does
use them; only the doc is behind.)

---

# Small local changes

One file each, or one small extraction. Verification is obvious in every case.

### D1b. Tag caption resolved three ways

**visible / small** - extract one helper into `src/services/tags.js`

| Where | Fallback chain |
| --- | --- |
| `src/stores/search.js` → `captionFromResults` | scan results for the slug → `tagLabel` |
| `src/views/SearchView.vue` → `tagName` | `search.tagName` → `tagLabel(tags.getBySlug(...))` |
| `src/components/layout/SearchBar.vue` → `activeTagName` | `search.tagName` → `tagLabel(tags.getBySlug(...))` → **raw slug** |

The last two differ only in the final fallback, so the heading and the chip can disagree
about the same tag on the same screen: the chip shows `ramen`, the heading shows nothing.
Reachable by a signed-out visitor opening a `?tag=` link that matched nothing.

**Fix:** one `captionForSlug(slug, locale)` in `services/tags.js`, and all three call it.
**Verify:** open `/search?tag=<something>` signed out, and again with a slug that matches
nothing.

### D1c. Locale list hardcoded where `SUPPORTED_LOCALES` exists

**latent / small** - `src/views/AdminTagsView.vue`

`missingCaptions()` hardcodes `['ru', 'en', 'ja']`. `TagEditDialog.vue` decides the *same
question* - whether every language has a caption - through `SUPPORTED_LOCALES`.

So the dialog refusing to save and the table reporting a hole read from two different
lists. Adding a fourth locale would make the table quietly stop reporting it.

**Fix:** import the constant. **Verify:** the table still flags an incomplete tag.

Other hardcoded locale triples exist in `scripts/generate-localized-html.mjs` and
`src/services/head.js`. Both are defensible - one is a build script that cannot import from
`src/i18n`, the other maps to OpenGraph locale tags - so leave them and note them in
[features/i18n-and-theming.md](features/i18n-and-theming.md), which already lists every
place a new locale must be added. A view has no such excuse.

### C3. `inHand` is keyed inconsistently

**latent / small** - `src/components/media/MediaLightbox.vue`

`onFullLoaded` stores `image.getAttribute('src')`; `settleLayers` stores `fullScreen.value`.
Identical strings today. If a redirect or a normalisation ever makes them differ,
`haveFullSize()` silently returns false and filmstrip neighbours go back to sliding past
soft - a degradation with no error and no obvious cause.

**Fix:** store `fullScreenSrc(current.value)` in both. **Verify:** page back and forth
through a day; a file already seen should slide past sharp.

### C1d. Dead branch in `fetchMediaEdit`

**maintenance / small** - `src/api/media.js`

The comment says the response shape is undocumented and tolerates a bare array or an
`{ items }` wrapper. Swagger defines `GetEditMediaResponse { items }`, so the
`Array.isArray(data)` branch is dead.

Deleting it is correct only if the backend is genuinely settled here. Low stakes either
way; the cost of leaving it is one misleading comment.

### D3. `tagsOverflow` is computed by two paths

**maintenance / small** - `src/components/media/MediaLightbox.vue`

`settleTagOverflow()` and the tail of `measureChrome()` compute the same expression
(`expanded || scrollHeight > clientHeight + 1`). `settleTagOverflow` additionally toggles a
class by hand to close a measurement gap. They must stay in agreement and nothing enforces
it.

**Fix:** one function, called from both. **Verify:** expand and collapse the tag row in the
viewer; the picture must not slide.

---

# Extractions

Each removes a real duplicate but touches shared code, so each wants a visual pass.

### D2. Tile lookup by `data-media-id` implemented twice

**maintenance / medium**

- `src/services/scrollToMedia.js` - `document.querySelector([data-media-id=...])`
- `src/components/media/MediaLightbox.vue` → `tilesFor()` - `querySelectorAll`, plus
  on-screen filtering in `tileBox()`

Same convention, two implementations, and **no shared constant for the attribute name**.
The convention is currently invisible to anyone who has not read both files, which is how a
third copy appears.

**Fix:** `src/services/mediaTiles.js` exporting the attribute name plus `tilesFor(id)` and
`visibleTileOf(id)`. **Verify:** a `?i=` link scrolls to its file; the hero flight still
leaves from and returns to the right tile.

### D0. `MediaTile` duplicates `MediaThumb` instead of using it

**maintenance / medium**

`src/components/media/MediaThumb.vue` exists specifically to hold the two-stage
miniature → preview load, and its own header says so: _"kept in one place now that four
different walls of thumbnails want it"_. Three walls use it: `DayEditForm`,
`SimilarMediaPanel`, `AdminTagCollectView`.

`src/components/media/MediaTile.vue` - the main wall, on the day page, the search results
and the pending queue - **does not**. It carries its own copy: the same `loaded` ref, the
same `onLoaded` awaiting `decode()`, the same `getAttribute('src')` comparison with the
same explanatory comment, and the same two-`<img>` markup down to `scale-105 blur-[10px]`.

`MediaTile` is a **superset**: it also tracks `failed` and renders a fallback when there is
neither a miniature nor a working preview. So the fix is to lift `failed` into `MediaThumb`
and have `MediaTile` use it, not to delete either.

This is the clearest instance of the problem the documentation pass was commissioned for:
one behaviour, written twice, in two shapes, where the previous author had already
extracted a component for exactly this purpose.

**Effort is medium only because of blast radius** - `MediaTile` is the most-used component
in the app. **Verify:** cold-load a day (miniatures visible, previews fading in), a file
with a broken preview, and the pending queue.

### D1. Three ways to say "copied"

**maintenance / medium**

| Where | Mechanism |
| --- | --- |
| `src/components/common/ShareButton.vue` | local `feedback` ref, inline `<Transition>`, 2000ms timer |
| `src/components/media/MediaLightbox.vue` | local `shareFeedback` ref, inline `<Transition>`, 2000ms timer - the same code again |
| `src/stores/ui.js` | `notify()` toasts, 4000ms |

The two inline ones are near-identical, and both exist for a good reason: the feedback must
sit next to the button rather than in a page corner. That requirement is sound; having it
implemented twice is not.

**Fix:** one `useCopyFeedback()` composable, or a small `<CopyFeedback>` component.
Deliberately **not** by folding them into `ui.notify` - that would lose the placement the
duplication was paying for. **Verify:** share from the page footer and from inside the
viewer, on success and with the clipboard denied.

---

# Needs a decision or an answer first

### C2. Miniature data URI declares the wrong MIME type

**latent / small, but blocked**

`src/services/mediaAssets.js` uses `data:image/octet-stream;base64,`. Browsers sniff the
bytes so it renders, but it is not what the data is, and it is the kind of thing a strict
CSP or a future `Content-Type` check breaks.

**Blocked on:** what the backend actually encodes. If it is always JPEG, say so; if it
varies, the API should send the type or the frontend should sniff the magic bytes. Worth
asking rather than guessing.

### Q1. `autoTranslate` contract is unverified

**unknown severity**

The frontend sends `autoTranslate` on `PUT /v1/days/{date}` and `PATCH /v1/media`, and both
are in `swagger.json` (`EditDayCommand.BodyParameters`, `EditMediaCommand.BodyParameters`),
so the contract exists. What has **not** been verified from this side is the behaviour:
that the backend fills empty languages from the ones it is given, and returns the full
saved model.

The client is built on both of those - see [features/media-editor.md](features/media-editor.md).
Worth one manual check rather than a code change.

### S2. In-code rationale now duplicates the docs

**maintenance / large - its own pass**

Deliberate, per the agreed plan: docs first, comment trims proposed separately.

The case is now concrete rather than theoretical. **C1e** shows one behavioural change
reflected in one comment and left stale in three others; rationale spread across four files
cannot be kept in step by hand.

The pass has not started. It should produce a list of candidate blocks - comment text whose
reasoning is now recorded in a feature doc - for approval before any source is touched. The
bulk of it is in `MediaLightbox.vue`, `MediaEditDialog.vue` and the `services/` headers.

**Not everything should go.** A comment explaining a single non-obvious line stays; what
moves out is the multi-paragraph history that a feature doc now carries in its
**Invariants** section.
