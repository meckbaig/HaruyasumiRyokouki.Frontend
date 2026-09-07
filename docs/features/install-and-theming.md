# Install and theming

An installed app's system status bar is painted from the install manifest's `theme_color`,
which a browser reads at install time. This feature makes that color the paper of the theme
the user has chosen at the moment of install, so a dark install gets a dark bar instead of a
light one with white text.

## Files

| File | Role |
| --- | --- |
| `src/services/install.js` | Builds a themed manifest and points `<link rel="manifest">` at it as a Blob URL. |
| `src/composables/useInstallManifest.js` | Watches the resolved theme and the locale, rebuilds the manifest. |
| `src/stores/theme.js` | Exposes `resolvedTheme`, the concrete entry on screen. |
| `src/services/head.js` | No longer touches the manifest link; it owns the SEO head only. |
| `src/main.js` | Calls `useInstallManifest()` on boot. |

## Why the status bar did not follow the theme

Two independent signals reach the OS bar:

| Signal | Source | Dynamic? |
| --- | --- | --- |
| Bar background | Manifest `theme_color` / `theme-color` meta | Static in an installed app |
| Icon and text colour | Page `color-scheme` | Follows the theme |

The bar background came from a fixed light manifest, so it stayed light, while the icon
colour flipped to light (white) under a dark theme. White text on a light bar is invisible.
The `theme-color` meta tag is updated live in `theme.js`, which works in a browser tab, but an
installed standalone app on Android reads the bar colour from the manifest at install time and
does not re-read the meta afterwards.

## The fix

Keep the manifest link pointing at a manifest whose `theme_color` and `background_color` are
the resolved theme's `paper`. A browser reads the manifest at install time, so each user
installs with the colour they have selected. No theme is forced on anyone.

`resolve()` in `theme.js` already turns `system` into the concrete light or dark entry, so the
manifest always carries a real colour, and it updates live when the OS scheme changes while the
preference is `system`.

### Workflow

1. `theme.js` `apply()` stamps `resolvedTheme` with the concrete entry it painted.
2. `useInstallManifest` watches `resolvedTheme` and the locale; on either change it reads
   `paper`, the locale strings and builds a manifest.
3. `install.js` serves that manifest as a Blob URL and revokes the previous one.
4. The browser reads the current manifest when the user installs, so the installed bar takes
   that `paper`.

The manifest link must not also be rewritten to the static per-locale files afterwards, or it
would undo the theme colour on the next navigation. `head.js` no longer manages the link; the
composable owns it. The per-locale static manifests still exist for the pre-JS first paint and
for crawlers.

### Blob URLs and absolute paths

A manifest served as a Blob URL has no origin to resolve relative paths against, so every URL
it carries must be absolute. `install.js` builds `start_url`, `scope` and each icon `src` from
`window.location.origin`. The icons and the structural fields mirror
`public/manifest.webmanifest` and must be kept in sync with it.

### The residual limit

The manifest is captured at install. If a user changes theme after installing, the OS bar of
the already-installed app does not repaint; only the `theme-color` meta (browser tab) and the
page itself react. To change the bar a reinstall is required, which a page cannot do for the
user.

## Fallback if Blob manifests are unreliable

Most Chromium builds accept a Blob-URL manifest. If a device refuses to offer install from one,
the fallback is to generate static per-theme manifests at build time, by analogy with the
per-locale ones already written in `scripts/generate-localized-html.mjs`, and to point the
link at `manifest.{theme}.webmanifest` instead of a Blob. That needs the build script and the
composable to agree on a theme key (`light`/`dark` and `system` resolved to one of them).

## Invariants

1. The manifest link is owned by `useInstallManifest`, never by the head service.
2. Manifest URLs are absolute; a Blob-URL manifest cannot resolve relative paths.
3. The manifest's structural fields mirror `public/manifest.webmanifest`.
4. The manifest is regenerated on every resolved-theme change and every locale change.
5. An installed app's bar colour is fixed at install and cannot change later.
