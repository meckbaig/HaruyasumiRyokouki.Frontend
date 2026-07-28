<script setup>
import { ref, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import SearchBar from './SearchBar.vue'
import LocaleSwitcher from './LocaleSwitcher.vue'
import ThemeSwitcher from './ThemeSwitcher.vue'
import { useAuthStore } from '@/stores/auth'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

// The landing page has its own large search field; a second one in the bar
// would just be noise.
const showSearch = computed(() => route.name !== 'home')

// Mobile-only overlays. On desktop everything stays inline.
const menuOpen = ref(false)
const searchOpen = ref(false)

// Any navigation dismisses both, so a menu link or a search never leaves them
// hanging open over the new page.
watch(
  () => route.fullPath,
  () => {
    menuOpen.value = false
    searchOpen.value = false
  },
)

function signOut() {
  auth.signOut()
  menuOpen.value = false
  if (route.meta.requiresEditor) router.push({ name: 'home' })
}
</script>

<template>
  <header class="sticky top-0 z-30 border-b border-edge bg-paper/85 backdrop-blur">
    <div class="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
      <RouterLink
        :to="{ name: 'home' }"
        class="shrink-0 text-sm font-semibold tracking-tight text-ink my-2"
      >
        {{ t('app.title') }}
      </RouterLink>

      <!-- Desktop: inline search. -->
      <div v-if="showSearch" class="hidden min-w-0 flex-1 sm:block">
        <SearchBar />
      </div>
      <div v-else class="hidden flex-1 sm:block" />

      <!-- Mobile: spacer so the actions sit on the right. -->
      <div class="flex-1 sm:hidden" />

      <!-- Desktop actions, inline. -->
      <nav class="hidden shrink-0 items-center gap-3 text-sm sm:flex">
        <RouterLink :to="{ name: 'map' }" class="text-ink-soft transition hover:text-ink">
          {{ t('nav.map') }}
        </RouterLink>
        <RouterLink
          v-if="auth.isEditor"
          :to="{ name: 'admin-pending' }"
          class="text-ink-soft transition hover:text-ink"
        >
          {{ t('nav.admin') }}
        </RouterLink>
        <button
          v-if="auth.isEditor"
          type="button"
          class="text-ink-faint transition hover:text-ink"
          @click="signOut"
        >
          {{ t('nav.logout') }}
        </button>
        <RouterLink
          v-else
          :to="{ name: 'login' }"
          class="text-ink-faint transition hover:text-ink"
        >
          {{ t('nav.login') }}
        </RouterLink>
        <LocaleSwitcher />
        <ThemeSwitcher />
      </nav>

      <!-- Mobile actions: search toggle + menu button. -->
      <div class="flex shrink-0 items-center gap-1 sm:hidden">
        <button
          v-if="showSearch"
          type="button"
          class="flex h-9 w-9 items-center justify-center rounded-md text-ink-soft transition hover:bg-edge/60"
          :aria-label="t('search.submit')"
          @click="searchOpen = true"
        >
          <svg
            class="h-5 w-5"
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            aria-hidden="true"
          >
            <circle cx="9" cy="9" r="5.5" />
            <path d="m13.5 13.5 3 3" stroke-linecap="round" />
          </svg>
        </button>

        <button
          type="button"
          class="flex h-9 w-9 items-center justify-center rounded-md text-ink-soft transition hover:bg-edge/60"
          :aria-label="menuOpen ? t('menu.close') : t('menu.open')"
          :aria-expanded="menuOpen"
          @click="menuOpen = !menuOpen"
        >
          <svg
            class="h-5 w-5"
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            aria-hidden="true"
          >
            <path v-if="!menuOpen" d="M3 6h14M3 10h14M3 14h14" stroke-linecap="round" />
            <path v-else d="m5 5 10 10M15 5 5 15" stroke-linecap="round" />
          </svg>
        </button>
      </div>
    </div>

    <!-- Mobile dropdown menu. -->
    <Transition
      enter-from-class="-translate-y-2 opacity-0"
      enter-active-class="transition duration-150"
      leave-to-class="-translate-y-2 opacity-0"
      leave-active-class="transition duration-150"
    >
      <nav
        v-if="menuOpen"
        class="border-t border-edge bg-paper-raised px-4 py-3 sm:hidden"
      >
        <RouterLink
          :to="{ name: 'map' }"
          class="block rounded-md px-2 py-2 text-sm text-ink-soft transition hover:bg-edge/50"
        >
          {{ t('nav.map') }}
        </RouterLink>
        <RouterLink
          v-if="auth.isEditor"
          :to="{ name: 'admin-pending' }"
          class="block rounded-md px-2 py-2 text-sm text-ink-soft transition hover:bg-edge/50"
        >
          {{ t('nav.admin') }}
        </RouterLink>
        <button
          v-if="auth.isEditor"
          type="button"
          class="block w-full rounded-md px-2 py-2 text-left text-sm text-ink-faint transition hover:bg-edge/50"
          @click="signOut"
        >
          {{ t('nav.logout') }}
        </button>
        <RouterLink
          v-else
          :to="{ name: 'login' }"
          class="block rounded-md px-2 py-2 text-sm text-ink-faint transition hover:bg-edge/50"
        >
          {{ t('nav.login') }}
        </RouterLink>

        <div class="mt-2 flex items-center justify-between gap-4 border-t border-edge pt-3">
          <LocaleSwitcher />
          <ThemeSwitcher />
        </div>
      </nav>
    </Transition>
  </header>

  <!-- Mobile search overlay: collapsed to a button in the bar, opens centred. -->
  <Teleport to="body">
    <Transition
      enter-from-class="opacity-0"
      enter-active-class="transition duration-150"
      leave-to-class="opacity-0"
      leave-active-class="transition duration-150"
    >
      <div
        v-if="searchOpen"
        class="fixed inset-0 z-40 flex items-start justify-center bg-ink/40 px-4 pt-24 sm:hidden"
        @click.self="searchOpen = false"
      >
        <div class="w-full max-w-md">
          <SearchBar size="large" autofocus @submitted="searchOpen = false" />
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
