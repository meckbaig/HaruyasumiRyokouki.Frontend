# Known issues

Findings from the documentation pass.

**Status (2026-09-03):** everything that cannot change runtime behaviour has been fixed.
What remains is code. Nothing below has been reproduced in a browser, so "visible" means
"the code says this happens", not "observed".

## How this list is ranked

**Severity**

| Label | Meaning |
| --- | --- |
| `visible` | Someone can see something wrong today |
| `latent` | Correct today, breaks on a plausible future change |
| `maintenance` | Duplication cost only; nothing breaks, everything costs twice |

**Effort**

| Label | Meaning |
| --- | --- |
| `small` | One file, a few lines, obvious verification |
| `medium` | Touches several files or a heavily used component; needs a visual pass |
| `large` | Its own reviewable task |

## Open

| # | Finding | Severity | Effort | Fix method |
| --- | --- | --- | --- | --- |
| D1b | Tag caption resolved three ways; heading and chip can disagree | visible | small | extract one helper |
| D1c | Locale list hardcoded where `SUPPORTED_LOCALES` exists | latent | small | use the constant |
| C3 | `inHand` keyed two ways in the lightbox | latent | small | one key |
| C1d | Tolerant branch in `fetchMediaEdit` the contract does not need | maintenance | small | decide, then delete or document |
| D3 | `tagsOverflow` computed by two paths | maintenance | small | one function |
| D2 | Tile lookup by `data-media-id` implemented twice | maintenance | medium | extract a service |
| D0 | `MediaTile` duplicates `MediaThumb` instead of using it | maintenance | medium | lift `failed`, then reuse |
| D1 | Three ways to say "copied" | maintenance | medium | one composable |
| S2 | In-code rationale now duplicates the docs | maintenance | large | its own pass, **last** |

---

# Open: small local changes

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

**Fix:** one `captionForSlug(slug, locale)` in `services/tags.js`; all three call it.

### D1c. Locale list hardcoded where `SUPPORTED_LOCALES` exists

**latent / small** - `src/views/AdminTagsView.vue`

`missingCaptions()` hardcodes `['ru', 'en', 'ja']`. `TagEditDialog.vue` decides the *same
question* - whether every language has a caption - through `SUPPORTED_LOCALES`.

So the dialog refusing to save and the table reporting a hole read from two different
lists. Adding a fourth locale would make the table quietly stop reporting it.

Other hardcoded triples exist in `scripts/generate-localized-html.mjs` and
`src/services/head.js`. Both are defensible: one is a build script that cannot import from
`src/i18n`, the other maps to OpenGraph locale tags. Leave them; they are listed in
[features/i18n-and-theming.md](features/i18n-and-theming.md) among the places a new locale
must be added. A view has no such excuse.

### C3. `inHand` is keyed inconsistently

**latent / small** - `src/components/media/MediaLightbox.vue`

`onFullLoaded` stores `image.getAttribute('src')`; `settleLayers` stores `fullScreen.value`.
Identical strings today. If a redirect or a normalisation ever makes them differ,
`haveFullSize()` silently returns false and filmstrip neighbours go back to sliding past
soft - a degradation with no error and no obvious cause.

**Fix:** store `fullScreenSrc(current.value)` in both.

### C1d. Tolerant branch in `fetchMediaEdit`

**maintenance / small** - `src/api/media.js`

The code accepts either a bare array or an `{ items }` wrapper. Swagger defines
`GetEditMediaResponse { items }`, so the array branch is unreachable against the current
contract.

**This is a judgement call, not a defect.** The same reasoning that settled C2 applies:
the implementation works, and a defensive branch costs nothing at runtime. Either delete it
because swagger is authoritative, or keep it and change the comment to say it is deliberate
tolerance rather than uncertainty about the shape. Right now the comment says the shape is
"undocumented", which is no longer true.

### D3. `tagsOverflow` is computed by two paths

**maintenance / small** - `src/components/media/MediaLightbox.vue`

`settleTagOverflow()` and the tail of `measureChrome()` compute the same expression
(`expanded || scrollHeight > clientHeight + 1`). `settleTagOverflow` additionally toggles a
class by hand to close a measurement gap. They must stay in agreement and nothing enforces
it.

---

# Open: extractions

Each removes a real duplicate but touches shared code, so each wants a visual pass.

### D2. Tile lookup by `data-media-id` implemented twice

**maintenance / medium**

- `src/services/scrollToMedia.js` - `document.querySelector([data-media-id=...])`
- `src/components/media/MediaLightbox.vue` → `tilesFor()` - `querySelectorAll`, plus
  on-screen filtering in `tileBox()`

Same convention, two implementations, and **no shared constant for the attribute name**.
The convention is invisible to anyone who has not read both files, which is how a third
copy appears.

**Fix:** `src/services/mediaTiles.js` exporting the attribute name plus `tilesFor(id)` and
`visibleTileOf(id)`.

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

The clearest instance of the problem the documentation pass was commissioned for: one
behaviour, written twice, in two shapes, where the previous author had already extracted a
component for exactly this purpose. **Effort is medium only because of blast radius** -
`MediaTile` is the most-used component in the app.

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
duplication was paying for.

---

# Open: last

### S2. In-code rationale now duplicates the docs

**maintenance / large - its own pass, after the code fixes above**

Deferred by decision: fix the behavioural findings first, then trim comments as a separate
commit so the diff is readable.

The case is concrete rather than theoretical. **C1e** (below) showed one behavioural change
reflected in one comment and left stale in three others; rationale spread across four files
cannot be kept in step by hand.

The pass should produce a list of candidate blocks - comment text whose reasoning is now
recorded in a feature doc - for approval before any source is touched. The bulk is in
`MediaLightbox.vue`, `MediaEditDialog.vue` and the `services/` headers.

**Not everything should go.** A comment explaining a single non-obvious line stays; what
moves out is the multi-paragraph history a feature doc now carries in its **Invariants**
section.

---

# Closed

### C1, C1b, C1c, C1e, C1f. JSDoc and comment drift - **fixed 2026-09-03**

Five places where a comment described something the code did not do. All were text-only
fixes with no behaviour change.

| # | File | Was | Now |
| --- | --- | --- | --- |
| C1b | `src/api/tags.js` | `fetchTagSuggestions` documented a `{ id, ... }` response | Names `TagSuggestionDto { slug, value, usageCount }` and says why there is no id |
| C1e | `src/services/mediaAssets.js` ×2, `src/components/media/MediaThumb.vue` | "a tiny base64 **square**", "**Always square**" | Says it keeps the file's own proportions and that cropping is the client's job |
| C1 | `src/api/media.js` | `changes` omitted `private`, `favorite`, `tagIds` | Full shape, plus the note that `tagIds` replaces rather than adds |
| C1c | `src/api/media.js` | `MediaFileLocationDto` listed 7 of its 11 fields | Full shape, including the thumbnail fields map popups use |
| C1f | `src/api/days.js` | `saveDay` documented a `{ value: DayEditDto }` envelope | `{ day: DayEditDto }`, which is what swagger says and what the form already reads |

C1f was found while verifying Q1. The code was correct; only the comment was wrong.

### C2. Miniature data URI MIME type - **not a defect, by decision**

Closed 2026-09-03 by the project owner. `data:image/octet-stream;base64,` is deliberate,
not a placeholder: this is an open-source project, the server may hold miniatures in any
format, and browsers sniff the magic bytes of a data URI whatever type is declared. Having
the API name the type would cost a field on every file in every response to state something
the browser works out for itself.

The reasoning is now recorded at the constant in `src/services/mediaAssets.js` and in
[features/api-layer.md](features/api-layer.md), so it does not get "fixed" later.

### Q1. `autoTranslate` contract - **confirmed, UI is correct**

Confirmed 2026-09-03 by the project owner. The flow is two halves, and only the first is
persisted:

1. The backend saves the fields the request carried.
2. It then translates into the languages left empty and returns those **without storing
   them**.

Keeping the translation is a second save, made by the editor after reading it. That is why
both edit dialogs stay open on this path instead of closing, and it is also the escape
hatch: leaving without saving again discards the machine's work.

Recorded in `src/api/media.js`, `src/api/days.js`,
[features/media-editor.md](features/media-editor.md) and
[features/day-editor-and-pending.md](features/day-editor-and-pending.md).

### Dash convention - **applied 2026-09-03**

Em and en dashes replaced with plain hyphens across the repo: 296 in markdown, 425 in code
comments, 53 in UI copy and developer-facing strings.

**One deliberate exception:** the character class in `tokenize()`
(`src/services/highlight.js`) keeps both characters. They are search separators a reader may
type, not typography, and replacing them would stop the tokeniser splitting on them. A
comment above the function now says so, so a future sweep does not undo it.

### S1. Two sources of truth for documentation - **resolved**

`README.md` is the human-facing page; `docs/` holds the technical detail; `CLAUDE.md` is the
agent entry point. `docs/README.md` was removed as a redundant third index.
