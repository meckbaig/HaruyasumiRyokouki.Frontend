import { defineStore } from 'pinia'
import { ref } from 'vue'
import { themes, themeById, THEME_OPTIONS, FALLBACK_THEME_ID } from '@/theme/themes'

const STORAGE_KEY = 'haruyasumi.theme'

const mediaQuery = window.matchMedia?.('(prefers-color-scheme: dark)')

/** Resolves a preference id to the concrete themed entry to paint. */
function resolve(id) {
  const theme = themeById[id] ?? themeById[FALLBACK_THEME_ID]
  if (theme.followsOs) {
    return themeById[mediaQuery?.matches ? 'dark' : 'light'] ?? themeById[FALLBACK_THEME_ID]
  }
  return theme
}

/** Custom properties written for the theme currently on screen. */
let appliedTokens = []

/** The concrete themed entry on screen now (system resolves to light/dark). */
const resolvedTheme = ref(null)

/**
 * Paints a theme as inline custom properties on <html>, which beat the `@theme`
 * defaults. Tokens the new theme does not define are **removed**, or an optional
 * one would leak the old colour. See docs/features/i18n-and-theming.md.
 */
function apply(theme) {
  resolvedTheme.value = theme
  const root = document.documentElement
  const tokens = Object.keys(theme.colors ?? {})

  for (const name of appliedTokens) {
    if (!tokens.includes(name)) root.style.removeProperty(`--color-${name}`)
  }
  appliedTokens = tokens

  for (const [name, value] of Object.entries(theme.colors ?? {})) {
    root.style.setProperty(`--color-${name}`, value)
  }
  // Native controls and scrollbars follow the theme's light/dark nature.
  root.style.colorScheme = theme.scheme ?? 'light'
  // Kept as a styling/debug hook even though colours ride on the inline vars.
  root.setAttribute('data-theme', theme.id)

  // Installed as an app, the browser paints its own surround in this colour.
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta && theme.colors?.paper) meta.setAttribute('content', theme.colors.paper)
}

/**
 * Theme preference and its resolution to a palette. A multi-way choice cannot
 * ride on `prefers-color-scheme` alone. Definitions live in @/theme/themes.
 */
export const useThemeStore = defineStore('theme', () => {
  const stored = localStorage.getItem(STORAGE_KEY)
  const preference = ref(THEME_OPTIONS.includes(stored) ? stored : 'system')

  function set(next) {
    if (!THEME_OPTIONS.includes(next)) return
    preference.value = next
    localStorage.setItem(STORAGE_KEY, next)
    apply(resolve(next))
  }

  /** Applies the current preference; call once on boot. */
  function init() {
    apply(resolve(preference.value))
    // Track OS changes only while the preference is "system".
    mediaQuery?.addEventListener?.('change', () => {
      if (preference.value === 'system') apply(resolve('system'))
    })
  }

  return { preference, resolvedTheme, themes, THEME_OPTIONS, set, init }
})
