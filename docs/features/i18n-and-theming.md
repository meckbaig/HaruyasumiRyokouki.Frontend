# Localisation, theming and motion

Three languages, a theme registry that is one file, and a motion preference that can
override the operating system.

## Files

| File | Role |
| --- | --- |
| `src/i18n/index.js` | Locale detection, plural rules, `?lang=`. |
| `src/i18n/locales/{ru,en,ja}.json` | All UI copy. |
| `src/services/translations.js` | Reading translated entities. |
| `src/theme/themes.js` | The theme registry - the whole job. |
| `src/stores/theme.js` | Applies a theme. |
| `src/stores/motion.js` | Reduced-motion preference. |
| `src/assets/main.css` | `@theme` tokens, component classes, transitions. |
| `src/components/layout/ThemeSwitcher.vue`, `LocaleSwitcher.vue` | The controls. |

## Locales

`ru` / `en` / `ja`, default `ru`. Detection order:

1. `?lang=` on the URL - a shared link opens in the sender's language.
2. `localStorage` (`haruyasumi.locale`).
3. `navigator.languages`, matched on the base tag.
4. Default.

Russian needs three plural forms, which vue-i18n does not know: `russianPluralRule` is
registered for it, and message order is `"1 день | 2 дня | 5 дней"`.

`?lang=` handling - read, persist-if-unset, strip with `history.replaceState` - happens at
**module evaluation time**, before the router exists. This ordering is load-bearing; see
[sharing-and-links.md](sharing-and-links.md) for the bug it fixes.

### Switching language invalidates content

`Accept-Language` rides on every request, so the server flattens translated entities to the
current locale. Stores key their caches by id or date alone.

**`useUiStore.setLocale` therefore obliges every open page to refetch**, and the day store
to `invalidate()`. The search store is exempt - locale is part of its cache key.

Pages that must react: `DayView`, `SearchView`, `MapView` all watch `ui.locale`. `App.vue`
re-applies the document head, because the router only sets it on navigation.

### Reading translated entities

`services/translations.js`:

| Function | Purpose |
| --- | --- |
| `pickTranslation(entity, locale)` | Works on **both** model shapes: `translations[]` if present, else the flat fields. Always returns a filled object, so callers never null-check. |
| `isFallbackLanguage(entity, locale)` | The server answered in another language - what the "showing the original" notice is based on. |

The flat read model's `languageCode` is what the server actually answered with, **not what
was asked for**. That distinction is the whole reason the media editor refuses to seed
itself from a read model - see [media-editor.md](media-editor.md).

## Themes

`src/theme/themes.js` is the single source of truth. **Adding a theme is copying one block
there**; it appears in the switcher and becomes selectable with no other file changed.

| Key | Meaning |
| --- | --- |
| `id` | Persisted to `localStorage`, stamped on `<html>` as `data-theme`. |
| `icon` | Glyph in the switcher. |
| `labels` | Display name per locale; falls back to `en`, then `id`. |
| `scheme` | `light` / `dark` - drives `color-scheme` for native controls and scrollbars. |
| `colors` | Token overrides. Keys match the `--color-*` tokens in `main.css` `@theme`. |

The store writes the palette as **inline custom properties on `<html>`**, which override the
stylesheet defaults, so every Tailwind `var(--color-*)` utility re-themes at once.

Tokens the previous theme set and this one does not are **removed**, not left standing -
some are optional, and a leftover would quietly apply the old theme's colour to the new one.

`--rest-dim` is the exception, and is **derived from `scheme` rather than listed per
theme**: the dim over the rest of a day behind search results, 0.8 under a light scheme and
0.6 under a dark one. See [search.md](search.md).

`system` is special: no palette, follows `prefers-color-scheme`, resolving to the `light` or
`dark` entry at runtime.

`main.css` `@theme` still lists the light palette - Tailwind needs it to generate the
`bg-paper` / `text-ink` utilities, and it is the pre-JS default. **Keep the `light` entry in
sync with it.**

The `<meta name="theme-color">` tag is updated to the theme's `paper`: installed as an app,
the browser paints its own surround in that colour, and a fixed one would frame a black
theme in cream.

### `accent-on-dark`

The lightbox is a dark room under every theme and takes only the accent from it. An accent
chosen to read on a light page is usually dark and warm; lifted onto black it goes muddy.
An entry may set `accent-on-dark` to say what it should look like there; without one the
accent is lightened automatically.

**`lightbox-chrome` is the palette without the room, and it is not one palette.** The album
over a map pin wears it, but its own footer stands on the card's **paper**, not on black:
`.map-card-actions` re-derives `--lb-accent`, `--lb-text`, `--lb-muted`, `--lb-hover` and
`--lb-bar` from the page's own ink and paper, so the buttons read in a light theme and a hover
never paints one out. The marks over a **picture** (`.map-card-close`, `.map-card-arrows`) keep
the dark-room values, where the disc and the blur are still the right answer. See
[maps.md](maps.md).

`--color-star` is deliberately **not** themed - a star reads as gold in every palette -
though a theme may still override it like any token.

### The header logo and the title

The Japanese title opens with the very character the logo draws - 春休み旅行記 against a
mark reading 春 - so the mark is read as the first character and the word carries on from
it. `AppHeader` decides that by **looking at the title, not at the locale**: a rewritten
Japanese name that no longer begins with the glyph simply stops being trimmed instead of
losing a character it needed. The `aria-label` carries the full title regardless.

The name itself drops out only between `sm` and `md` - where the search field has moved
into the bar but the bar is not yet wide enough for both.

### The theme switcher is a dropdown

Not a cycling button: with a "system" option the single button showed what looked like the
same theme twice, so the current choice was never clear. Icons and labels come straight
from the theme registry, so a new theme appears there with no edit to the component.

## Motion

Reduced motion is honoured by default. An editor can opt back in, which stamps
`data-motion="always"` on `<html>`; every reduced-motion rule in `main.css` is scoped
`:root:not([data-motion='always'])`.

Components that animate imperatively check it themselves - `motionReduced()` in the
lightbox reads the same attribute before deciding whether to run a keyframe.

**Spinners are exempt either way.** A frozen spinner reads as a broken page.

## Reusable classes

In `main.css` `@layer components`. Use them instead of re-spelling Tailwind:

`.field-label` · `.field-input` · `.field-hint` · `.btn-primary` · `.btn-ghost` ·
`.btn-danger` · `.fit-media` · `.cascade-item` · `.dim-tile` · `.icon-button`

`.icon-button` is the one size an icon button has anywhere - a round 2.5rem target - so the
same mark is reached the same way in the viewer's bars and in the album over a map pin. The
viewer's paging arrows are the exception: they carry their own larger disc, because they sit
on the picture rather than on a bar. A component that needs a larger mark still sets
`h-*`/`w-*` on the icon itself, which wins over the class.

Named transitions live below that layer: `page-{up,forward,back}`, `lightbox-*`, `modal-*`,
`reveal*`, `soft-*`, `map-full-*`.

## CSS rules in `main.css` that look arbitrary

Each of these was arrived at by something breaking. Do not simplify one without reading
the reason.

### Components

| Rule | Why |
| --- | --- |
| `html { scrollbar-width: none }` and `AppScrollbar` draws one over the page. | A native bar takes a lane out of the layout, and a lane that comes and goes moves the whole page sideways - which is what made the picture jump as the viewer opened and locked the page behind it. See [ui-shell.md](ui-shell.md). |
| `.hover-reveal` tests `@media (hover: none)`, **not** a screen width. | Controls offered on approach are invisible where nothing can approach. A width says nothing about the input; `hover: none` is the honest test, and where there is no pointer the controls are on show from the start. |
| `.hover-reveal-dim` is the same reveal at half strength. | A read-only wall's controls must arrive on approach like any other, but plainly not offered. See [media-grid-and-selection.md](media-grid-and-selection.md). |
| The button classes set `white-space: nowrap`. | Left to wrap, a two-word label breaks in the middle on a narrow screen and the button grows a second storey beside a one-word neighbour that did not. A row should wrap between its buttons, and every row here is already `flex-wrap`. |
| `.fit-media` sizes with **container query units**, not `object-contain`. | `object-contain` never scales a small file up on a shrink-wrapped element, and on a full-size element the box swallows the empty space around the picture - which has to stay part of the backdrop so a click there still closes the viewer. The frame declares the query basis and the media takes the largest width that fits both axes for `--ar`, so an under-sized file is enlarged like any other and the element still ends where the picture ends. |

### The lightbox

| Rule | Why |
| --- | --- |
| The viewer is a **dark room under every theme**, and only the accent travels across. | Photographs need one, and a pale surround competes with them. The accent is lifted towards white: a hue chosen for a light page does not carry on black - the default brick red and the purple theme are both far too dark unaltered. |
| `lightbox-chrome` is re-derived where the chrome stands on **paper**. | The album's footer sits on the card's own paper, so it takes the accent unlifted and the hover from the ink; the marks standing on a picture keep the dark-room values. A footer wearing a palette derived for black arrived pink on light grey, and a white hover painted the control out. |
| A plain `var(--color-accent)` line stands before the `color-mix`. | The fallback for browsers without `color-mix`; they keep the unlifted colour. |
| An `@supports (color: oklch(from …))` block re-derives the same colours. | Relative colour syntax keeps the theme's hue **and** chroma and only raises lightness, where mixing towards white also washes the colour out. It also lets the bars take the accent's hue at a fraction of its saturation - **scaled**, not set, so a neutral theme stays neutral. Older browsers keep the flat values and lose the tint. |
| `user-select: none` across the whole viewer. | Every gesture it offers is a press and a drag, which is also how a selection begins. Mobile Firefox is the plainest case: a double tap selects instead of zooming. |
| The bars pad with `max(…, env(safe-area-inset-*))`, sides included. | The viewer is the one screen drawn edge to edge, so it is the one where the home indicator sits *on* something - the row of tags. Landscape on a notched phone is where a viewer is most used and where the notch eats width rather than height. |
| `.lightbox-cell` has **no padding of its own**. | The cell is the whole window, so scale 1 means "as large as the window allows" - the far end of the zoom. Clearing the bars is the transform's job; padding changed the layout box and dragged the zoom along with every change of it. |
| The open/close scale sits on the **filmstrip**, not on the viewer. | A transform on an ancestor moves every `getBoundingClientRect` beneath it, and the whole of the viewer's sizing is read that way. The strip is inside the frame that gets measured, not around it. |
| `.lightbox-leave-active` switches off pointer events on the root **and its descendants**. | An overlay that is merely fading still covers the window and swallowed the first thing reached for afterwards. The bars and arrows take pointer events back while the viewer is up, so switching them off at the root alone left them holding all four edges - exactly where the page's own header, footer and controls wait underneath. |
| `:root[data-lightbox-flying]` suppresses the room's fade, and is stamped on the **document**. | Fading the room while the picture flies back gives the reader two departures at once. It cannot be a class on the viewer: by the time a flight begins the viewer is already unmounting, and a subtree on its way out is never patched again. |

### Animations

| Rule | Why |
| --- | --- |
| Page transitions are **animations, not transitions**. | The reduced-motion rules cut every animation to a hundredth of a millisecond, which still ends and still fires `animationend` - which is what Vue waits for before taking the old page out. A transition switched off with `transition-property: none` fires nothing, and the page hangs on an event that never comes. |
| The fold (`reveal*`) animates `grid-template-rows` from `0fr` to `1fr`. | The one way to animate to a height nobody has measured. |
| That grid sets `align-items: start`. | Stretched to a row of no height the content would be squashed to nothing and reflowed on every frame - a map or a form doing that mid-fold is the jitter this exists to avoid. Kept at its natural height it hangs out of the top of the row and is clipped, which is what a fold looks like. |
| It clips **only while it moves**. | A permanent `overflow: hidden` cuts the focus ring off anything at the edge of the panel for the rest of the page's life. |
| A cascading fold's leave animation is longer than the fold itself. | Vue watches the root and takes the whole subtree away the instant *its* animation ends, so the fold has to outlast the last entry or the stagger is cut off and the rest vanish. The `animation` shorthand on the entries is a full override of the one they arrived under, which is what restarts a finished animation as a different one. |
| `.cascade-item` uses `animation-fill-mode: both`. | Without it every entry is visible from the first frame and only the movement is staggered. The delay is capped by `cascadeDelay` - see [ui-shell.md](ui-shell.md). |
| The leaving modal panel stops answering the hand at once. | Same reason as the viewer: an overlay that is merely fading still covers the window. |
| `.leaflet-tooltip.trip-time` strips Leaflet's box, shadow and arrow. | Leaflet's styling is sized for a sentence. These carry four characters, two at a time on a map two hundred pixels tall; at that size the arrow is more mark than the thing it points at. |

## Copy and the build

The locale JSON is the single source for both the runtime head and the build-time SEO
blocks - `app.title`, `app.subtitle`, `seo.description` are read by
`scripts/generate-localized-html.mjs` as well as `services/head.js`.

Adding a locale means touching: `SUPPORTED_LOCALES`, a JSON file, `OG_LOCALE` in
`services/head.js`, `LOCALES` and `OG_LOCALE` in the build script, `LABELS` in
`LanguageTabs.vue`, and the `.htaccess` alternation.

The last three keep their own lists on purpose: the build script cannot import from
`src/i18n`, `head.js` maps to OpenGraph tags, and `LanguageTabs` needs a display label
per locale. Everywhere else imports `SUPPORTED_LOCALES`.

## Invariants

1. `?lang=` is consumed in `src/i18n/index.js` at import time.
2. A locale change invalidates day and tag caches and obliges a refetch.
3. Themes are added in `themes.js` alone; the `light` entry mirrors `@theme`.
4. Theme tokens are removed when a new theme does not define them.
5. Reduced-motion rules are scoped `:root:not([data-motion='always'])`; spinners exempt.
6. UI copy lives in the locale JSON, never inline.

## Related

- Shared links and localised previews: [sharing-and-links.md](sharing-and-links.md).
- Why the editor refuses the flat model: [media-editor.md](media-editor.md).
