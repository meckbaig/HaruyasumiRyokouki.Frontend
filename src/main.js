import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import { router, installAuthRedirect, prefetchViews } from './router'
import { i18n } from './i18n'
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

// A shared link's `?lang=` is read and removed in @/i18n, before the router is
// built — see the note there for why it must not be a navigation.
document.documentElement.setAttribute('lang', i18n.global.locale.value)

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
