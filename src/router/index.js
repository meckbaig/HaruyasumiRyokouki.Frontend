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

/*
  Which way the page transition should travel, read by App.vue.

  Almost every move is "somewhere else on the site", and the pages simply rise
  past each other. Stepping between days is the exception: those are neighbours
  on a line, and a step that slid the wrong way would say the reader had gone
  back when they had gone on. Arrows and swipes both come through here, so
  neither needs to know about it.
*/
export const navDirection = ref('up')

function directionBetween(to, from) {
  if (to.name !== 'day' || from.name !== 'day') return 'up'
  if (!to.params.date || !from.params.date) return 'up'
  return to.params.date > from.params.date ? 'forward' : 'back'
}

/*
  Starts a page's data on its way as the navigation begins.

  The transition between pages runs the departure first and mounts the arriving
  page only once it has finished, so a page that asks for its data on mount asks
  a sixth of a second late — and the reader watches an empty frame for exactly as
  long as the animation was meant to be covering. Asking here instead puts the
  request and the animation side by side.

  Fire and forget: the page asks for the same day itself, and the store hands
  both of them the one request. A failure here is not this hook's to report — the
  page will ask, and will show its own error state.
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
  'admin-tags': 'tags.title',
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
 * Warms the chunks a visitor is most likely to open next.
 *
 * Every view is loaded on demand, which keeps the first paint small but makes
 * the first navigation to each one wait on a download. Fetching the two that
 * every path leads to — a day and a search — while the browser is otherwise idle
 * turns that wait into nothing at all; anything still cold falls back to the
 * loading indicator. Failures are ignored on purpose: this is an optimisation,
 * and the router will simply load the chunk again when it is really needed.
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
