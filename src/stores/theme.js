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

/**
 * Paints a resolved theme by writing its palette as inline custom properties on
 * <html>. Inline vars win over the stylesheet `@theme` defaults, so every
 * Tailwind `var(--color-*)` utility re-themes at once. Because all themes list
 * the same tokens, overwriting is a complete swap — no leftovers to clear.
 */
function apply(theme) {
  const root = document.documentElement
  for (const [name, value] of Object.entries(theme.colors ?? {})) {
    root.style.setProperty(`--color-${name}`, value)
  }
  // Native controls and scrollbars follow the theme's light/dark nature.
  root.style.colorScheme = theme.scheme ?? 'light'
  // Kept as a styling/debug hook even though colours ride on the inline vars.
  root.setAttribute('data-theme', theme.id)
}

/**
 * Theme preference and its resolution to a concrete palette. A multi-way palette
 * (plus "system") cannot ride on prefers-color-scheme alone, so the choice is
 * stored and applied explicitly. All theme definitions live in @/theme/themes.
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

  return { preference, themes, THEME_OPTIONS, set, init }
})
