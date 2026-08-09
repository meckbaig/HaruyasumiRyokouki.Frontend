import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import { router, installAuthRedirect, prefetchViews } from './router'
import { i18n, SUPPORTED_LOCALES, persistLocaleIfUnset } from './i18n'
import { useAuthStore } from './stores/auth'
import { useThemeStore } from './stores/theme'
import { useMotionStore } from './stores/motion'
import './assets/main.css'

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.use(i18n)

// Both of these need Pinia active but must run before the first navigation:
// the guard on /admin/pending checks a session that has not been restored yet.
useAuthStore().restore()
useThemeStore().init()
useMotionStore().init()
installAuthRedirect()

app.use(router)

document.documentElement.setAttribute('lang', i18n.global.locale.value)

// A shared link may carry ?lang=; detectLocale() has already used it to pick the
// initial locale. Once routing is ready, persist that choice only for a visitor
// who has none of their own (so a returning visitor's preference is untouched),
// then strip the param so it does not linger in the address bar or get re-shared.
router.isReady().then(() => {
  const route = router.currentRoute.value
  const lang = route.query.lang
  if (typeof lang === 'string' && SUPPORTED_LOCALES.includes(lang)) {
    persistLocaleIfUnset(lang)
    const query = { ...route.query }
    delete query.lang
    router.replace({ path: route.path, query, hash: route.hash })
  }
})

app.mount('#app')

prefetchViews()

/*
  Registers the service worker, which is what lets a browser offer to install the
  site as an app. Production only: in development the dev server owns the
  requests, and a worker sitting in front of it only confuses reloading.

  The worker itself caches nothing — see public/sw.js for why.
*/
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // An unavailable worker costs the install prompt and nothing else.
    })
  })
}
