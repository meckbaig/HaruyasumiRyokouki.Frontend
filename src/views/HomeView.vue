<script setup>
import { computed, ref, watch, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import SearchBar from '@/components/layout/SearchBar.vue'
import TripCalendar from '@/components/calendar/TripCalendar.vue'
import FavoritesShowcase from '@/components/media/FavoritesShowcase.vue'
import MediaLightbox from '@/components/media/MediaLightbox.vue'
import ErrorState from '@/components/common/ErrorState.vue'
import { fetchFavoriteMedia } from '@/api/media'
import { useDaysStore } from '@/stores/days'
import { useUiStore } from '@/stores/ui'

const { t } = useI18n()
const router = useRouter()
const days = useDaysStore()
const ui = useUiStore()

const totalMedia = computed(() =>
  days.list.reduce((sum, day) => sum + (day.mediaCount ?? 0), 0),
)

/*
  The wall of picked-out files, and the viewer it opens into.

  They page as one album even though they come from all over the trip: the viewer
  walks whatever list it is handed, and this one is the wall. Each file's day
  comes from its own timestamp, which is what the viewer's "open day" button
  follows.

  A failed request leaves the wall out rather than putting an error on the front
  page — nothing here is the reason a visitor came, and the calendar below is
  still the way in.

  Deliberately not linkable: the backend shuffles this list and caps it, so the
  same `?i=` that works on a day would point into a set that no longer exists on
  the next visit.
*/
const favorites = ref([])
const showcaseIndex = ref(null)

async function loadFavorites() {
  try {
    favorites.value = await fetchFavoriteMedia()
  } catch {
    favorites.value = []
  }
}

onMounted(() => {
  days.loadList()
  loadFavorites()
})

// Titles and tags arrive in one language, so a switch has to ask again. The set
// comes back reshuffled, which is no loss on a wall that was random to begin with.
watch(() => ui.locale, loadFavorites)

function openDay(date) {
  router.push({ name: 'day', params: { date } })
}

function openFavorite(media) {
  showcaseIndex.value = favorites.value.indexOf(media)
}
</script>

<template>
  <div class="mx-auto max-w-6xl px-4">
    <section class="py-12 text-center sm:pt-20 sm:pb-10">
      <h1 class="text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
        {{ t('app.title') }}
      </h1>
      <p class="mt-3 text-ink-soft">{{ t('app.subtitle') }}</p>

      <div class="mx-auto mt-8 max-w-xl">
        <SearchBar size="large" autofocus />
      </div>

      <p v-if="days.list.length" class="mt-4 text-xs text-ink-faint">
        {{ t('day.mediaCount', { count: totalMedia }, totalMedia) }} ·
        {{ t('search.daysFound', { count: days.list.length }, days.list.length) }}
      </p>
    </section>

    <!--
      The wall arrives after its request, so it would otherwise appear under the
      calendar and shove it down the page. Rising into place says the same thing
      the movement itself would have said accidentally — that something has
      arrived — while the space is reserved before the pictures land in it.
    -->
    <Transition
      enter-from-class="translate-y-3 opacity-0"
      enter-active-class="transition duration-500 ease-out"
    >
      <section v-if="favorites.length" class="pb-12">
        <FavoritesShowcase :items="favorites" @open="openFavorite" />
      </section>
    </Transition>

    <ErrorState v-if="days.listError" :error="days.listError" @retry="days.loadList(true)" />

    <section v-else class="pb-8">
      <h2 class="mb-6 text-center text-sm font-semibold text-ink-soft">
        {{ t('calendar.title') }}
      </h2>

      <div v-if="days.listLoading" class="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <div v-for="index in 3" :key="index" class="h-64 animate-pulse rounded-lg bg-edge/50" />
      </div>

      <TripCalendar v-else :days="days.list" @select="openDay" />
    </section>

    <section class="pb-16">
      <RouterLink
        :to="{ name: 'map' }"
        class="flex items-center justify-between gap-4 rounded-lg border border-edge bg-paper-raised px-6 py-5 transition hover:border-ink-faint"
      >
        <div>
          <h2 class="text-sm font-semibold text-ink">{{ t('map.title') }}</h2>
          <p class="mt-1 text-sm text-ink-soft">{{ t('footer.aboutText') }}</p>
        </div>
        <svg
          class="h-5 w-5 shrink-0 text-ink-faint"
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          stroke-width="1.6"
          aria-hidden="true"
        >
          <path d="M7.5 4l6 6-6 6" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </RouterLink>
    </section>

    <MediaLightbox v-model:index="showcaseIndex" :items="favorites" />
  </div>
</template>
