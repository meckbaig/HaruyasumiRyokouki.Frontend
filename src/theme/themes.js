/*
  Theme registry — the single source of truth for themes.

  To add a theme, copy one block below and change the values. It then appears
  automatically in the switcher dropdown and becomes selectable; no other file
  needs to change.

  Each entry:
    id      unique key, also persisted to localStorage and stamped on <html>.
    icon    glyph shown in the switcher.
    labels  display name per locale (falls back to `en`, then `id`).
    scheme  'light' | 'dark' — drives native controls/scrollbars (color-scheme).
    colors  design-token overrides. Keys match the `--color-*` tokens declared
            in main.css `@theme`; the theme store writes them as inline custom
            properties on <html>, which override the stylesheet defaults.

  One optional token is worth calling out: `accent-on-dark`. The lightbox is a
  dark room whatever the theme, and it colours its text, icons, tag outlines and
  the tint under its blurred bars from the theme. `accent` itself is chosen to
  read on the page background, which for a light theme means something dark and
  usually warm — lifting that onto black gives a muddy orange rather than the
  colour anyone expects. Set `accent-on-dark` to say what the theme should look
  like there; leave it out and the lightbox derives one by lightening `accent`.

  `system` is special: it has no palette and follows the OS light/dark setting,
  resolving to the `light` or `dark` entry at runtime.

  Note: main.css `@theme` still lists the light palette — Tailwind needs it to
  generate the `bg-paper`/`text-ink`/... utilities and it is the pre-JS default.
  Keep the `light` entry below in sync with it.
*/

/** Used when a stored preference is unknown or resolution has no match. */
export const FALLBACK_THEME_ID = 'light'

export const themes = [
  {
    id: 'system',
    icon: '◐',
    labels: { ru: 'Как в системе', en: 'Match system', ja: 'システムに合わせる' },
    followsOs: true,
  },
  {
    id: 'light',
    icon: '☀',
    labels: { ru: 'Светлая', en: 'Light', ja: 'ライト' },
    scheme: 'light',
    colors: {
      'ink': '#17151f',
      'ink-soft': '#4a4658',
      'ink-faint': '#8b8798',
      'paper': '#faf8f5',
      'paper-raised': '#ffffff',
      'edge': '#e5e0d8',
      'accent': '#b3403f',
      'accent-soft': '#f2dede',
      // Neutral in the lightbox: this theme's red belongs on paper, not on black.
      'accent-on-dark': '#f4f4f5',
    },
  },
  {
    id: 'pink',
    icon: '❤',
    labels: { ru: 'Розовая', en: 'Pink', ja: 'ピンク' },
    scheme: 'light',
    colors: {
      'ink': '#26131c',
      'ink-soft': '#64263f',
      'ink-faint': '#b06b89',
      'paper': '#ffedf4',
      'paper-raised': '#ffffff',
      'edge': '#f3b4cc',
      'accent': '#e83e8c',
      'accent-soft': '#ffc1dc',
      // Softer than the page accent — the same pink, without the shout.
      'accent-on-dark': '#ffb6d5',
    },
  },
  {
    id: 'dark',
    icon: '☾',
    labels: { ru: 'Тёмная', en: 'Dark', ja: 'ダーク' },
    scheme: 'dark',
    colors: {
      'ink': '#ededed',
      'ink-soft': '#b2b2b2',
      'ink-faint': '#7d7d7d',
      'paper': '#141414',
      'paper-raised': '#282828',
      'edge': '#3a3a3a',
      'accent': '#e8807f',
      'accent-soft': '#3a2726',
      'accent-on-dark': '#f4f4f5',
    },
  },
  {
    id: 'black',
    icon: '◍',
    labels: { ru: 'Чёрная (OLED)', en: 'Black (OLED)', ja: 'ブラック（OLED）' },
    scheme: 'dark',
    colors: {
      'ink': '#ededed',
      'ink-soft': '#a8a8a8',
      'ink-faint': '#6f6f6f',
      'paper': '#000000',
      'paper-raised': '#0c0c0c',
      'edge': '#262626',
      'accent': '#e8807f',
      'accent-soft': '#2a1c1c',
      'accent-on-dark': '#f4f4f5',
    },
  },
]

/** id -> theme, for quick lookup. */
export const themeById = Object.fromEntries(themes.map((theme) => [theme.id, theme]))

/** Every selectable id, in menu order. */
export const THEME_OPTIONS = themes.map((theme) => theme.id)

/** Picks a theme's display name for a locale, with graceful fallbacks. */
export function themeLabel(theme, locale) {
  return theme.labels?.[locale] ?? theme.labels?.en ?? theme.id
}
