# Sharing and links

Copying a link to what is on screen, pointing a link at one file inside a list, carrying
the sender's language along, and giving preview crawlers a card in that language.

## Files

| File | Role |
| --- | --- |
| `src/services/share.js` | Builds and copies URLs. |
| `src/composables/useMediaLink.js` | The `?i=` / `?o=` pair: read, write, resolve, dismiss. |
| `src/services/scrollToMedia.js` | `scrollTargetFor` and `scrollToMedia`: where a singled-out block lands. |
| `src/components/common/ShareButton.vue` | Page-level share button. |
| `src/services/head.js` | Runtime title/OG/manifest for browsers and JS-running crawlers. |
| `src/i18n/index.js` | Reads and strips `?lang=`. |
| `scripts/generate-localized-html.mjs` | Per-locale `index.html` and `.htaccess` for crawlers. |

## Sharing the page

Everything shareable already lives in the address bar - the day, the query, the active
tab, the map range - so sharing is "copy the current URL" plus `?lang=<current locale>`.

| Function | Copies |
| --- | --- |
| `copyCurrentUrl()` | The address as it stands. |
| `copyHomeUrl()` | The site root. Used by the footer. |
| `copyMediaUrl(ids, { open, path })` | The address with `?i=` (and `?o=1`) written into it. One id, or a whole selection. |

`copyToClipboard` falls back to a hidden `<textarea>` plus `execCommand('copy')` - the
async clipboard API is unavailable on non-secure origins.

## Deep links to one file

A day and a search result are lists, so a link to either says nothing about which picture
was being looked at. Two parameters do:

| Parameter | Meaning |
| --- | --- |
| `i=<media id>` | Single this file out, outlined among the rest. |
| `i=<id,id,...>` | A note reference may name several files at once; the address carries **every** id, comma-separated, and the whole block is outlined. |
| `o=1` | And open the first file full screen at once. |

`o` never travels alone - it is only ever written beside `i`.

**Resolution is against what the page actually holds.** A day resolves against its files;
a search resolves against its *matched* files, not the remainders a reader can unfold.
Anything unresolvable is dropped from the address bar and the page opens as if nothing had
been asked for - a file may have moved to another day, or the search may no longer match it.

**Writing runs the other way.** Opening, paging or closing the viewer replaces the pair,
so the share button always copies a link to the picture on screen. Closing keeps `i` and
drops `o`: the reader is back at the list, looking at the file they just left. The
viewer's "open day" button carries `i` alone for the same reason.

**The front page is deliberately outside this.** Its wall is shuffled and capped by the
backend, so an `i` into it would mean nothing on the next visit. `copyMediaUrl` therefore
takes a `path` override, and the viewer passes the file's own day when
`route.name` is neither `day` nor `search`.

**Private files have no share button at all.** A link to one would send the recipient to a
day that, as far as they are concerned, does not contain it. The button is removed rather
than disabled - an offer that is not there cannot be taken up by mistake.

**The grid's context menu shares the selection.** A right-click on a tile that is part of
one writes **every** selected id into the link; on a tile outside it, just that tile.
Private files are dropped from the selection, and when nothing is left the menu says why
rather than offering a link that would single out nothing.

### API of `useMediaLink`

| Export | Purpose |
| --- | --- |
| `readMediaLink(query)` | `{ ids, id, open }`. `id` is the first id, null unless the value is an integer. |
| `withMediaLink(query, ids, open)` | The same query with the pair set, or removed when there are no ids. |
| `pageIdentity(route)` | The address **with the pair removed** and the rest sorted. |
| `useMediaLink({ suspended })` | `{ link, write, clear }` for the current route. |

`pageIdentity` exists because writing `i` changes the address, and anything watching the
address for a page change reads that as the reader being taken somewhere else. That is how
opening a file came to close the viewer in the same instant. Anything that wants "did the
reader actually move?" must compare `pageIdentity`, never `route.fullPath`.

`write()` replaces rather than pushes: paging through a day would otherwise bury the
arrival page under one history entry per picture. It also skips writes that would not
change anything, because vue-router treats navigating to the same place as a reportable
error.

The outline is dismissed by a **tap** that is not about it, with these carve-outs:

- Clicks on `a[href]` are left alone - a navigation is starting, and replacing the address
  underneath it cancels it.
- `suspended()` holds dismissal off while the viewer is open; the outline is behind it,
  and the click that opened it must not take it away.
- A press only dismisses when it does not travel (`TAP_SLOP`, 10px). A vertical swipe is
  how a phone scrolls a wall of tiles, and answering it took the outline away from a reader
  who was only scrolling towards the block.
- It answers on **`pointerup`, and only for a press it saw begin**, rather than on `click`.
  A click is dispatched when a press that began earlier is released, so a page arriving
  *by* a click can be handed the tail of a gesture never aimed at it.

`scrollToMedia(ids)` waits two ticks - one for the grid to render the ids it was just given,
one for it to reveal further chunks to reach a file far down a long day - then finds the
tiles by `[data-media-id]` and places the block:

| Block | Lands |
| --- | --- |
| Fits the window | Centred, so it reads as a group among its neighbours. |
| Taller than the window | Its **first record at the top**, under the page chrome and one grid gap below it. Centring a block too tall to take in at once pushed the first record - the one the reader was sent to - off the top; pinned flush, that record read as glued to the header. |

`scrollTargetFor(elements)` is that sum on its own, exported so the day page can work out
where a follow will land before deciding whether it counts as a departure. `window.scrollTo`
is called **without** `behavior`, so `html`'s own `scroll-behavior` decides the glide - which
is what still lets reduced motion turn it off. Scrolling on load is normally worth avoiding;
here it is the entire point of the link.

## Language on a shared link

`?lang=<locale>` is appended to every copied URL. On arrival, `src/i18n/index.js`:

1. Uses it as the initial locale (it wins over the stored preference and the browser's).
2. Persists it **only if the visitor has no choice of their own** - a returning visitor
   sees the shared language this visit and keeps their own for next time.
3. Removes it from the address with `history.replaceState`.

All three happen **at module evaluation time**, before the router exists. This ordering is
load-bearing. Removing the parameter later with `router.replace` looked like a navigation
to any open viewer, which closed itself - so a link to an open picture opened the day and
nothing more. It reproduced only on a cold cache (the day's data outrunning the page code)
and only when a language had been shared, which is why it looked arbitrary.

## Link previews

Preview crawlers (Telegram, WhatsApp, VK, Slack, Facebook) do **not** run JavaScript, so
`services/head.js` never reaches them. The build solves it statically:

- `scripts/generate-localized-html.mjs` reads `dist/index.html`, swaps the block between
  `<!-- seo:start -->` and `<!-- seo:end -->` and the `<html lang>`, and writes
  `dist/index.{ru,en,ja}.html`. `dist/index.html` is overwritten with the default locale
  as the no-match fallback.
- It also writes `dist/manifest.{locale}.webmanifest`, because the manifest format cannot
  name an app three times. The runtime swaps the `<link rel="manifest">` too, for a reader
  who changes language and only then installs. Neither can rename an app already on a
  home screen.
- The generated `dist/.htaccess` picks a file by `?lang=` first, `Accept-Language` second,
  default third. Its `-f` test deliberately has **no `-d`**, so a bare `/` is not
  short-circuited to the default index and still honours `?lang=`.
- Copy comes from the locale JSON (`app.title`, `app.subtitle`, `seo.description`) - the
  same source the runtime head uses.

Deploying means copying the whole `dist/`, dotfile included, to Apache with `mod_rewrite`
and `AllowOverride`. On another server the rules transfer; only the syntax changes.

## Invariants

1. `?lang=` is consumed in `src/i18n/index.js` at import time via `history.replaceState`.
   Never move it into a router hook or a component.
2. Anything watching for "the reader moved" compares `pageIdentity(route)`.
3. Dismissal answers a tap that did not travel, on `pointerup`; a swipe leaves the outline.
4. `i` may name several ids; `o=1` opens the first of them, and the rest are only outlined.
5. The front page never writes `?i=`.
6. A private file is never shareable, and is left out of a shared selection.

## Related

- The viewer that reads and writes the pair: [media-viewer.md](media-viewer.md).
- Locale detection and plural rules: [i18n-and-theming.md](i18n-and-theming.md).
