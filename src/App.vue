<script setup>
import { watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import AppHeader from '@/components/layout/AppHeader.vue'
import AppFooter from '@/components/layout/AppFooter.vue'
import AppScrollbar from '@/components/layout/AppScrollbar.vue'
import ToastHost from '@/components/common/ToastHost.vue'
import ConfirmDialog from '@/components/common/ConfirmDialog.vue'
import LoadingIndicator from '@/components/common/LoadingIndicator.vue'
import SelectionToolbar from '@/components/editor/SelectionToolbar.vue'
import { updateHead, navDirection } from '@/router'

const { t, locale } = useI18n()
const route = useRoute()

// The router sets the head on navigation; re-apply it on a mid-page locale switch.
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

    <!-- `overflow-x-clip`, not `hidden`: clipping without becoming a scroll
         container. See docs/features/ui-shell.md. -->
    <main id="main" class="flex-1 overflow-x-clip">
      <!--
        Keyed by path, **not** the full address: the viewer writes the open file
        into the query. `Suspense` outside, `Transition` within - the reverse
        plays the departure and never resolves the arrival.
      -->
      <RouterView v-slot="{ Component, route: current }">
        <Suspense>
          <Transition :name="`page-${navDirection}`" mode="out-in">
            <component :is="Component" :key="current.path" />
          </Transition>
          <template #fallback>
            <LoadingIndicator />
          </template>
        </Suspense>
      </RouterView>
    </main>

    <AppFooter />
  </div>

  <AppScrollbar class="my-1" />
  <SelectionToolbar />
  <ConfirmDialog />
  <ToastHost />
</template>
