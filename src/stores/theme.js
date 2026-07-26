import { defineStore } from 'pinia'
import { ref } from 'vue'

const STORAGE_KEY = 'haruyasumi.theme'

/** User-facing choices. "system" follows the OS light/dark preference. */
export const THEME_OPTIONS = ['system', 'light', 'dark', 'black']

const media = window.matchMedia?.('(prefers-color-scheme: dark)')

/** Resolves a preference to the concrete theme written to the DOM. */
function resolve(preference) {
  if (preference === 'system') return media?.matches ? 'dark' : 'light'
  return preference
}

function apply(theme) {
  const root = document.documentElement
  // "light" is the default palette, so it needs no attribute.
  if (theme === 'light') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', theme)
}

/**
 * Theme preference and its resolution to a concrete light/dark/black theme.
 * A three-way palette (plus "system") cannot ride on prefers-color-scheme alone,
 * so the choice is stored and applied explicitly.
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
    media?.addEventListener?.('change', () => {
      if (preference.value === 'system') apply(resolve('system'))
    })
  }

  return { preference, THEME_OPTIONS, set, init }
})
