# Build, release and deploy

## Files

| File | Role |
| --- | --- |
| `vite.config.js` | Build constants, dev proxy, alias. |
| `scripts/generate-localized-html.mjs` | Post-build: per-locale HTML, manifests, `.htaccess`. |
| `src/services/release.js` | Turns the version into what the footer says. |
| `public/sw.js` | Service worker - deliberately minimal. |
| `public/manifest.webmanifest` | Base manifest the build specialises per locale. |
| `.env`, `.env.example`, `.env.production` | Configuration. |
| `CHANGELOG.md` | The long form of the release list. |

## Configuration

| Variable | Purpose |
| --- | --- |
| `VITE_API_BASE_URL` | API base path; `/v1` in development. |
| `BACKEND_ORIGIN` | Dev proxy target. **Read only by `vite.config.js`, never bundled.** |
| `VITE_BASE_MAP_FROM` / `_TO` | Default map range. |
| `VITE_MAP_TILE_URL` / `VITE_MAP_ATTRIBUTION` | Tiles; defaults to keyless CARTO Voyager. |
| `VITE_AUTHOR_NAME` / `VITE_AUTHOR_GITHUB` | Footer links. |

Only `VITE_*` reaches the bundle, and it is **baked in at build time** - changing one means
rebuilding.

The dev server proxies `/v1` to `BACKEND_ORIGIN` so development is not blocked by CORS or a
Basic-auth preflight. Without the backend the pages still load; API calls surface as an
error state.

## Build constants

`vite.config.js` defines two globals:

| Constant | Value |
| --- | --- |
| `__APP_VERSION__` | `package.json` version |
| `__APP_BUILD__` | ISO timestamp of the build |

The version comes from `package.json` rather than a variable of its own, so `npm version`
remains the single act that releases. The build stamp answers what a version alone cannot -
whether what is deployed is what was last built. The footer shows it on hover, in the
reader's own zone.

## Post-build

`npm run build` = `vite build` then `node scripts/generate-localized-html.mjs`, which:

1. Reads `dist/index.html` and swaps the block between `<!-- seo:start -->` and
   `<!-- seo:end -->` plus `<html lang>` per locale → `dist/index.{ru,en,ja}.html`.
   `dist/index.html` is overwritten with the default locale as the no-match fallback.
2. Renders `dist/manifest.{ru,en,ja}.webmanifest` from the base manifest - the format has no
   way to name an app three times.
3. Writes `dist/.htaccess`.

It **throws** if the SEO markers are missing, so a changed `index.html` template fails the
build rather than silently shipping one language.

Copy comes from the locale JSON, the same source the runtime head uses.

### The `.htaccess`

Picks a file by `?lang=` first, `Accept-Language` second, default third. Two details:

- The `-f` test has **no `-d`**, deliberately, so a bare `/` is not short-circuited to the
  default index and still honours `?lang=`.
- Rewriting to `/index.<lang>.html` is safe from looping because that file matches `-f` on
  re-entry and is served.

## Deploy

Copy the **whole** `dist/`, dotfile included, to Apache with `mod_rewrite` and
`AllowOverride` enabled. On another server the rules transfer; only the syntax changes.

## The service worker

`public/sw.js` is the smallest one that works. A browser only offers to install a site that
has a worker with a fetch handler, and that is the entire reason it exists - **it caches
nothing**.

That restraint is on purpose. A caching worker decides for itself when a visitor sees a new
deployment, and getting it wrong means serving a stale site to someone who cannot tell why -
a worse problem than offline support solves for a site whose content is photographs it must
fetch anyway. `skipWaiting` + `clients.claim` keep the worker itself from ever being the
stale part.

Registered in production only; in development the dev server owns the requests.

**Add caching deliberately, if ever - not as a side effect of wanting an installable icon.**

## Releasing

The number in `package.json` is the whole mechanism.

**A fix.** `npm version patch`, then build and deploy. Patches inherit the name of the
release they follow and get no section of their own - but a patch that carries a change a
visitor would notice is folded into the changelog of the minor release it follows, as a
bullet under that release's section. A patch that only fixes or nudges something invisible
stays out of the changelog entirely. The changelog is the record of what a visitor sees
change, not of every commit; a significant change buried in a patch would otherwise be
lost between the minor release that preceded it and the one that follows.

**A feature.** Two commits, and in this order - the work first, then the release that names
it - so the tag lands on a commit that already has everything:

1. Commit the work itself: a summary line, a blank line, then one bullet per change.
2. `npm version minor --no-git-tag-version`
3. Add the name to `NAMES` in `src/services/release.js`, keyed `major.minor`
4. Add a section at the top of `CHANGELOG.md`
5. `git commit -m "Release 1.3.0 - release name"`
6. `git tag v1.3.0`
7. Build and deploy

The release commit carries **only** the version bump, the name and the changelog. Mixing a
change into it leaves the history unable to say what the release was named for, and the tag
pointing at a commit whose diff is mostly the feature it follows. `npm version` (without
`--no-git-tag-version`) insists on a clean tree and wants to make both commits at once, which
is why the work is committed before it is run.

**A rework.** The same, plus a line in `STAGES` if the new generation should say what it is,
and `npm version major`.

`npm version` insists on a clean tree and makes the commit and tag itself;
`--no-git-tag-version` bumps without one.

### How the footer reads it

`services/release.js` looks the name up by **major and minor alone** - the third segment is
for fixes. `STAGES` is keyed by major; `0` is `pre-release`, derived rather than written
down. The label reads `1.2.0 · faster filing`, or `0.8.1 · pre-release: zoom-based framing`.

## Verification

**No test suite, no linter.** Checks are manual. After touching the viewer or the grid, walk
the awkward flows on a **real phone** - pinch and double-tap zoom, swiping between files,
pulling down to dismiss, long-press into selection then swiping across tiles - the emulator
and a device behave differently precisely where these gestures live.

For tags, walk the flows that cross a boundary: coining one from inside the media editor
(it must land on the file *and* in the dictionary), a bulk edit saved without touching the
tag field (every file keeps its own), and a `?tag=` link opened **signed out**, where the
heading has to name the tag from the results because there is no dictionary to ask.

## Invariants

1. `BACKEND_ORIGIN` never reaches the bundle.
2. The SEO markers in `index.html` must survive any template edit.
3. `dist/.htaccess` ships with the rest of `dist/`.
4. The service worker caches nothing.
5. Release names are keyed `major.minor`; patches inherit.
6. The tag goes on the commit that already carries the name and the changelog.
7. A patch change a visitor would notice is folded into the changelog of the minor
   release it follows, not left to the git history.
8. The work is committed **before** the release commit; the release commit adds only the
   version, the name and the changelog.

## Related

- Why per-locale HTML exists: [sharing-and-links.md](sharing-and-links.md).
- Where the copy comes from: [i18n-and-theming.md](i18n-and-theming.md).
