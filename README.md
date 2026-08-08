# HaruyasumiRyokouki — Frontend

Timeline site for a three-month trip across Japan: per-day albums, full-text
search, calendar, map and an editor toolkit. Vue 3 + Vite + Tailwind, talking to
the ASP.NET Core backend described in `swagger.json`.

## Getting started

```bash
npm install
cp .env.example .env
npm run dev            # http://localhost:5173
```

`npm run dev` proxies `/v1` to `BACKEND_ORIGIN` (default `http://localhost:5101`),
so run the backend alongside it. Without the backend the pages still load; API
calls surface as an error state.

Scripts: `npm run dev`, `npm run build`, `npm run preview`.

`npm run build` runs Vite and then `scripts/generate-localized-html.mjs`, which
emits `dist/index.{ru,en,ja}.html` and a `dist/.htaccess` — see
[Localised link previews](#localised-link-previews).

## Configuration

All configuration is through `.env` (see `.env.example`):

| Variable | Purpose |
| --- | --- |
| `VITE_API_BASE_URL` | API base path, `/v1` in development |
| `BACKEND_ORIGIN` | Dev proxy target (not bundled) |
| `VITE_MAP_TILE_URL`, `VITE_MAP_ATTRIBUTION` | Map tiles; defaults to keyless CARTO Voyager |
| `VITE_AUTHOR_NAME`, `VITE_AUTHOR_GITHUB` | Footer links |

`VITE_*` values are baked into the bundle at build time; `BACKEND_ORIGIN` is read
only by `vite.config.js` and never shipped.

## Structure

- `src/api` — one `request()` wrapper plus a thin module per endpoint group.
- `src/services` — framework-free logic: media URL accessors, display
  reporting, media-type detection, search highlighting, dates, translations,
  sharing, document head.
- `src/composables` — reusable stateful bits (`useHorizontalSwipe`,
  `useTripMedia`).
- `src/stores` — Pinia: auth, days cache, search cache, editor selection, UI,
  theme, motion.
- `src/theme/themes.js` — the theme registry; see [Theming](#theming).
- `src/services/release.js` — the release names behind the footer's version; see
  [Versioning and releases](#versioning-and-releases).
- `src/components` — grouped by area (`layout`, `media`, `calendar`, `map`,
  `search`, `editor`, `common`).
- `src/views` — one per route. All are lazy; `prefetchViews()` from `src/router`
  warms the day and search chunks while the browser is idle, and `<Suspense>` in
  `App.vue` covers whatever is still cold.

## Notes on the API contract

A few expectations are documented at their call sites and worth knowing up front:

- **Language** travels as `Accept-Language: ru|en|ja` on every request; the
  response's `languageCode` drives the "showing the original" notice.
- **Display** travels as `X-Display: dpr=<ratio>; min-side=<css-px>` on every
  request (`services/display.js`). The server picks one `preview` and one
  `fullScreen` URL per file from it, so sizing policy lives on the backend and
  can change without a frontend release. Both numbers share a unit space:
  multiply them for real device pixels. Responses vary by the header — a cache in
  front of the API needs `Vary: Accept-Language, X-Display`, and a cross-origin
  API needs it in `Access-Control-Allow-Headers`.
- **Media URLs** come ready-made and are never built here: `imageUrls` carries
  `{ download, preview, fullScreen }`, `videoUrls` carries
  `{ download, stream, preview }`, and every file ships a `miniature` — a base64
  square used as an instant placeholder (`services/mediaAssets.js`).
- **Search** returns days; a day matched through media carries only the matching
  files, a day matched through its note alone carries none. Splitting into the
  Media/Notes tabs and highlighting are done on the client
  (`services/searchResults.js`, `services/highlight.js`).
- **Bulk media edit** sends one PATCH for the whole selection with a translation
  row keyed by `languageCode` (no per-row id).
- **Downloads** rely on the media host sending `Content-Disposition: attachment`
  — a browser ignores a link's `download` attribute across origins. With imgproxy
  that is `return_attachment`.

## Theming

Themes live in `src/theme/themes.js`. Copying a block there is the whole job: the
entry appears in the switcher, and the store writes its palette as inline
`--color-*` properties on `<html>`, which override the `@theme` defaults so every
Tailwind utility re-themes at once.

The lightbox is a dark room under every theme and takes only the accent from it.
Because a colour chosen to read on a light page is usually too dark for black,
an entry may set the optional `accent-on-dark` token to say what it should look
like there; without one the accent is lightened automatically.

Motion follows the OS "reduce motion" setting. Editors get a footer switch to opt
back in — the choice is stamped as `data-motion="always"` on `<html>`, which the
reduced-motion rules in `main.css` check for. Loading spinners are exempt either
way: a frozen spinner reads as a broken page.

## Localised link previews

Crawlers that build link previews (Telegram, WhatsApp, VK, Slack) do not run
JavaScript, so the card's language comes from static markup. The build writes one
`index.<locale>.html` per locale, and the generated `.htaccess` picks between
them by `?lang=` first and `Accept-Language` second. Shared links carry `?lang=`
(added in `services/share.js`); on arrival the app applies that language, saves
it only if the visitor has none of their own, and strips the parameter from the
address bar.

Deploying means copying the whole `dist/` — including the dotfile — and serving
it from Apache with `mod_rewrite` and `AllowOverride` enabled. On another server
the same rules transfer; only their syntax changes.

## Versioning and releases

The number lives in `package.json` and reaches the bundle as a build-time
constant, so `npm version` is the whole act of releasing: it bumps the number,
commits and tags. `src/services/release.js` turns that number into what the
footer says, and `CHANGELOG.md` is the long form of the same list.

Only feature releases carry a name, and the name is looked up by major and minor
alone — a fix belongs to the release it follows, so patches inherit it and need
no entry anywhere. Major zero means the site is still finding its shape; the
`pre-release` label is derived from it rather than written down, and a later
generation can name itself in the `STAGES` table.

Hovering the version shows when the bundle was built, in the reader's own zone —
a version alone cannot say whether what is deployed is what was last built.

**A fix.** Nothing but `npm version patch`, then build and deploy.

**A feature.** Order matters, so that the tag lands on a commit that already has
everything:

1. Add the name to `NAMES` in `src/services/release.js`, keyed `major.minor`.
2. Add a section at the top of `CHANGELOG.md`.
3. Commit those.
4. `npm version minor` — its own commit and tag.
5. Build and deploy.

**A rework.** The same, plus a line in `STAGES` if the new generation should say
what it is, and `npm version major`.

`npm version` insists on a clean working tree and makes the commit and tag
itself; `--no-git-tag-version` bumps without one.

## Verification

There are no automated tests. Checks are manual, and the flows worth walking
after touching the viewer or the grid are the awkward ones: pinch and double-tap
zoom, swiping between files and pulling down to dismiss, long-press to enter
selection and then swiping across tiles to extend it, and the same on a real
phone rather than in a device emulator — the two behave differently precisely
where these gestures live.
