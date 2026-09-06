import { createI18n } from 'vue-i18n'
import ru from './locales/ru.json'
import en from './locales/en.json'
import ja from './locales/ja.json'

export const SUPPORTED_LOCALES = ['ru', 'en', 'ja']
export const DEFAULT_LOCALE = 'ru'

const STORAGE_KEY = 'haruyasumi.locale'

/**
 * Russian needs three plural forms, which vue-i18n does not know out of the box.
 * Message order is: "1 день | 2 дня | 5 дней".
 */
function russianPluralRule(choice) {
  const n = Math.abs(choice) % 100
  const lastDigit = n % 10

  if (n > 10 && n < 20) return 2
  if (lastDigit === 1) return 0
  if (lastDigit >= 2 && lastDigit <= 4) return 1
  return 2
}

/** Initial locale: `?lang=`, then the saved choice, then the browser, then default. */
export function detectLocale() {
  const shared = new URLSearchParams(window.location.search).get('lang')
  if (shared && SUPPORTED_LOCALES.includes(shared)) return shared

  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored && SUPPORTED_LOCALES.includes(stored)) return stored

  for (const tag of navigator.languages ?? [navigator.language]) {
    const base = String(tag).toLowerCase().split('-')[0]
    if (SUPPORTED_LOCALES.includes(base)) return base
  }
  return DEFAULT_LOCALE
}

export function persistLocale(locale) {
  localStorage.setItem(STORAGE_KEY, locale)
}

/**
 * Persists a locale only when the visitor has none of their own - a returning
 * one sees the shared language this visit and keeps their choice for next time.
 */
export function persistLocaleIfUnset(locale) {
  if (!localStorage.getItem(STORAGE_KEY)) persistLocale(locale)
}

export const i18n = createI18n({
  legacy: false,
  locale: detectLocale(),
  fallbackLocale: DEFAULT_LOCALE,
  messages: { ru, en, ja },
  pluralRules: { ru: russianPluralRule },
})

/**
 * Takes `?lang=` out of the address. **At module evaluation, before the router
 * exists, and with `history.replaceState` rather than the router** - this
 * ordering is load-bearing. See docs/features/sharing-and-links.md.
 */
function consumeSharedLocale() {
  const shared = new URLSearchParams(window.location.search).get('lang')
  if (!shared || !SUPPORTED_LOCALES.includes(shared)) return

  persistLocaleIfUnset(shared)

  const address = new URL(window.location.href)
  address.searchParams.delete('lang')
  history.replaceState(history.state, '', address)
}

consumeSharedLocale()

/** Current locale as a plain string, usable outside components. */
export function currentLocale() {
  return i18n.global.locale.value
}

export function setLocale(locale) {
  if (!SUPPORTED_LOCALES.includes(locale)) return
  i18n.global.locale.value = locale
  persistLocale(locale)
  document.documentElement.setAttribute('lang', locale)
}
