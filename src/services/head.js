import { i18n } from '@/i18n'

/*
  Localised document head.

  The static index.html can only carry one language, so its title/description
  are a fixed fallback. This module rewrites them at runtime to match the active
  locale and the current route, which fixes the browser tab, bookmarks, and any
  crawler that executes JavaScript (Google does).

  Link-preview crawlers (Telegram, WhatsApp, VK, Slack, Facebook) do NOT run JS,
  so this runtime rewrite never reaches them. Their card language is handled at
  the server: the build emits index.ru/en/ja.html with localized OG tags
  (scripts/generate-localized-html.mjs) and Apache serves one by ?lang= /
  Accept-Language (the generated .htaccess). Shared links carry ?lang= (added in
  services/share.js), which is how the crawler lands on the right variant.
*/

/** OpenGraph wants a full locale tag; our app locales are the language part. */
const OG_LOCALE = { ru: 'ru_RU', en: 'en_US', ja: 'ja_JP' }

/** Finds a managed <meta> by its key attribute, creating it once if missing. */
function setMeta(keyAttr, keyValue, content) {
  const selector = `meta[${keyAttr}="${keyValue}"]`
  let el = document.head.querySelector(selector)
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(keyAttr, keyValue)
    document.head.appendChild(el)
  }
  el.setAttribute('content', content)
}

/**
 * Applies a localised head. `title` is the page-specific part (omitted on the
 * home page); `description` overrides the default tagline when a page has one.
 */
export function applyHead({ title, description } = {}) {
  const { t, locale } = i18n.global
  const site = t('app.title')
  const tagline = t('app.subtitle')

  const fullTitle = title ? `${title} · ${site}` : `${site} — ${tagline}`
  const desc = description || tagline

  document.title = fullTitle
  setMeta('name', 'description', desc)
  setMeta('property', 'og:title', fullTitle)
  setMeta('property', 'og:description', desc)
  setMeta('property', 'og:site_name', site)
  setMeta('property', 'og:type', 'website')
  setMeta('property', 'og:locale', OG_LOCALE[locale.value] ?? locale.value)
  setMeta('name', 'twitter:card', 'summary')
  setMeta('name', 'twitter:title', fullTitle)
  setMeta('name', 'twitter:description', desc)

  document.documentElement.setAttribute('lang', locale.value)
}
