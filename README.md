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

## Configuration

All configuration is through `.env` (see `.env.example`):

| Variable | Purpose |
| --- | --- |
| `VITE_API_BASE_URL` | API base path, `/v1` in development |
| `BACKEND_ORIGIN` | Dev proxy target (not bundled) |
| `VITE_MAP_TILE_URL`, `VITE_MAP_ATTRIBUTION` | Map tiles |
| `VITE_AUTHOR_NAME`, `VITE_AUTHOR_GITHUB` | Footer links |

## Structure

- `src/api` — one `request()` wrapper plus a thin module per endpoint group.
- `src/services` — framework-free logic: media URL accessors, media-type
  detection, search highlighting, dates, translations, sharing.
- `src/stores` — Pinia: auth, days cache, search cache, editor selection, UI.
- `src/components` — grouped by area (`layout`, `media`, `calendar`, `map`,
  `search`, `editor`, `common`).
- `src/views` — one per route.

## Notes on the API contract

A few expectations are documented at their call sites and worth knowing up front:

- **Language** travels as `Accept-Language: ru|en|ja` on every request; the
  response's `languageCode` drives the "showing the original" notice.
- **Search** returns days; a day matched through media carries only the matching
  files, a day matched through its note alone carries none. Splitting into the
  Media/Notes tabs and highlighting are done on the client
  (`services/searchResults.js`, `services/highlight.js`).
- **Editor login** sends credentials in the `Authorization` header, never the
  URL. `api/auth.js` keeps a temporary query-parameter fallback until the
  backend reads the header — remove it once that ships (`TODO(api-login-query)`).
- **Bulk media edit** sends one PATCH for the whole selection with a translation
  row keyed by `languageCode` (no per-row id).
