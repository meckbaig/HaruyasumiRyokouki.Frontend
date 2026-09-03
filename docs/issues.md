# Known issues

Findings from the documentation pass. An entry is deleted once it is fixed or decided
against, so everything on this page is outstanding.

**Status (2026-09-03):** all correctness and duplication findings from the first pass have
been fixed. One item is left, deliberately scheduled last.

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
| S2 | In-code rationale duplicates the docs | maintenance | large | its own pass |

### S2. In-code rationale duplicates the docs

**maintenance / large - its own pass, its own commit**

Comments in this codebase carry multi-paragraph histories that a feature doc now records.
The house rule (see `CLAUDE.md`) is that code holds a name, a purpose, a warning and a
two-line summary; workflow and reasoning live in `docs/features/*.md`.

The case is concrete rather than theoretical: one behavioural change to miniatures was
reflected in one comment and left stale in three others, which was only caught by reading
all four. Rationale spread across four files cannot be kept in step by hand.

**Scope.** The bulk is in `MediaLightbox.vue`, `MediaEditDialog.vue`,
`MediaLocationPicker.vue`, `assets/main.css` and the `services/` module headers.

**Method.** Produce a list of candidate blocks - comment text whose reasoning is already
recorded in a feature doc - and get it approved before touching any source. Where a block
is cut, check the doc actually carries it first; where it does not, move it there rather
than deleting it.

**Not everything goes.** A comment explaining a single non-obvious line stays. What moves
out is the multi-paragraph history a feature doc now carries in its **Invariants** section.
