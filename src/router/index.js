import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { setUnauthorizedHandler } from '@/api/authState'
import { i18n } from '@/i18n'
import { applyHead } from '@/services/head'
import { formatLongDate } from '@/services/dates'

const routes = [
  {
    path: '/',
    name: 'home',
    component: () => import('@/views/HomeView.vue'),
  },
  {
    path: '/day/:date',
    name: 'day',
    component: () => import('@/views/DayView.vue'),
    props: true,
  },
  {
    path: '/search',
    name: 'search',
    component: () => import('@/views/SearchView.vue'),
  },
  {
    path: '/map',
    name: 'map',
    component: () => import('@/views/MapView.vue'),
  },
  {
    path: '/login',
    name: 'login',
    component: () => import('@/views/LoginView.vue'),
  },
  {
    path: '/admin/pending',
    name: 'admin-pending',
    component: () => import('@/views/AdminPendingView.vue'),
    meta: { requiresEditor: true },
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'not-found',
    component: () => import('@/views/NotFoundView.vue'),
  },
]

export const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior(to, from, savedPosition) {
    if (savedPosition) return savedPosition
    // Switching search tabs or map ranges should not jump back to the top.
    if (to.path === from.path) return false
    return { top: 0 }
  },
})

router.beforeEach((to) => {
  if (!to.meta.requiresEditor) return true

  const auth = useAuthStore()
  if (auth.isEditor) return true
  return { name: 'login', query: { redirect: to.fullPath } }
})

/**
 * Per-route title key, so a shared link reads sensibly in a browser tab and in
 * link previews. Kept out of views to avoid repeating it in each one; the day
 * page refines its own title once the date is known. `home` uses the tagline.
 */
const TITLE_KEYS = {
  home: null,
  search: 'nav.home',
  map: 'map.title',
  login: 'login.title',
  'admin-pending': 'admin.title',
  'not-found': 'notFound.title',
}

/** Builds the localised head for a route and applies it. */
export function updateHead(route) {
  if (route.name === 'day' && route.params.date) {
    // Spelled out ("April 13, 2026"), not the raw ISO date: the title is what a
    // visitor reads in the tab and what a shared link shows as its heading.
    applyHead({ title: formatLongDate(route.params.date, i18n.global.locale.value) })
  } else {
    const key = TITLE_KEYS[route.name]
    applyHead({ title: key ? i18n.global.t(key) : null })
  }
}

router.afterEach((to) => updateHead(to))

/**
 * Wires the HTTP client's 401 handling into the router. Only calls marked
 * `requiresAuth` reach this, so an anonymous visitor browsing public pages is
 * never yanked to the login screen.
 */
export function installAuthRedirect() {
  setUnauthorizedHandler(() => {
    const auth = useAuthStore()
    auth.signOut()

    const current = router.currentRoute.value
    if (current.name === 'login') return
    router.push({ name: 'login', query: { redirect: current.fullPath } })
  })
}
