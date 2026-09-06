# Search

Two different questions behind one endpoint, a client-side split into tabs, and
client-side match highlighting that must survive diacritic normalisation.

## Files

| File | Role |
| --- | --- |
| `src/api/search.js` | `GET /search`. |
| `src/stores/search.js` | Query state, result cache, tag caption memory. |
| `src/services/searchResults.js` | Splits the response into the two tabs; `restOfDay`. |
| `src/services/highlight.js` | Tokenising, match finding, snippets, parts. |
| `src/views/SearchView.vue` | The page: tabs, groups, viewer, deep links. |
| `src/components/layout/SearchBar.vue` | Field, tag suggestions, chip. |
| `src/components/search/MediaResultGroup.vue` | One day of matched media + "show the rest". |
| `src/components/search/NoteResultCard.vue` | One day note with snippets. |
| `src/components/search/HighlightedText.vue` | Renders `toParts()` output. |

## Two searches, never both

`GET /search` takes `text=` **or** `tag=` (a slug). Neither is a 400. They are different
questions with different answers, and the URL says which:

| URL | Meaning |
| --- | --- |
| `/search?text=ramen` | Free text over titles, descriptions, day notes, tag captions and tag aliases. |
| `/search?tag=ramen` | The exact set of files carrying that tag. |
| `&tab=notes` | Which tab is open - in the URL so a shared link reopens on the same one. |

**A tag search highlights nothing and has no notes tab**, because no words were typed.
This falls out with no special case: the store passes `''` as the query for a tag search,
`tokenize('')` returns `[]`, and everything downstream does the right thing.

Links are always built on the **slug**, never the caption. A caption gets rewritten and
differs per locale, so a link carrying one would break on the first rename and send a
Japanese reader to a search for a Russian word.

## Splitting the response

The backend returns `DayDto[]` without saying *why* each day matched. The shape carries
enough:

- A day matched through its media comes back with `media` holding **only** the matching
  files.
- A day matched through its note alone comes back with `media` empty.

`splitSearchResults(items, query)` therefore produces:

| Field | Contents |
| --- | --- |
| `tokens` | Normalised query tokens. |
| `mediaDays` | `{ date, isReady, languageCode, matched }`, date-sorted. |
| `noteDays` | `{ …, note, snippets }` for days whose note actually matches, date-sorted. |

**A day can legitimately appear in both tabs.** That is not a duplicate - it matched in
both places.

`restOfDay(fullDay, matchedMedia)` subtracts by id, for "show the rest of this day".

## The cache

Keyed by `locale::query` or `locale::#tag`. Locale is part of the key because the same
words return different notes per language; the two search kinds are separate keys because
they are separate questions.

The cache exists because shared links are opened repeatedly and going back from a day to
the results should not refetch. `invalidate()` on locale change is **not** needed - the
locale is in the key - but `days` and `tags` still need theirs.

A visitor typing quickly outruns the network, so an in-flight request is aborted when a
new one starts. `AbortError` is swallowed, never surfaced as an error state.

### Naming a tag without the dictionary

`GET /v1/tags` is behind the login. A visitor following a shared `?tag=` link has no
dictionary - but **every file that came back carries the tag that fetched it, already in
the reader's language**. So `captionFromResults()` reads the caption out of the answer.

Only a tag that matched nothing leaves it blank; there the editor's dictionary is the
fallback, and a signed-out visitor sees the raw slug. `rememberTag()` lets the search bar
name a tag before its results arrive, and `captions` keeps what was learned so returning
to a cached tag still names it.

## Highlighting

All of it is client-side, permanently - the server will not emit snippets, and results are
small enough that doing it here is cheaper.

**Every range is expressed in original text coordinates**, so callers slice the untouched
string and nothing is ever built by concatenating HTML. `v-html` is not used anywhere.

### Why the index map exists

Normalisation lowercases and strips diacritics via NFD, so `ё` matches `е` and `ü`
matches `u`. But normalisation **changes length** - ligatures expand, combining marks
vanish - so `indexOf` on the normalised string returns offsets that no longer line up with
what is displayed.

`normalizeWithMap(text)` builds the normalised copy alongside `map[]`, where `map[i]` is
the index in the original that produced `normalized[i]`. Matches are found in normalised
space and translated back through the map. `end` is `map[index + token.length - 1] + 1`,
because the range is half-open and one normalised character may come from one original
character of different width.

### API

| Function | Returns |
| --- | --- |
| `tokenize(query)` | Normalised tokens, punctuation dropped. |
| `findRanges(text, tokens)` | Merged, sorted `[start, end)` in original coordinates. |
| `hasMatch(text, tokens)` | Cheap existence check that skips building ranges. |
| `buildSnippets(text, tokens, { radius = 90, maxSnippets = 3 })` | Windows around matches, merged when they overlap. Ranges are relative to each snippet's own text; `hasPrefix`/`hasSuffix` say whether to draw ellipses. |
| `toParts(text, ranges)` | Alternating `{ text, match }` for a `v-for`. |

`snapToBoundary` nudges a snippet edge onto whitespace but **gives up after 24
characters** - Japanese has no whitespace to find, and searching further would either hang
on the whole string or cut arbitrarily. It also never snaps past the matches the window
exists to show.

## The search bar

Tag suggestions are what make the vocabulary usable by someone who has never seen it: no
operators, no syntax, no prefix to learn. The visitor types, and tags matching **captions
and aliases across every language** drop down - so "лапша" offers "рамэн" although the word
"лапша" appears on nothing.

- Picking a suggestion searches by slug; pressing Enter searches the words themselves.
  Both are always available and neither has to be discovered - the free-text row is always
  last and always offered.
- Debounced at 200ms, because `GET /tags/suggestion` is a real request. It is the **only
  public tag call**.
- Keyboard cursor runs `0…suggestions.length`, where the last index is the free-text row.

### The chip

`?tag=` draws a chip inside the field - **only on the search page**. `?tag=` also names the
tag being collected on `/admin/tags/collect`, and the header bar was reading that as a
search it was showing results for.

Dismissing the chip is about the field, not the page: it clears `chipDismissed` locally and
puts the caret in the field. It used to navigate, and with nothing typed the only honest
destination was home - which threw away the results the reader was looking at in order to
answer a gesture that only meant "I want to type something else".

## Deep links on this page

Same `?i=`/`?o=` contract as the day page, with one difference: **resolution is against
matched files only**. The rest of a day appears solely because a reader unfolded it, and
reaching into folded days to find a file would mean fetching every one of them on the
chance it is there.

The resolve watcher fires on `search.results` - the store replaces that whole object once
per completed run, cached or fetched, hit or miss, which makes it the one signal meaning
"these are the results now". Watching group counts would fire early, when there are none.

`linkResolved` is reset when the query or tag changes, so a link belonging to an old
result set is resolved again from scratch and dropped if it no longer belongs anywhere.

`MediaResultGroup` hands the viewer `[...matched, ...rest]` in render order, because the
viewer walks a single flat list.

A leading `#` is stripped from a free search. Somebody who has seen a chip written
`#ramen` will type the hash sooner or later, expecting it to mean something. It does not -
tags are picked from the list, never spelled - and a hash appears in no note, so searching
for it would answer nothing.

## Invariants

1. `text=` or `tag=`, never both, never neither.
2. Links carry the slug, never the caption.
3. A tag search passes `''` as the query so tokens stay empty.
4. Highlight ranges are in original coordinates; nothing renders through `v-html`.
5. Search-page `?i=` resolves against matched files only.
6. The chip is drawn only when `route.name === 'search'`.
7. `AbortError` from a superseded request is swallowed, not shown.

## Related

- Tag model, slugs and captions: [tags.md](tags.md).
- The grid inside each result group: [media-grid-and-selection.md](media-grid-and-selection.md).
- `?i=` / `?o=`: [sharing-and-links.md](sharing-and-links.md).
