<script setup>
import { watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import AppHeader from '@/components/layout/AppHeader.vue'
import AppFooter from '@/components/layout/AppFooter.vue'
import ToastHost from '@/components/common/ToastHost.vue'
import LoadingIndicator from '@/components/common/LoadingIndicator.vue'
import SelectionToolbar from '@/components/editor/SelectionToolbar.vue'
import { updateHead } from '@/router'

const { t, locale } = useI18n()
const route = useRoute()

// The router sets the head on navigation; re-apply it when the locale changes
// mid-page so the tab title and preview meta follow the switch immediately.
watch(locale, () => updateHead(route))
</script>

<template>
  <a
    href="#main"
    class="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-ink focus:px-3 focus:py-2 focus:text-paper"
  >
    {{ t('nav.skipToContent') }}
  </a>

  <div class="flex min-h-screen flex-col">
    <AppHeader />

    <main id="main" class="flex-1">
      <!--
        Views arrive as their own chunks, so a first visit to one has to wait for
        the download. Without a fallback that wait shows as a blank page, which
        reads as a hung site rather than as loading.
      -->
      <RouterView v-slot="{ Component }">
        <Suspense>
          <component :is="Component" />
          <template #fallback>
            <LoadingIndicator />
          </template>
        </Suspense>
      </RouterView>
    </main>

    <AppFooter />
  </div>

  <SelectionToolbar />
  <ToastHost />
</template>
