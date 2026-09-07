import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import { router, installAuthRedirect, prefetchViews } from './router'
import { i18n } from './i18n'
import { useAuthStore } from './stores/auth'
import { useThemeStore } from './stores/theme'
import { useMotionStore } from './stores/motion'
import { useInstallManifest } from './composables/useInstallManifest'
import './assets/main.css'

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.use(i18n)

// Need Pinia active, but must run before the first navigation: the guard on
// /admin/pending checks a session that has not been restored yet.
useAuthStore().restore()
useThemeStore().init()
useMotionStore().init()
// Themed install manifest; needs the theme painted first so paper is resolved.
useInstallManifest()
installAuthRedirect()

app.use(router)

// `?lang=` is read and removed in @/i18n, before the router is built.
document.documentElement.setAttribute('lang', i18n.global.locale.value)

app.mount('#app')

prefetchViews()

// The service worker exists so a browser offers to install the site; it caches
// nothing. Production only - in development the dev server owns the requests.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // An unavailable worker costs the install prompt and nothing else.
    })
  })
}
