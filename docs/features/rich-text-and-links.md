# Rich text in notes and descriptions

A day note and a media description are stored as plain strings, but they carry a small
markup: links, and a file of the page referenced by its id. This covers the parser, the
renderer, the hover card, the editor field that highlights the markup, and the way back from
the viewer to the text.

## Files

| File | Role |
| --- | --- |
| `src/services/richText.js` | `parseRichText` (tokens with `raw`), `linkLabel`, editor template builders. |
| `src/components/common/RichText.vue` | Token renderer and hover card owner; emits references upward. |
| `src/components/common/MediaHoverCard.vue` | The card: thumbnail, title, description, time, go-to-media button, cross. |
| `src/components/common/RichTextArea.vue` | The editor field: a textarea with the markup highlighted behind it. |
| `src/services/textAnchor.js` | The remembered reference, `anchorSelector`, `mirrorTextAnchor`, `returnToTextAnchor`. |
| `src/services/mediaPick.js` | The fleeting mode where a tile click fills a media template. |
| `src/composables/useTemplateInsert.js` | `insertTemplate` - writes a template at a caret and returns its range. |
| `src/views/DayView.vue` | Renders the note; decides the anchor; owns the viewer and the return. |
| `src/components/media/MediaLightbox.vue` | The return button and the description as rich text. |
| `src/components/editor/DayEditForm.vue` | Note field, template buttons, media picking. |
| `src/components/editor/MediaEditDialog.vue` | Description field and its template buttons. |
| `src/assets/main.css` | `.rich-link`, `.rich-media`, `.media-hover-card`, `.rich-editor*`, `.text-anchor-flash`. |

## The markup

| Written | Renders as | Note |
| --- | --- | --- |
| `[media=5]Caption[/media]` | A chip labelled "Caption" | A file resolved against the page's own list. |
| `[url=https://...]Name[/url]` | A link labelled "Name" | Opens in a new tab. |
| `https://...` alone | A link | Labelled by `linkLabel`. |

`linkLabel` keeps the host without `www.`, then the last path segment, the middle replaced
by an ellipsis: `https://www.youtube.com/live/KwDqqZ9anRc?si=...` becomes
`youtube.com/.../KwDqqZ9anRc`. A single-segment path keeps that segment; query and fragment
are dropped. A trailing comma, period or bracket belongs to the sentence and is left as text
after the link.

## Tokens, not HTML

`parseRichText` returns ordered tokens (`text`, `media`, `link`). Each also carries `raw`,
the exact source it came from: the renderer ignores it, the editor paints it. Nothing is
concatenated into an HTML string and `v-html` is never used, so a note cannot inject markup,
and the editor's highlight layer is guaranteed to show the same characters as the field.

## The hover card

Pointing at a chip shows the card to its right, and so does a tap on a touch screen: a 160px
square thumbnail on the left with the clock stamped onto its bottom corner the way a day's
tiles stamp theirs, and the title and description on the right. **The date is deliberately
absent** - the card is only ever
shown over a day page, so the day is a fact the reader already has. Links are not chipped
this way; only media references have a card.

- **The card is placed in document coordinates and lives on `<body>`.** Scroll offsets are
  added to the chip's viewport rectangle, so the card scrolls with the page instead of
  hanging over it. It flips to the left of the chip when the right would run off screen.
- **The card fades in and out.** A `Transition` named `hover-card` wraps it. It is a hint,
  not a dialog, so it only fades - no rise, no drift. The leaving card stops answering the
  pointer at once, so it cannot swallow the hand on the way back to the chip.
- **A 500ms timeout lets the pointer cross the gap.** Leaving the chip starts a timer;
  entering the card cancels it; leaving the card starts it again. This replaces an arrow
  drawn between the two.
- **A cross closes it by hand**, in case the timeout runs while the pointer is away.
- **A mouse hovers; a touch taps.** A touch reports an enter and a focus too, and answering
  either put the card under the finger, where the click a browser invents from the tap then
  landed on the card's own picture. So the card opens on a mouse's enter or on a keyboard
  focus, and on a touch screen it opens from the tap's click. The timeout is a mouse's as
  well: a tapped card has nothing hovering to keep it open, so it goes on a press anywhere
  outside it, or on the cross.
- **A tapped card swallows the click from before it was open.** A card shown by a touch
  answers nothing for `GHOST_CLICK_MS` (`services/ghostClick.js`), the same window the grid
  and the viewer use for that invented click.
- **The card carries a way to the file's tile.** It makes the action a mouse click on the
  text makes, offered on a touch screen where the tap shows this card instead, and left on a
  mouse where it repeats what the text already does.
- **A missing file still opens a card.** The id did not resolve against the page's list, so
  the card says so and shows the reference's own text.

## The way back

A mouse click on a chip singles the file out with `?i=<id>` and scrolls to its tile; the
thumbnail in the card opens it full screen. On a touch screen the tap shows the card, and
the card's own button singles the file out. `RichText` only reports what was followed - it emits
`{ mediaId, index }` with `index` the occurrence, since one file may be referenced more than
once - and the page decides what to do with it.

- **`DayView.rememberReference` keeps the anchor only while the reference is off screen.**
  A way back to a line already in view moves nothing, so nothing is recorded and the
  viewer's arrow is not offered.
- **Opening with an anchor present pushes a history entry.** The URL carries `?i=&o=1`, and
  `mirrorTextAnchor` writes the anchor onto that entry's `history.state`. Paging keeps
  replacing, so the page is not buried under one entry per picture.
- **The browser's Back is the same way back as the arrow.** A `popstate` onto an entry that
  does not ask for the viewer closes it, and one back to the text also scrolls to the
  reference. Closing does **not** depend on the anchor: a Forward then Back through the
  pair can arrive with no anchor left, and the viewer still has to close. The arrow is the
  explicit version of the same return.
- **The arrow stays while paging.** The anchor names a place in the text, not the picture it
  opened, so paging away does not lose it.
- **Returning scrolls, lights and clears.** `returnToTextAnchor` scrolls the chip to the
  middle, adds `.text-anchor-flash` for 1.6s, and drops the anchor - after which the arrow is
  gone from the UI. The flash is a static background, not an animation, so it survives
  reduced motion.
- **The anchor is cleared when the viewer closes, when the day changes and on unmount**,
  because in each case it named something the reader is no longer looking at.

The state lives in a module ref, **not** in `history.state` alone: vue-router rewrites that
state on every navigation, which would drop the anchor while the viewer is still open. The
mirror exists so the browser's own Back sees it.

## The editor

- **Buttons sit level with the field's label**, not in a row of their own under the field.
- **`RichTextArea` highlights the markup.** It is a textarea whose own text is transparent,
  with a `<pre>` of the same tokens painted behind it, scrolled in step. The two layers share
  every metric - font, padding, line height, `scrollbar-gutter` - or the highlight drifts
  away from the words.
- **The field opens at the height its text needs, plus two lines.** It only ever grows from
  `rows`; typing does not resize it under the reader.
- **The field does not draw the global focus ring.** The wrapper's border already says it has
  focus, and an accent ring around the whole field read as a selected tile.
- **A selection is a translucent tint, not a solid one.** The field's text is transparent, so
  an opaque selection background would paint over the highlighted layer and hide the very
  text being selected.
- **The media button then waits for a tile.** Pressing it writes `[media=id]…[/media]` with
  the placeholder selected and calls `startPick`; a click on a tile in the grid hands its id
  to `insertTemplate`'s remembered range and does not open the viewer. Typing, or unmounting
  the form, cancels the wait.
- `insertTemplate` dispatches `input`, so a `v-model` always follows.

## Invariants

1. Rendering is token-based; `v-html` is never used for note or description text.
2. `raw` on a token is the exact source; the editor layer and the field must agree
   character for character.
3. The anchor is kept only when the reference is off screen.
4. Only an open with an anchor present pushes; every other write replaces.
5. The anchor's module ref is the source of truth; `history.state` is a mirror.
6. A media reference is resolved against the page's own list, and a miss is shown, not
   dropped.
7. The card is positioned in document coordinates so it scrolls with the page.
8. A tile click while picking must not open the viewer.
9. The viewer closes on any step onto an entry without `o=1`, anchor or not.
10. A selection in the editor field must stay translucent.
11. A hover belongs to a mouse: a touch enter or focus must not open the card, or the click
    the tap invents lands on the card's own picture.
12. A tapped card is dismissed by a press outside it or the cross, never by the hover
    timeout.
13. A mouse click on a reference follows it to its tile; a tap shows the card, whose own
    button follows it instead.

## Related

- The viewer that owns the return button: [media-viewer.md](media-viewer.md).
- The note and its drafts: [day-editor-and-pending.md](day-editor-and-pending.md).
- `?i=` deep links, which this reuses: [sharing-and-links.md](sharing-and-links.md).
