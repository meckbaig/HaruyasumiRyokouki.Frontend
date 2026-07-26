<script setup>
import { computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import SearchBar from '@/components/layout/SearchBar.vue'
import TripCalendar from '@/components/calendar/TripCalendar.vue'
import ErrorState from '@/components/common/ErrorState.vue'
import { useDaysStore } from '@/stores/days'

const { t } = useI18n()
const router = useRouter()
const days = useDaysStore()

const totalMedia = computed(() =>
  days.list.reduce((sum, day) => sum + (day.mediaCount ?? 0), 0),
)

onMounted(() => days.loadList())

function openDay(date) {
  router.push({ name: 'day', params: { date } })
}
</script>

<template>
  <div class="mx-auto max-w-6xl px-4">
    <section class="py-16 text-center sm:py-24">
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
  </div>
</template>
