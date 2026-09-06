import { ref } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useDaysStore } from '@/stores/days'
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
    path: '/admin/tags',
    name: 'admin-tags',
    component: () => import('@/views/AdminTagsView.vue'),
    meta: { requiresEditor: true },
  },
  {
    path: '/admin/tags/collect',
    name: 'admin-tag-collect',
    component: () => import('@/views/AdminTagCollectView.vue'),
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

/**
 * Which way the page transition travels, read by App.vue. `forward`/`back` only
 * between two day routes, which are neighbours on a line; everything else `up`.
 */
export const navDirection = ref('up')

function directionBetween(to, from) {
  if (to.name !== 'day' || from.name !== 'day') return 'up'
  if (!to.params.date || !from.params.date) return 'up'
  return to.params.date > from.params.date ? 'forward' : 'back'
}

/**
 * Starts a page's data on its way as the navigation begins, so the request and
 * the page transition overlap. Fire and forget - the page asks for the same day
 * itself and the store hands both one request, error state included.
 */
function prefetchRoute(to) {
  if (to.name === 'day' && typeof to.params.date === 'string') {
    useDaysStore()
      .loadDay(to.params.date)
      .catch(() => {})
  }
}

router.beforeEach((to, from) => {
  navDirection.value = directionBetween(to, from)
  prefetchRoute(to)
  return true
})

router.beforeEach((to) => {
  if (!to.meta.requiresEditor) return true

  const auth = useAuthStore()
  if (auth.isEditor) return true
  return { name: 'login', query: { redirect: to.fullPath } }
})

/** Per-route title key. `home` is null and falls back to the tagline. */
const TITLE_KEYS = {
  home: null,
  search: 'nav.home',
  map: 'map.title',
  login: 'login.title',
  'admin-pending': 'admin.title',
  'admin-tags': 'tags.title',
  'admin-tag-collect': 'collect.title',
  'not-found': 'notFound.title',
}

/** Builds the localised head for a route and applies it. */
export function updateHead(route) {
  if (route.name === 'day' && route.params.date) {
    // Spelled out, not the raw ISO date: this is a tab title and a link heading.
    applyHead({ title: formatLongDate(route.params.date, i18n.global.locale.value) })
  } else {
    const key = TITLE_KEYS[route.name]
    applyHead({ title: key ? i18n.global.t(key) : null })
  }
}

router.afterEach((to) => updateHead(to))

/**
 * Warms the two chunks every path leads to, while the browser is idle. Failures
 * are ignored: the router loads the chunk again when it is really needed.
 */
export function prefetchViews() {
  const warm = () => {
    import('@/views/DayView.vue').catch(() => {})
    import('@/views/SearchView.vue').catch(() => {})
  }

  if (typeof requestIdleCallback === 'function') requestIdleCallback(warm, { timeout: 3000 })
  else setTimeout(warm, 1500)
}

/**
 * Wires the HTTP client's 401 handling into the router. **Only `requiresAuth`
 * calls reach this**, so a visitor on a public page is never yanked to /login.
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
