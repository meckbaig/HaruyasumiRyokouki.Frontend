# Architecture

Vue 3 (`<script setup>`, plain JS - **no TypeScript**) + Vite + Pinia + vue-router +
vue-i18n + Tailwind v4. `@/` aliases `src/`. The backend is a separate ASP.NET Core
project; `swagger.json` in this repo is the contract and the only permitted source of
truth about it.

## Layers

Imports run downward only. A violation is a bug, not a style preference.

```
views/ ── components/ ── composables/ ─┐
   └──────── stores/ ─────────────────┤
                 └──── api/ ──────────┤
                          └── services/   (framework-free)
```

| Directory | Rule |
| --- | --- |
| `src/api/` | One `request()` wrapper (`client.js`) plus one thin module per endpoint group. Modules unwrap the envelope (`data?.items ?? []`) and do nothing else. |
| `src/services/` | Pure logic. May import other services and `@/api`. **Must not import Vue components or stores.** |
| `src/composables/` | Reactive and lifecycle wrappers. |
| `src/stores/` | Pinia setup stores. Caches and cross-page state only. |
| `src/components/` | Grouped by area: `layout`, `media`, `calendar`, `map`, `search`, `editor`, `common`. |
| `src/views/` | One per route, all lazy. |

## The request pipeline

`src/api/client.js` is the single entry point. Every call automatically carries:

| Header | Source | Meaning |
| --- | --- | --- |
| `Accept-Language` | `currentLocale()` | The server flattens translated entities to this language and echoes `languageCode`. |
| `X-Display` | `services/display.js` | `dpr=<ratio>; min-side=<css-px>`. The server picks image renditions from it. |
| `Authorization` | `api/authState.js` | HTTP Basic, when an editor session exists. |

Consequences that are easy to get wrong:

- **Responses vary by `Accept-Language` and `X-Display`.** Any cache in front of the API
  needs `Vary: Accept-Language, X-Display`; a cross-origin API needs both in
  `Access-Control-Allow-Headers`.
- **Changing the locale invalidates every cached entity.** Stores key their caches by id
  or date alone, so callers of `useUiStore.setLocale` must refetch.
- `requiresAuth: true` marks an editor-only call. Only those bounce a 401 to `/login`
  (`installAuthRedirect` in `src/router/index.js`). Public pages must leave it off - an
  anonymous 401 there should surface as an error state, not eject the visitor.
- Errors are always `ApiError`. `status === 0` means the request never left the client.
  `error.fallbackKey` gives an i18n key when the server said nothing useful.
- Array query values expand to repeated params (`ids=1&ids=2`), which is how ASP.NET
  binds an array parameter.

`api/authState.js` exists only to hold the Basic header outside Pinia, breaking a
`client.js` → store → `client.js` import cycle. Do not fold it into the store.

## Two model shapes

The API returns different shapes for reading and for editing. This is the single most
common source of bugs in this codebase.

| | Read model (`DayDto`, `MediaFileDto`) | Edit model (`DayEditDto`, `MediaFileEditDto`) |
| --- | --- | --- |
| Text | Flattened to one language: `languageCode`, `title`, `description` / `note` sit on the object | `translations[]`, one row per language, each with its own row `id` |
| `private`, `favorite` | Nullable - `null` for anyone not signed in | Non-nullable |
| Source | Public GETs | `/days/{date}/edit`, `/media/edit`, `/admin/pending`, save responses |

Everything else is shared: both media models carry `id`, `created`, `fileName`,
`aspectRatio`, `type`, coordinates, `miniature`, `imageUrls`, `videoUrls`, `isApproved`
and `tags` as `TagPublicDto { slug, value }`. **Neither carries a numeric tag id** - that
exists only in `TagDto`, the dictionary shape, and is wanted at exactly one moment
(`changes.tagIds` on a save).

- `services/translations.js` → `pickTranslation(entity, locale)` reads either shape.
  Detect an edit model with `Array.isArray(entity.translations)`.
- `services/mediaEdits.js` projects a save response back onto the read model the page
  holds, **mutating it in place**. Every view shows the same cached object, so one write
  updates all of them. This is deliberate - do not replace it with a refetch.
- Ids are **int32**. Always test `id == null`, never truthiness: `0` is a valid id.

## State

| Store | Holds | Notes |
| --- | --- | --- |
| `auth` | Basic header, `isEditor` | `restore()` must run before the first navigation (`main.js`). "Remember me" writes to localStorage; otherwise the session is memory-only. |
| `days` | Day list plus a per-date detail cache | Dedupes in-flight requests, which is what lets the router prefetch a day while the view also asks for it. |
| `search` | Last query and its results | |
| `tags` | The tag dictionary | Editor-only: `GET /v1/tags` is behind auth, so anything a visitor sees must name tags from the response it already has. |
| `editor` | Selected ids and items, `lastSave`, `lastDelete` | The selection toolbar is mounted app-wide and cannot talk to the page below it; `lastSave`/`lastDelete` are the broadcast channel. Each is replaced whole so watchers fire even on a repeat. |
| `ui` | Locale, toasts, the one blocking `confirm()` | `confirm()` returns a promise; a second question resolves the first as refused. |
| `theme`, `motion` | Appearance preferences | `init()` runs before the first render. |

## Routing, head, transitions

- All views are lazy. `prefetchViews()` warms the day and search chunks while the browser
  is idle; `<Suspense>` in `App.vue` covers whatever is still cold.
- `beforeEach` starts a day's fetch as the navigation begins, so the request overlaps the
  page transition instead of starting after it.
- `navDirection` is `forward`/`back` only between two day routes, which are neighbours on
  a line. Everything else is `up`.
- `<RouterView>` is keyed by `route.path`, **not** the full address: the viewer writes
  `?i=` into the query, and a fuller key would tear the page down on every picture.
- `Suspense` must stay outside `Transition`. The reverse plays the departure and never
  resolves the arrival.
- `services/head.js` rewrites title, OG tags and the manifest link at runtime, which
  covers browsers and JS-running crawlers. Preview crawlers do not run JS - see
  [features/sharing-and-links.md](features/sharing-and-links.md).

## Styling

Tailwind v4 with tokens declared in `src/assets/main.css` `@theme` - that block holds the
light palette, which doubles as the pre-JS default.

- **Themes.** `src/theme/themes.js` is the whole registry. The store writes a theme's
  palette as inline `--color-*` properties on `<html>`, overriding the `@theme` defaults,
  so every utility re-themes at once. Adding a theme is copying one block. Keep the
  `light` entry in sync with `@theme`.
- **Reduced motion** is honoured by default; an editor can opt back in, which stamps
  `data-motion="always"` on `<html>`. Every reduced-motion rule is scoped
  `:root:not([data-motion='always'])`. Spinners are exempt - a frozen spinner reads as a
  broken page.
- **Reusable classes** live in `main.css` `@layer components`: `.field-input`,
  `.field-label`, `.field-hint`, `.btn-primary`, `.btn-ghost`, `.btn-danger`,
  `.fit-media`, `.cascade-item`. Use them instead of re-spelling Tailwind.
- Named transitions (`page-*`, `lightbox-*`, `modal-*`, `reveal*`, `soft-*`, `map-full-*`)
  are defined in `main.css` below the component layer.
- The native scrollbar is suppressed and `AppScrollbar` draws one over the page. A native
  bar occupies a layout lane that comes and goes, which shifted the whole page sideways
  whenever the viewer locked scrolling.

## Overlays

`services/overlayStack.js` decides which full-window overlay owns the keyboard. Dialogs
and the lightbox both listen on `document`, so **anything full-window must push a token
on open and pop it on close and on unmount**, and must gate its key handler on
`isTopmost(token)`. Body scroll is released only when `hasOverlay()` is false.

## Build, release, deploy

- `vite.config.js` defines `__APP_VERSION__` (from `package.json`) and `__APP_BUILD__`,
  and proxies `/v1` to `BACKEND_ORIGIN` in development.
- `npm run build` runs Vite and then `scripts/generate-localized-html.mjs`, which emits
  `dist/index.{ru,en,ja}.html`, `dist/manifest.{ru,en,ja}.webmanifest` and `dist/.htaccess`.
  Deploying means copying the **whole** `dist/`, dotfile included, to Apache with
  `mod_rewrite` and `AllowOverride` enabled.
- Releasing: the version in `package.json` is the mechanism. A fix is `npm version patch`.
  A feature is `npm version minor --no-git-tag-version`, then the release name into
  `NAMES` in `src/services/release.js` keyed `major.minor`, then a `CHANGELOG.md` section,
  then the commit, then the tag.
- `public/sw.js` caches nothing; it exists so the browser offers to install the site. It
  is registered in production only.

## Verification

There is **no test suite and no linter**. Checks are manual. The flows that break are the
gesture ones - pinch and double-tap zoom, swipe paging, pull-to-dismiss, long-press
selection - and they behave differently on a real phone than in a device emulator.
