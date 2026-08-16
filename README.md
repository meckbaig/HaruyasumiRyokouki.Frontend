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
- `src/stores` — Pinia: auth, days cache, search cache, tag dictionary, editor
  selection, UI, theme, motion.
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
- **Favourites** are the files shown on the front page. `favorite` rides on both
  media models but is `null` for anyone not signed in, so the star on a tile is
  editor-only; marking one is a PATCH carrying nothing but `favorite`, and the
  new value is written back onto the cached object rather than refetched
  (`services/favorites.js`). `GET /v1/media/favorites` returns them shuffled and
  capped by the backend, with no day around them — each one's day comes from its
  own `created` timestamp.
- **Search** takes `text=` or `tag=` (a slug), never both and never neither. It
  returns days; a day matched through media carries only the matching files, a
  day matched through its note alone carries none. Splitting into the Media/Notes
  tabs and highlighting are done on the client (`services/searchResults.js`,
  `services/highlight.js`); a tag search highlights nothing and has no notes tab,
  because no words were typed.
- **Tags** are named by their slug everywhere outside the editor — see
  [Tags](#tags). Both media models carry `TagPublicDto { slug, value }`; the
  numeric id lives only in `TagDto`, and only `changes.tagIds` ever wants it.
- **Bulk media edit** sends one PATCH for the whole selection with a translation
  row keyed by `languageCode` (no per-row id).
- **Private files** carry `private: true` and are visible to an editor alone
  (`services/privacy.js`). They wear a red mark on the tile and in the viewer,
  and the share button is taken away from both — a link to one would send the
  recipient to a day that, as far as they are concerned, does not contain it.
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

## Linking to one file

A day and a search result are lists, so a link to either says nothing about which
picture was being looked at. Two query parameters do, and they are handled the
same way on both pages (`composables/useMediaLink.js`):

| Parameter | Meaning |
|---|---|
| `i=<media id>` | single that file out, outlined among the rest |
| `o=1` | and open it full screen straight away |

`o` never travels alone. The page resolves `i` against what it actually holds —
against a day's files, or against a search's *matched* files, not the remainders
a reader can unfold — and anything it cannot resolve is dropped from the address
bar, leaving the page to open as if nothing had been asked for.

Writing runs the other way: opening, paging or closing the viewer replaces the
pair, so the share button always copies a link to the picture on screen. Closing
keeps `i` and drops `o` — the reader is back at the list, looking at the file they
just left. The viewer's "open day" button carries `i` alone for the same reason.

The front page is deliberately outside this: its wall is shuffled and capped by
the backend, so an `i` pointing into it would mean nothing on the next visit.

## Tags

A tag is an entity with an id. Its words hang off it: one **caption** per
language, which is what a reader sees, and any number of **aliases**, which are
searched and never rendered. Somebody looking for "noodles" finds photographs
captioned "ramen" and never learns that "noodles" was written down anywhere.

Links are built on the slug (`/search?tag=ramen`), never on the caption: a
caption gets rewritten, and it differs per locale, so a link carrying it would
break on the first rename and would send a Japanese reader to a search for a
Russian word. `/search` therefore takes `text=` or `tag=`, never both; a tag
search highlights nothing and has no notes tab, because no words were typed.

The slug is the tag's public name and the only one the media models carry. The
numeric id exists in `TagDto` alone and is wanted at exactly one moment — a save
sends `changes.tagIds` — so `MediaEditDialog` holds slugs and resolves them
through the dictionary as it builds the request. A slug it cannot resolve aborts
the save with a message rather than being skipped: the save *replaces* the set,
so a quietly dropped slug would not be a tag left alone but a tag taken off.

The dictionary (`GET /v1/tags`) is fetched once per editor session into
`stores/tags.js` and updated in place from what a save returns. It is behind the
login, so anything a visitor sees has to name its tags from the response they
already have — the search store reads a tag's caption out of the results it
fetched rather than looking it up. The suggestion endpoint the search bar uses is
the one public tag call.

**Coining a tag is two steps**, and that is deliberate.
`POST /v1/tags/completion` saves nothing: it proposes three captions, a slug and
some aliases, and returns the existing tags that look like near-duplicates. The
proposal comes from a language model and has to be read before it reaches the
database — Japanese is where it slips most, aliases second. The near-duplicate
block is the guard against coining "torii" beside an existing "torii gate", and
carries each candidate's usage count, which is usually what settles it.

### Filing by resemblance

The server keeps a fingerprint of each photograph's content and can compare
across the whole archive. Two screens use it, and both exist because tagging one
photograph is rarely tagging one photograph — the same subject was shot five
times in a row, and again from the other side of the square a week later.

- The **media editor** shows what a file resembles (`GET /media/{id}/similar`)
  and can hand that file's tags to the ones ticked.
- **`/admin/tags/collect`** does the reverse: given what already carries a tag,
  it proposes the rest of the archive (`GET /tags/{id}/suggest`). Under three
  photographs the server declines to guess and says so through `seedCount`,
  which is an expected state and not an error. Applying re-asks, because every
  photograph just marked moves the centre the next answer is measured from.

Both apply through `POST /tags/{id}/media`, which **adds** a tag and leaves the
others alone — the opposite of the media PATCH below, and the reason it exists.
One tag per request, so several tags are several requests.

The score is never a threshold. How alike is alike enough depends on how narrow
the subject is, so the server always returns a full sorted list and the person
decides where it stopped being useful; `services/similarity.js` turns the cosine
into a percentage and a colour band so the drop can be seen rather than read.

**A save replaces a file's tags rather than adding to them.** For one file that
is what is meant. For a selection it is a trap, so `MediaEditDialog` starts the
field from the union of what the selection carries — a blank field would read as
"these have no tags" — but sends nothing until the list is actually changed.

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

1. `npm version minor --no-git-tag-version`
1. Add the name to `NAMES` in `src/services/release.js`, keyed `major.minor`.
1. Add a section at the top of `CHANGELOG.md`.
1. `git commit -m "Release 1.1.0 - release name"`
1. `git tag v1.1.0`
1. Build and deploy.

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

For tags, the flows that cross a boundary are the ones worth walking: coining one
from inside the media editor (it has to land on the file *and* in the dictionary),
a bulk edit saved without touching the tag field (every file must keep its own),
and a `?tag=` link opened **signed out**, where the heading has to name the tag
from the results because there is no dictionary to ask.
