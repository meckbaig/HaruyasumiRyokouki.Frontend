# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Read this first

Documentation lives in [docs/](docs/) and is written for you.

1. [docs/architecture.md](docs/architecture.md) - **always**, before any change.
2. The relevant feature doc below - before touching that feature.
3. [docs/issues.md](docs/issues.md) - known problems; do not re-report them as new.

| Working on | Read |
| --- | --- |
| Anything touching the API | [api-layer.md](docs/features/api-layer.md) |
| Sign-in, editor gating | [auth-and-editor-access.md](docs/features/auth-and-editor-access.md) |
| Day pages, calendar, dates | [days-and-calendar.md](docs/features/days-and-calendar.md) |
| Front page, favourites | [home-and-favorites.md](docs/features/home-and-favorites.md) |
| Grid, tiles, selection | [media-grid-and-selection.md](docs/features/media-grid-and-selection.md) |
| The lightbox | [media-viewer.md](docs/features/media-viewer.md) |
| Search, highlighting | [search.md](docs/features/search.md) |
| Tags | [tags.md](docs/features/tags.md) |
| Similarity, tag collecting | [similarity.md](docs/features/similarity.md) |
| Maps, coordinate picker | [maps.md](docs/features/maps.md) |
| Media edit dialog | [media-editor.md](docs/features/media-editor.md) |
| Day notes, pending queue | [day-editor-and-pending.md](docs/features/day-editor-and-pending.md) |
| Links, sharing, previews | [sharing-and-links.md](docs/features/sharing-and-links.md) |
| Locales, themes, motion, CSS | [i18n-and-theming.md](docs/features/i18n-and-theming.md) |
| Dialogs, overlays, toasts | [ui-shell.md](docs/features/ui-shell.md) |
| Build, release, deploy | [build-and-release.md](docs/features/build-and-release.md) |

[README.md](README.md) carries the map of which feature lives where. If a feature has no
doc yet, read the code and then write one.

### Writing these docs

- English, present tense, terse. Tables over prose wherever a table fits.
- Open with a **Files** table naming every file involved and its role, so the next agent
  opens the right one without searching.
- Close with an **Invariants** section: rules that look like bugs and are not, each with
  the half-line of history that explains it. This is the section that stops a rewrite.
- Record defects in [docs/issues.md](docs/issues.md) instead of fixing them in passing.
- One doc per feature under `docs/features/`, linked from both `README.md` and here.

## Rules

- **Everything written into a file in this repo is English** - comments, JSDoc, markdown,
  `.env` samples. Chat with the user is in the language the user is writing in.
  User-facing UI strings live in `src/i18n/locales/` and are ru/en/ja.
- **Never use an em dash (U+2014) or an en dash (U+2013).** Use a plain hyphen `-`.
  This applies everywhere without exception: markdown, code comments, JSDoc, commit
  messages, UI copy in the locale JSON, and replies to the user in chat.
- **Stay inside this folder.** Do not read, explore or modify sibling projects under
  `e:\User\Visual Studio 2022\`, including the backend. `swagger.json` here is the single
  source of truth for the API. When something about the backend is unclear, ask or record
  it as a contract question.
- **Plain JavaScript, no TypeScript.**
- **Comments are short. Long explanations belong in `docs/`.** Code is expected to be
  self-documenting; a comment says what a function, constant or block is for, quickly.

  | In the code | In `docs/features/*.md` |
  | --- | --- |
  | Name, purpose, a warning, a two-line summary | Workflow and sequence of operations |
  | A usage example, where it genuinely helps | Why the design is this way, and what broke before |
  | A one-line note on a non-obvious line | Anything multi-paragraph |

  Nobody reads a fifteen-line comment while working; they skim two lines and move on. If
  more is needed, write it in the feature doc and, when it matters, point at it in one
  line. Writing a long block into a source file is a defect, not thoroughness.
- Ids are int32: test `id == null`, never truthiness.
- Use the existing component classes (`.field-input`, `.btn-primary`, `.btn-ghost`,
  `.btn-danger`, `.fit-media`) rather than re-spelling Tailwind.
- Before adding a helper, check `src/services/` - most non-obvious logic already has a
  home there, and duplicated logic is this project's recurring failure mode.

## Commands

```bash
npm install
npm run dev       # :5173, proxies /v1 to BACKEND_ORIGIN (default http://localhost:5101)
npm run build     # vite build, then scripts/generate-localized-html.mjs
npm run preview
```

No linter, no tests. Verification is manual - see the end of
[docs/architecture.md](docs/architecture.md).
