# API layer and contract

One `request()` wrapper, one thin module per endpoint group, and the full endpoint list
checked against `swagger.json`.

## Files

| File | Role |
| --- | --- |
| `src/api/client.js` | `request()`, `ApiError`, URL building, ProblemDetails parsing. |
| `src/api/authState.js` | Holds the Basic header outside Pinia; `encodeBasic`. |
| `src/api/auth.js` | Credential verification. |
| `src/api/days.js`, `media.js`, `search.js`, `tags.js`, `admin.js` | One module per group. |
| `src/services/display.js` | Builds the `X-Display` header value. |
| `swagger.json` | The contract. The only permitted source of truth about the backend. |

## `request(path, options)`

| Option | Effect |
| --- | --- |
| `method` | Defaults to `GET`. |
| `query` | Empty/null/undefined values are dropped. Arrays expand to repeated params (`ids=1&ids=2`) - how ASP.NET binds an array. |
| `body` | JSON-serialised; sets `Content-Type`. |
| `requiresAuth` | Marks an editor-only call. **Only these bounce a 401 to `/login`.** |
| `authHeader` | Overrides stored credentials, used while verifying a login not yet saved. |
| `signal` | `AbortSignal`. `AbortError` is rethrown untouched, never wrapped. |

Returns parsed JSON, or `null` for 204 and empty bodies.

### Headers sent on every call

| Header | Value | Why it matters |
| --- | --- | --- |
| `Accept-Language` | `ru` / `en` / `ja` | Server flattens translated entities to it and echoes `languageCode`, which drives the "showing the original" notice. |
| `X-Display` | `dpr=1.375; min-side=1470` | Server picks one `preview` and one `fullScreen` URL per file from it. |
| `Authorization` | `Basic …` | Present whenever a session exists, public call or not. |

`X-Display` carries two numbers in the same unit space - multiply for real device pixels.
`dpr` is rounded to three decimals: enough to keep the product accurate, few enough that
near-identical clients do not each mint a cache entry. `min-side` is the **shorter side of
the viewport** in CSS pixels, measured from `innerWidth`/`innerHeight` rather than
`screen`, because `screen` divides out OS scaling but ignores page zoom while
`devicePixelRatio` includes both - the two cannot be combined. Bucketing stays server-side
so sizing policy changes without a frontend release.

**Both headers make responses vary.** A cache in front of the API needs
`Vary: Accept-Language, X-Display`; a cross-origin API needs both in
`Access-Control-Allow-Headers`.

### `ApiError`

| Property | Meaning |
| --- | --- |
| `status` | HTTP status, or **`0` when the request never reached the server** (offline, DNS, backend down). |
| `title`, `detail`, `problem` | From an RFC 9457 ProblemDetails body; tolerates empty and non-JSON responses. |
| `isNetworkError` | `status === 0`. |
| `fallbackKey` | i18n key for a generic message when the server said nothing useful: `errors.network` / `unauthorized` / `forbidden` / `notFound` / `generic`. |

## Endpoints

All 21 paths in `swagger.json` are wired. `Auth` marks `requiresAuth: true`.

### Days - `src/api/days.js`

| Call | Endpoint | Auth | Returns |
| --- | --- | --- | --- |
| `fetchDays()` | `GET /days` | | `DayShortDto[]` - `{ date, isReady, mediaCount }` |
| `fetchDay(date)` | `GET /days/{date}` | | `DayDto` from `{ day }` |
| `fetchDayEdit(date)` | `GET /days/{date}/edit` | ✓ | `DayEditDto` from `{ day }` - every note translation with its row id |
| `saveDay(date, day, { autoTranslate })` | `PUT /days/{date}` | ✓ | `{ day: DayEditDto }` |

`isReady` is what takes a day out of the pending queue.

### Media - `src/api/media.js`

| Call | Endpoint | Auth | Notes |
| --- | --- | --- | --- |
| `fetchMediaEdit(ids)` | `GET /media/edit?ids=…` | ✓ | Repeated int params. |
| `fetchMediaLocations(from, to)` | `GET /media/locations` | | Both dates required, inclusive ISO. Geotagged files only. |
| `fetchFavoriteMedia()` | `GET /media/favorites` | | Shuffled and capped **by the server**; nothing here sorts or trims. |
| `fetchSimilarMedia(id, take)` | `GET /media/{id}/similar` | ✓ | `{ media, score }[]`, most alike first. |
| `editMedia(ids, changes, { autoTranslate })` | `PATCH /media` | ✓ | One change set applied to every id. |
| `setFavorite(id, value)` | `PATCH /media` | ✓ | Single-field change set. |
| `setPrivate(id, value)` | `PATCH /media` | ✓ | Single-field change set. |
| `deleteMedia(id)` | `DELETE /media/{mediaId}` | ✓ | Irreversible - always confirm first. |
| `syncMedia()` | `PUT /media/sync` | ✓ | Rescans storage for new uploads. |

`EditMediaChanges` per `swagger.json`:
`{ latitude, longitude, isApproved, private, favorite, tagIds, translations }`.
Omitting a field is what tells the backend to leave it alone - which is why the star and
the privacy toggle are `editMedia` calls carrying exactly one key.

Two things about `changes` that bite:

- **`tagIds` replaces the file's tag set, it does not add to it.** To add a tag without
  disturbing the others, use `POST /tags/{id}/media`.
- **`translations` entries omit the row `id` deliberately.** In a bulk edit each file has
  its own translation row, so the backend matches on `languageCode`.

### Search - `src/api/search.js`

`GET /search` → `DayDto[]`. Takes `text=` **or** `tag=` (a slug), never both and never
neither - sending neither is a 400. A day matched through its media carries only the
matching files; a day matched through its note alone carries none.

### Tags - `src/api/tags.js`

| Call | Endpoint | Auth | Notes |
| --- | --- | --- | --- |
| `fetchTagSuggestions(text, take)` | `GET /tags/suggestion` | | **The only public tag call.** Matches captions and aliases across every language, answers in the requested one. |
| `fetchTags()` | `GET /tags` | ✓ | The whole dictionary as `TagDto[]`. |
| `completeTag(text)` | `POST /tags/completion` | ✓ | Saves nothing. Proposes captions/slug/aliases and returns near-duplicates. |
| `createTag(tag)` | `POST /tags` | ✓ | |
| `editTag(id, tag)` | `PATCH /tags/{id}` | ✓ | Every body field optional. |
| `fetchTagCandidates(tagId, take)` | `GET /tags/{id}/suggest` | ✓ | `{ seedCount, items }`. |
| `addTagToMedia(tagId, ids)` | `POST /tags/{id}/media` | ✓ | **Adds**, leaving other tags alone. One tag per request. |

### Admin - `src/api/admin.js` and `auth.js`

| Call | Endpoint | Auth | Notes |
| --- | --- | --- | --- |
| `fetchPending()` | `GET /admin/pending` | ✓ | `{ media: MediaFileEditDto[], days: DayEditDto[] }` - already full edit models, so the editor needs no follow-up fetch. |
| `verifyCredentials(login, password)` | `GET /admin/login` | header-only | `true` on 200, `false` on 401/403, rethrows anything else. |

Credentials travel in the `Authorization` header, never in the URL - a query string leaks
the password into server logs, browser history and `Referer`.

## Media URLs

**The frontend builds no storage URL and picks no rendition.** Every response carries
ready-made links, already chosen by the server for this client's display:

```
imageUrls { download, fullScreen, preview }
videoUrls { download, stream, preview }
```

Access them through `src/services/mediaAssets.js` - `previewSrc`, `fullScreenSrc`,
`streamSrc`, `downloadSrc`, `miniatureSrc`, `mediaAspect`, `mediaDate` - never by reaching
into the DTO. `fullScreenSrc` returns `''` for video; videos stream instead.

`miniature` is a tiny base64 image shipped inline with every file, used as an instant
placeholder. **It carries the file's original proportions** - cropping it to whatever
shape a view needs is the frontend's job, done in CSS. `aspectRatio` is measured
server-side, so layout is known before any byte of the picture arrives.

**Downloads depend on the media host sending `Content-Disposition: attachment`** - a
browser ignores a link's `download` attribute across origins. With imgproxy that is
`return_attachment`.

## Invariants

1. `requiresAuth` is off for public calls. An anonymous 401 must surface as an error
   state, not eject the visitor to `/login`.
2. `api/authState.js` stays outside Pinia. It exists to break a
   `client.js` → store → `client.js` import cycle.
3. Ids are int32. Test `id == null`, never truthiness - `0` is valid.
4. Changing the locale changes `Accept-Language`, so every cached entity is stale.
   Callers of `useUiStore.setLocale` must refetch.
5. Endpoint modules unwrap the envelope and nothing more. Reshaping belongs in
   `src/services/`.

## Related

- Two model shapes and the in-place write-back: [../architecture.md](../architecture.md).
- Tag id vs slug: [tags.md](tags.md).
