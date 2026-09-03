# HaruyasumiRyokouki - Frontend

Timeline site for a three-month trip across Japan: per-day albums, full-text search, a
calendar, a map and an editor toolkit. Vue 3 + Vite + Tailwind, talking to the ASP.NET Core
backend described in `swagger.json`.

## Getting started

```bash
npm install
cp .env.example .env
npm run dev            # http://localhost:5173
```

`npm run dev` proxies `/v1` to `BACKEND_ORIGIN` (default `http://localhost:5101`), so run
the backend alongside it. Without the backend the pages still load; API calls surface as an
error state.

| Script | Does |
| --- | --- |
| `npm run dev` | Dev server on :5173 with the API proxy. |
| `npm run build` | Vite build, then `scripts/generate-localized-html.mjs`. |
| `npm run preview` | Serve the built output. |

There is no linter and no test suite - verification is manual. See
[docs/features/build-and-release.md](docs/features/build-and-release.md).

## Configuration

All configuration is through `.env` (see `.env.example`).

| Variable | Purpose |
| --- | --- |
| `VITE_API_BASE_URL` | API base path, `/v1` in development |
| `BACKEND_ORIGIN` | Dev proxy target (never bundled) |
| `VITE_BASE_MAP_FROM` / `_TO` | Default map range |
| `VITE_MAP_TILE_URL`, `VITE_MAP_ATTRIBUTION` | Map tiles; defaults to keyless CARTO Voyager |
| `VITE_AUTHOR_NAME`, `VITE_AUTHOR_GITHUB` | Footer links |

`VITE_*` values are baked into the bundle at build time.

## What it does

**Days.** The trip is roughly ninety dated days, each an album of photographs and videos
with a note written in three languages. Arrow keys and touch swipes step between
neighbouring days; a calendar ribbon spans every month of the trip.

**Three languages.** Russian, English and Japanese throughout - interface, day notes, media
titles and descriptions, and tag captions. The language rides on every request, so the
server answers in it and says when it had to fall back to another. A shared link carries the
sender's language, and the build emits a static page per locale so link-preview crawlers
(which do not run JavaScript) get a card in the right one.

**Three-stage media loading.** Every file ships a tiny inline miniature that paints in the
first frame with no request at all; the preview settles over it once whole, and in the
viewer the full-size image settles over that. Each stage is skipped when the browser
already holds the next, so a picture already seen never goes soft on the way back to it.
The server chooses which rendition to send from a header describing the screen, so sizing
policy lives on the backend. Every file also offers a download.

**A viewer built for a hand.** Pinch and double-tap zoom, swipe to page, pull in either
direction to dismiss, and the picture flies out of the tile that was tapped and back into
it. The two floating bars are measured, not assumed, so the picture is fitted around
whatever they currently say.

**Search.** Free text over titles, descriptions, day notes and tag captions *and* aliases -
so "noodles" finds photographs captioned "ramen". Matches are highlighted client-side,
diacritics folded, results split into media and notes.

**Tags.** A tag is an entity with one caption per language and any number of hidden
aliases. Coining one is deliberately two steps: a language model proposes captions, a slug
and aliases, and shows the existing tags that look like near-duplicates before anything
reaches the database.

**Filing by resemblance.** The server fingerprints each photograph, so the editor can ask
"what else looks like this" from inside the edit dialog, or "what else belongs with this
tag" across the whole archive. Never thresholded - the list comes back sorted and a person
decides where it stopped being useful.

**Maps.** The whole trip over a date range, or one day's path in the order the photographs
were taken. Placing a photograph shows the last point before it and the first point after,
so it can be dropped into the gap by eye.

**Themes and motion.** Light, dark, black and follow-the-system, defined in one file. The
system's reduce-motion setting is honoured by default, with an opt-back-in for editors.

**Deep links.** A link can point at one photograph inside a day or a set of results, and
optionally open it full screen. Unresolvable links degrade to the plain page.

**Editing.** Signed in, the same pages become the editing surface: press-and-drag selection
across tiles, a bulk editor that only writes what was actually changed, optional machine
translation to review before saving, local drafts of day notes, and a queue of everything
still waiting to be filed.

## Where things live

| Directory | Contents |
| --- | --- |
| `src/api/` | One `request()` wrapper plus a thin module per endpoint group |
| `src/services/` | Framework-free logic - most of the non-obvious code |
| `src/composables/` | Reusable stateful bits |
| `src/stores/` | Pinia: auth, days, search, tags, editor, ui, theme, motion |
| `src/components/` | Grouped by area: `layout`, `media`, `calendar`, `map`, `search`, `editor`, `common` |
| `src/views/` | One per route, all lazy |
| `src/theme/themes.js` | The theme registry |
| `src/i18n/locales/` | All UI copy |

### Finding a feature

| Feature | Start here | Documentation |
| --- | --- | --- |
| Overall layering, request pipeline, model shapes | `src/api/client.js` | [architecture.md](docs/architecture.md) |
| API contract, endpoints, media URLs | `src/api/` | [api-layer.md](docs/features/api-layer.md) |
| Sign-in, editor gating | `src/stores/auth.js` | [auth-and-editor-access.md](docs/features/auth-and-editor-access.md) |
| Day pages, timeline, calendar, dates | `src/views/DayView.vue` | [days-and-calendar.md](docs/features/days-and-calendar.md) |
| Front page, favourites, drifting wall | `src/views/HomeView.vue` | [home-and-favorites.md](docs/features/home-and-favorites.md) |
| Thumbnail grid, tiles, selection gesture | `src/components/media/MediaGrid.vue` | [media-grid-and-selection.md](docs/features/media-grid-and-selection.md) |
| Full-screen viewer, gestures, hero flight | `src/components/media/MediaLightbox.vue` | [media-viewer.md](docs/features/media-viewer.md) |
| Search, highlighting, tag suggestions | `src/views/SearchView.vue` | [search.md](docs/features/search.md) |
| Tags, dictionary, coining | `src/services/tags.js` | [tags.md](docs/features/tags.md) |
| Similarity, tag collecting | `src/services/similarity.js` | [similarity.md](docs/features/similarity.md) |
| Maps, pins, coordinate picker | `src/services/leaflet.js` | [maps.md](docs/features/maps.md) |
| Media editing, bulk saves, translation | `src/components/editor/MediaEditDialog.vue` | [media-editor.md](docs/features/media-editor.md) |
| Day notes, drafts, pending queue | `src/components/editor/DayEditForm.vue` | [day-editor-and-pending.md](docs/features/day-editor-and-pending.md) |
| Links, sharing, localised previews | `src/composables/useMediaLink.js` | [sharing-and-links.md](docs/features/sharing-and-links.md) |
| Locales, themes, motion, CSS conventions | `src/theme/themes.js` | [i18n-and-theming.md](docs/features/i18n-and-theming.md) |
| Overlays, dialogs, toasts, scrollbar | `src/services/overlayStack.js` | [ui-shell.md](docs/features/ui-shell.md) |
| Build, releases, deploy | `vite.config.js` | [build-and-release.md](docs/features/build-and-release.md) |

## Documentation

Technical detail lives in [docs/](docs/), one file per feature, written for both people and
coding agents. Each feature doc names its files up front and ends with an **Invariants**
section - rules that look like bugs and are not.

- [docs/architecture.md](docs/architecture.md) - read before changing anything.
- [docs/issues.md](docs/issues.md) - known problems, duplication and drift, ranked.
- [CLAUDE.md](CLAUDE.md) - the entry point for coding agents.

## Deploying

`npm run build` writes `dist/`, including `index.{ru,en,ja}.html`, per-locale manifests and
an `.htaccess`. Copy the **whole** directory, dotfile included, to Apache with `mod_rewrite`
and `AllowOverride` enabled.

Releasing is `npm version` plus a name in `src/services/release.js` and a `CHANGELOG.md`
section - the full sequence is in
[build-and-release.md](docs/features/build-and-release.md).
