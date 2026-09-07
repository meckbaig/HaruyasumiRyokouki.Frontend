# Tags

A tag is an entity with an id. Its words hang off it: one **caption** per language, which
is what a reader sees, and any number of **aliases**, which are searched and never
rendered. Someone looking for "noodles" finds photographs captioned "ramen" and never
learns that "noodles" was written down anywhere.

## Files

| File | Role |
| --- | --- |
| `src/services/tags.js` | Reading a tag: `tagLabel`, `tagWords`, `tagMatches`, `compareTags`, `tagSlugsOf`, `fold`. |
| `src/stores/tags.js` | The dictionary, editor-only. |
| `src/api/tags.js` | All seven tag endpoints. |
| `src/components/editor/TagPicker.vue` | Autocomplete over the dictionary. |
| `src/components/editor/TagEditDialog.vue` | Coining and editing, two steps. |
| `src/components/editor/BulkTagDialog.vue` | Adding a tag to a selection. |
| `src/components/media/TagChip.vue` | One chip. |
| `src/views/AdminTagsView.vue` | The whole vocabulary, commonest first. |
| `src/views/AdminTagCollectView.vue` | Filing by resemblance - see [similarity.md](similarity.md). |

## Slug vs id - the sharpest edge in this codebase

| Shape | Where | Carries |
| --- | --- | --- |
| `TagPublicDto { slug, value }` | On **both** media models, read and edit | Already resolved to the reader's language by the server |
| `TagDto { id, slug, translations[], aliases[], usageCount }` | The dictionary only | Every language at once, plus the numeric id |

**The slug is the tag's public name.** It is what media models carry, what a link puts in
the address (`/search?tag=ramen`), and what everything keys on.

**The numeric id exists in `TagDto` alone** and is wanted at exactly one moment: a media
save sends `changes.tagIds`. So `MediaEditDialog` holds slugs and resolves them through the
dictionary as it builds the request.

**A slug that cannot be resolved must abort the save, not be skipped.** The save *replaces*
the tag set, so a quietly dropped slug is not a tag left alone - it is a tag taken off.

Never build a link on a caption: captions get rewritten and differ per locale, so such a
link breaks on the first rename and sends a Japanese reader to a search for a Russian word.

Tags have **no page of their own**: a set of photographs sharing a tag *is* a search,
and giving it a second route would be two names for one thing.

## Reading a tag

`captionForSlug(slug, locale, { known, fetched })` is what a *view* calls when all it has
is a slug: the caption read out of a response wins, then the dictionary entry, then the
slug itself. All three places that name a tag from a slug go through it, so a heading and
a chip on the same screen cannot disagree.

`tagLabel(tag, locale)` is the lower level, and handles both shapes:
`value` → the exact language row → the first row → the slug. A tag mid-edit may have no
caption in the reader's language, and a chip with nothing on it is worse than a chip in the
wrong language. The slug is not a caption but is at least a name.

`tagMatches(tag, needle)` compares against **captions and aliases in every language at
once**. An editor typing "temple" in a Russian interface is naming a tag they know by its
English caption; refusing them because the interface is in another language would be
pedantry. `fold()` lowercases and strips diacritics, so `ё` finds `е`.

`compareTags` orders by `usageCount` descending, caption ascending as a tiebreak.
**Order is the point**: a tag used two hundred times is far likelier to be the one meant
than one used twice, and alphabetical order buries the working vocabulary under everything
ever coined.

## The dictionary

`GET /v1/tags` is fetched **once per editor session** and held in memory. It is a few
hundred entries and a few dozen kilobytes, so filtering is a plain array scan on every
keystroke - no debounce, no request racing another back.

The real reason is not speed: half the work of filing a photograph is remembering what you
called this sort of thing last time, and a list you can see the whole of answers that. A
search box that only responds to what you already thought of does not.

| Member | Notes |
| --- | --- |
| `load(force)` | One request even if five components ask while it is in flight. |
| `upsert(tag)` | Writes a server-returned tag in place. Create and edit both answer with the saved model, so the list stays true without refetching. |
| `getBySlug(slug)` | **The only place a slug becomes an id.** Nothing else on the client has both. |
| `search(text, locale, { exclude })` | Filtered, commonest first. |
| `clear()` | Signing out must take the dictionary with it - the next editor may differ. |

**It is behind the login.** Anything a visitor sees must name its tags from the response
it already has - see [search.md](search.md) for how the search page does it.

## Coining a tag: two steps, deliberately

`POST /v1/tags/completion` **saves nothing**. It proposes three captions, a slug and some
aliases, and returns existing tags that look like near-duplicates.

Both halves matter:

- The proposal comes from a language model and is wrong often enough that it has to be
  read before it reaches the database. Japanese slips most (katakana where kanji belongs);
  aliases second (words broader than the thing they name).
- The near-duplicate list is the guard against coining "torii" beside an existing
  "torii gate" - the kind of duplicate nobody notices until the vocabulary has two names
  for one thing. Each candidate carries its `usageCount`, which is usually what settles it.

### Where the seed word comes from

| Opened from | First step |
| --- | --- |
| `TagPicker` (media editor) | Skipped - the word is what was being typed. The proposal is already in flight as the dialog appears. |
| `AdminTagsView` | The `seed` step asks for the word. |

Without that step the button read "new tag" and produced an empty form, which is the one
thing this arrangement exists to prevent: captions written by hand, one language at a time,
with no proposal to correct and no near-duplicates shown.

### Two waits that are not the same wait

| Flag | Locks the form? | Why |
| --- | --- | --- |
| `proposing` | **Yes** | A proposal *replaces* captions, slug and aliases. Anything typed meanwhile is about to be thrown away. |
| `suggesting` | No | Asking for more aliases only appends. It still reports progress beside the aliases, or the button reads as broken. |

`suggestAliases` asks on whichever caption is filled - the reader's language first, then
any other. A tag half-written in Japanese still has something to ask about, and refusing
because the interface is in Russian would be a silent no-op, the worst answer a button can
give. A proposal that adds nothing still notifies, because an unchanged screen is
indistinguishable from a button that did not work.

### Completeness

`canSave` requires a caption in **every** `SUPPORTED_LOCALES` plus a slug. A tag with a
hole in it shows a Russian word to a Japanese reader, and the hole is invisible from
whichever language you happened to fill in - cheaper to refuse here than to find months
later on a page nobody reads in the language it broke in.

### Minimising instead of closing

A proposal costs tokens and a wait, and the first thing an editor wants to do with it is go
and look at the tag it says already exists. So the dialog folds to a bar at the foot of the
screen instead of closing; everything typed and proposed is still there.

`inspect` decides what clicking a near-duplicate means: in the media editor "that one is
what I meant" (the tag goes on the file, dialog done); on the tag screen "let me see that
one first" (the filter narrows to it, the dialog folds).

A failed proposal is **not** a reason to lose the word - the form still opens with the one
caption known for certain.

## Adding vs replacing

Two genuinely different operations, not one with a switch:

| | `PATCH /media` `changes.tagIds` | `POST /tags/{id}/media` |
| --- | --- | --- |
| Effect | **Replaces** the file's tag set | **Adds**, leaving other tags alone |
| Used by | `MediaEditDialog` | `BulkTagDialog`, tag collecting |
| Batching | One request for the whole selection | One tag per request |

Filing by subject means touching files whose other tags are none of the operation's
business, which is why the second exists.

`BulkTagDialog` sends one request per tag in sequence so progress stays honest and a
failure halfway leaves a clear account of what landed. After each success it writes the tag
onto the media objects locally (`addTagLocally`) and bumps `usageCount` through
`tags.upsert` - usage counts order every tag list on the site, and waiting for a refetch
would leave them wrong.

**A media save starts the tag field from the union of what the selection carries** (a blank
field would read as "these have no tags") **but sends nothing until the list actually
changes.** For one file, replace is what is meant; for a selection it is a trap.

## The picker

- Tags are **chosen, never spelled out.** They used to be words typed into a box, one list
  per language, and every misspelling and near-synonym coined a new one.
- The field is **one editable line of chips**, not chips plus a trailing box. Chips are
  atomic and the gaps between them are real text, so the caret can be parked in any gap
  with the mouse or the arrow keys. That is what lets a tag be edited in the middle of the
  line, not only at the end.
- Typing in a gap filters the dictionary and the pick lands **at that gap**. Backspace at
  the start of a gap pulls the chip on its left back into text and re-opens the picker, so
  the tag can be re-committed with Enter or swapped for another match in place.
- Coining is offered whenever something is typed, not only when nothing matched: "temple"
  matching "temple grounds" does not mean "temple" exists.
- `single` mode exists for the collect screen. The alternative is a second autocomplete
  over the same dictionary with the same matching rules - two to keep in step for one line
  of behaviour.
- `unknownCount` is only reported once `tags.loaded`; before that every slug is unresolved
  and announcing it would report loading as a fault.
- `autofocus` marks the field; **`ModalDialog` does the focusing**, because two components
  racing for focus is how the caret ends up somewhere neither meant.

### The tag list is not a table on a phone

Four columns and a link do not fit across 360 pixels, and what fell off the right-hand edge
was the one control on the row that does something other than open it. So the counts move
under the caption on the narrow layout and the link keeps its corner; from `sm` up the
columns come back.

## Invariants

1. Slugs everywhere; the numeric id only at `changes.tagIds`, resolved via `getBySlug`.
2. An unresolvable slug aborts a media save.
3. Links and route queries carry slugs, never captions.
4. The dictionary is editor-only; visitor-facing screens name tags from the response.
5. `tags.clear()` on sign-out.
6. A new caption is required in every supported locale before a tag can be saved.
7. `BulkTagDialog` adds; `MediaEditDialog` replaces. Do not merge them.

## Related

- Naming a tag without the dictionary: [search.md](search.md).
- Filing by resemblance: [similarity.md](similarity.md).
- The media save that carries `tagIds`: [media-editor.md](media-editor.md).
