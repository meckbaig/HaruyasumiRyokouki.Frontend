# Media link and history model

The pair in the address is `i=<ids>` (accent) and `o=1` (viewer open). This is the
design review the two recent defects force: the model mixes state that is encoded
in the address with state that lives under the hood, and the browser Back has to
guess which is which.

## The two defects

1. **A plain close scrolled to the note.** Closing the viewer by the cross lands
   on an entry that carries no `i`, and
   [`onPopState`](../src/views/DayView.vue:273) read the absence of `i` as "the
   reader returned to the note", so it scrolled.
2. **Back restored an old accent.** At a deep-linked `?i=758`, following a
   reference pushed a second accent entry `?i=900`; Back popped to `?i=758`
   instead of returning to the line the reader came from.

Both are the same fault: the address is asked to mean something it does not
carry.

## What writes the pair today

| Action | Writer | History | Note |
| --- | --- | --- | --- |
| Follow a reference that scrolls | [`departFromText`](../src/views/DayView.vue:163) to `mediaLink.push(ids, false)` | **push** | A pure accent becomes a place. |
| Follow a reference in view | [`activateNoteMedia`](../src/views/DayView.vue:189) to `mediaLink.write(ids, false)` | replace | |
| Press outside the accent | [`dismiss`](../src/composables/useMediaLink.js:115) on document `pointerup` | replace | A hidden writer; it rewrites the entry the reader stands on. |
| Open the viewer | [`openAt`](../src/composables/useMediaRouteViewer.js:85) | **push** | `i` plus `o`. |
| Turn a page | [`turn`](../src/composables/useMediaRouteViewer.js:93) | replace | File replaced inside the same place. |
| Close by hand | [`close`](../src/composables/useMediaRouteViewer.js:103) | back if pushed, else replace | |
| Show on the map | [`dismiss`](../src/composables/useMediaRouteViewer.js:136) | replace | |
| Follow a note onto the map | [`followNoteMap`](../src/views/DayView.vue:219) to `depart` | **push duplicate** | Committed as a way back. |
| Open the full-screen map | [`openMapFullscreen`](../src/views/DayView.vue:320) to `depart` | **push duplicate** | |
| Return to the text | [`returnToTextAnchor`](../src/services/textAnchor.js:35) | none | A module ref, not a place. |

## Root cause

Two sources of truth:

- The **address** owns the viewer and the accent.
- A **module ref** owned by [`textAnchor.js`](../src/services/textAnchor.js:11)
  owns "the line the reader followed from".

The reader's Back changes only the address, so it cannot reproduce out-of-band
state. [`onPopState`](../src/views/DayView.vue:273) bridges the gap by guessing:
"an entry with no `i` means the reader was returning to the note". That guess is
wrong whenever an entry lacks `i` for another reason, which is defect 1. The
imperative flags (`pushed`, `handClosing`, `consumingStep`, `mapStepPushed`) are
the same bridge, and every one of them is a place a bug can hide.

The commit [`plans/media-open-url-driven.md`](media-open-url-driven.md) already
named this: one durable state, one writer. The accent was left as a second
writer.

## The tension in the three rules

| Rule | Says | Implies |
| --- | --- | --- |
| `i=ID` is an accent | The page and the UI do not change | It must not be a history entry; every write replaces. |
| `i=ID&o=1` is the open action | The display mode changes, the page is remembered | Push on open, replace on turn, pop on close. |
| Return to the text is not a route | It is triggered by something other than the path | Back cannot trigger it, because Back only moves between entries. |

Rules one and three are consistent with each other and with a small model. The
one expectation that is **not** consistent with them is "the browser Back must
return to the text after a follow". Back can only replay entries; if the return
is not an entry, Back cannot produce it. A choice has to be made.

## Options

| | Accent in history | Back returns to text | Moving parts | Cost |
| --- | --- | --- | --- | --- |
| **A. Address of places, return by button** | No, always replace | No, only the two buttons | Fewest: no `onPopState` return branch, no flags | After a follow, Back leaves the day page. |
| **B. Follow is a duplicate step** | No distinct accent entry, but the address repeats | Yes, from the duplicate | The `depart` trick plus one anchor check | History holds entries whose address never changes. |
| **C. The note line is addressable** | No | Yes | A hash such as `#note=id:index` | The most surface; hash and router scroll must be reconciled. |

### A. The address records places, the return is an affordance

- `i` alone is view state: every writer replaces, never pushes.
- `o=1` is a place: open pushes, turn replaces, any close pops.
- The note return is offered only by the round button and the viewer's arrow.
  The `onPopState` return branch is deleted.

Pros: one writer, no guessing, the smallest model, and the plan's target exactly.
Cons: after a follow with no viewer, Back leaves the page instead of moving up
the page. The reader uses the round button. Defect 2 is gone; defect 1 cannot
exist because nothing reads the address to decide the scroll.

### B. The follow is a place, kept as a duplicate step

- The follow replaces `?i=<ids>` and then pushes an identical step, the trick
  [`followNoteMap`](../src/views/DayView.vue:219) already uses through `depart`.
- The address never shows a stale accent; Back pops the duplicate, the address is
  unchanged, and the page scrolls to the anchor.

Pros: Back returns to the text and equals the round button; no stale `i=758`.
Cons: the history holds entries that differ only in scroll, so the address stops
being the sole truth, and the anchor plus a `popstate` check remain. It is a
smaller change than C but keeps one bridge.

### C. The note line is addressable

- Encode the followed reference, for example `#note=<mediaId>:<index>`, so the
  address carries the way back and Back and Forward restore it from the URL.

Pros: nothing under the hood; Back and Forward are symmetric; a note line is
shareable. Cons: a second address channel to reconcile with `i` and `o`, and the
hash does not scroll by itself through the router.

### C in detail, the hash as the way back

| Channel | Meaning | History |
| --- | --- | --- |
| `?i=<ids>` | The accent, view state | replace only |
| `?o=1` | The viewer open | push on open, replace on turn |
| `#note=<mediaId>:<index>` | The line the reader followed from | set on the entry the reader is leaving, so Back restores it |

**When the hash appears.**

- A follow that scrolls: the accent is replaced, the hash is written onto the
  entry the reader is leaving, and a step for the tile view is pushed. Back pops
  back to the entry that carries the hash and scrolls to the line.
- A viewer opened from a reference: its entry carries the same hash, so the
  viewer's arrow and the browser Back both return to the line.

**When the hash goes.**

- The reader returns, by the round button or the viewer arrow: the hash is
  dropped.
- The line becomes readable again: the existing settle clears it, exactly as it
  clears the anchor ref today.
- The day changes, or the page unmounts.

**What C buys.** The anchor module ref disappears: the way back is in the
address, so a reload, a Forward, or a copied link all carry it.

**Risks.**

1. Three channels in one address. Every writer must keep `i`, `o` and the hash in
   step, or the screen desyncs from the URL.
2. The browser scrolls to a hash natively. That fights `scrollBehavior` returning
   false and fights `scrollToMedia`, so the native scroll must be suppressed.
3. `#note=900:0` holds a colon, so it is not a plain element id; it needs a
   mapping like `anchorSelector` does for `data-text-anchor`.
4. On a cold load, or a lazily revealed wall, the target may not be rendered yet,
   so the scroll must be retried after render.
5. `pageIdentity` ignores the hash today, so "did the reader move" needs review.
6. A copied share link carries the hash; decide whether to keep or strip it.
7. C still needs the signal that a hand-close is not a Back, because both pop to
   the same hash-carrying entry (the existing `consumeHandClose`). The win is
   narrower than it looks, but it is the anchor ref that goes.

## A worked example, A versus B

The reader deep-links `?i=758`, then follows an embed that points at file `900`
further down the wall. The follow scrolls to `900` and remembers the line it
came from.

| | Model A | Model B |
| --- | --- | --- |
| After the follow | one entry, `?i=900` | two entries, both `?i=900` |
| Browser Back | leaves the day page | stays on the day, scrolls to the line |
| Return to the line | the round button only | the round button and Back |

The difference is one thing only: **does Back undo the follow.** In B the follow
adds a step, so Back can take it back; the step repeats the same address, so no
stale `?i=758` returns. In A the follow is not a navigation at all, so there is
nothing for Back to undo, and the way up is the button.

B keeps the address unchanged between its two entries, but the meaning of the
step - "the reader came from a line" - still lives outside the address, in the
anchor, and is read back on `popstate`. So B keeps one bridge. A removes that
bridge by removing the thing it bridged.

## Recommendation

Two models make the address the single source of truth, and they differ in
**where the return lives**:

- **A** makes the address the source of truth by taking the return out of the
  model. A follow is not a place, so there is nothing to encode and nothing to
  guess.
- **C** makes the address the source of truth by putting the return **into** the
  address, for example `#note=<mediaId>:<index>`. Back and Forward then restore
  the line from the URL, and the anchor ref disappears.

So C does solve the same problem as A; calling A "the only" model above was
wrong, and the corrected comparison is:

| | Return in the model | Out-of-band state | Extra history entries | Address surface |
| --- | --- | --- | --- | --- |
| A | No, the button only | None | None | None added |
| B | Yes, as an unnamed step | The anchor ref | One duplicate per follow | None added |
| C | Yes, as a named place | None | One hash entry per follow | A hash channel |

**Recommendation: A**, because it removes the bridge instead of re-routing it,
and it matches the three rules as written. If the browser Back must undo a
follow, **C** is the consistent way to do it, because the return becomes
addressable instead of a duplicate; **B** is the smaller stopgap that reuses the
map's `depart` trick.

The one wrinkle of A is deliberate: a follow is not a navigation, so Back does
not undo it; the round button does.

## Concretely for A

1. [`departFromText`](../src/views/DayView.vue:163) becomes a `write` (replace),
   not a `push`; `mediaLink.push` loses its only caller and is deleted.
2. Delete the return branch of [`onPopState`](../src/views/DayView.vue:273); keep
   only the map handling. The `returningToText` flag and `suppressScroll` go too.
3. The viewer's close stays `back` when this session pushed the step, so Back and
   the cross land on the same place. Keep `consumeHandClose` so a hand-close is
   never answered as the reader's Back.
4. The round button and the viewer's arrow remain the only returns to the text.
5. Review [`dismiss`](../src/composables/useMediaLink.js:115): clearing the accent
   on an outside press is fine, but it must stay a `replace` and must never
   decide history.

## Decision

**C was chosen and implemented.** The reader keeps the browser Back as a way to the
line, and it does not cost the accent its place: a follow replaces the accent and
the hash onto the entry it leaves, then pushes an identical step, so Back walks up
to the line and no stale accent returns. The anchor ref is gone; the hash is the
way back. The steps under "Concretely for A" do not apply.

## Invariants to keep

- The pair has one writer, the router.
- `i` without `o` is never a **distinct** history entry; a follow repeats the same
  address rather than recording a new accent.
- A turn never adds an entry.
- A hand-close and the browser Back land on the same entry.
- The text return is never inferred from the accent; it is the `#note=` fragment.
