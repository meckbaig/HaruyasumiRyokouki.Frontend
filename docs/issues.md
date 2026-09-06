# Known issues

Findings from the documentation pass. An entry is deleted once it is fixed or decided
against, so everything on this page is outstanding.

**Status (2026-09-06):** the list is empty. The first pass fixed every correctness and
duplication finding; S2, the in-code rationale that duplicated the docs, was done as its
own pass and the four-line rule in `CLAUDE.md` is what keeps it from coming back.

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

Nothing outstanding.
