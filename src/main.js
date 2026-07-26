import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import { router, installAuthRedirect } from './router'
import { i18n } from './i18n'
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

app.mount('#app')
