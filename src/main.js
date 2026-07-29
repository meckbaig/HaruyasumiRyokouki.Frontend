import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import { router, installAuthRedirect } from './router'
import { i18n, SUPPORTED_LOCALES, persistLocaleIfUnset } from './i18n'
import { useAuthStore } from './stores/auth'
import { useThemeStore } from './stores/theme'
import './assets/main.css'

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.use(i18n)

// Both of these need Pinia active but must run before the first navigation:
// the guard on /admin/pending checks a session that has not been restored yet.
useAuthStore().restore()
useThemeStore().init()
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
