# Known issues

Findings from the documentation pass. An entry is deleted once it is fixed or decided
against, so everything on this page is outstanding.

**Status (2026-09-15):** the list is empty. The first pass fixed every correctness and
duplication finding; S2, the in-code rationale that duplicated the docs, was done as its own
pass and the four-line rule in `CLAUDE.md` is what keeps it from coming back. The viewer's
gesture costs were gone over the same day: the one defect found - a covered blurred layer
painted into every raster - is fixed, and the rest of what looked like a performance problem
is a property of the raster rather than a fault. See **Rendering cost** in
[media-viewer.md](features/media-viewer.md).

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

- **Bulk download has no server archive** (`visible`, `medium`). The media context menu
  saves a selection one file at a time, each by its own anchor, because the API offers only a
  per-file `download` URL and no zip endpoint (`swagger.json`). Browsers throttle the burst,
  and a cross-origin URL ignores the `download` attribute. The honest fix is a server-side
  archive, e.g. `GET /v1/media/download?ids=1,2,3` returning `application/zip`, which is a
  contract question for the backend. See
  [media-grid-and-selection.md](features/media-grid-and-selection.md).
