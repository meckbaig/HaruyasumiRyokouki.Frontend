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

`--color-star` is deliberately **not** themed - a star reads as gold in every palette -
though a theme may still override it like any token.

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
`.btn-danger` · `.fit-media` · `.cascade-item`

Named transitions live below that layer: `page-{up,forward,back}`, `lightbox-*`, `modal-*`,
`reveal*`, `soft-*`, `map-full-*`.

## Copy and the build

The locale JSON is the single source for both the runtime head and the build-time SEO
blocks - `app.title`, `app.subtitle`, `seo.description` are read by
`scripts/generate-localized-html.mjs` as well as `services/head.js`.

Adding a locale means touching: `SUPPORTED_LOCALES`, a JSON file, `OG_LOCALE` in
`services/head.js`, `LOCALES` and `OG_LOCALE` in the build script, `LABELS` in
`LanguageTabs.vue`, the `.htaccess` alternation - and the hardcoded triple in
`AdminTagsView.vue` (see `docs/issues.md` D1c).

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
