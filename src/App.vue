<script setup>
import { watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import AppHeader from '@/components/layout/AppHeader.vue'
import AppFooter from '@/components/layout/AppFooter.vue'
import AppScrollbar from '@/components/layout/AppScrollbar.vue'
import ToastHost from '@/components/common/ToastHost.vue'
import LoadingIndicator from '@/components/common/LoadingIndicator.vue'
import SelectionToolbar from '@/components/editor/SelectionToolbar.vue'
import { updateHead, navDirection } from '@/router'

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

    <!--
      `overflow-x-clip`, not `hidden`: a page sliding sideways would otherwise
      reach past the edge and put a scrollbar under it for the length of the
      animation. Clipping does the same without making this a scroll container,
      which would take the sticky header with it.
    -->
    <main id="main" class="flex-1 overflow-x-clip">
      <!--
        Views arrive as their own chunks, so a first visit to one has to wait for
        the download. Without a fallback that wait shows as a blank page, which
        reads as a hung site rather than as loading.

        Keyed by path and not by full address: the viewer writes the open file
        into the query as it is paged through, and a key that watched the whole
        address would tear the page down and build it again on every picture.

        `Suspense` on the outside and `Transition` within, which is the only way
        round that works: a transition holding a suspense boundary with
        `mode="out-in"` plays the departure and then never resolves the arrival,
        leaving the page empty between the header and the footer.
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
  <ToastHost />
</template>
