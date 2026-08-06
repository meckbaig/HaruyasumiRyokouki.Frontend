<script setup>
import { computed, ref, watch, nextTick, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  downloadSrc,
  fullScreenSrc,
  mediaDate,
  previewSrc,
  streamSrc,
} from '@/services/mediaAssets'
import { isVideo } from '@/services/mediaType'
import TagChip from './TagChip.vue'

const props = defineProps({
  items: { type: Array, default: () => [] },
  /** Index of the open file, or null when the lightbox is closed. */
  index: { type: Number, default: null },
})

const emit = defineEmits(['update:index', 'close'])

const { t } = useI18n()

const dialog = ref(null)
let lastFocused = null

const open = computed(() => props.index !== null && props.index >= 0)
const current = computed(() => (open.value ? (props.items[props.index] ?? null) : null))
const video = computed(() => isVideo(current.value))
const label = computed(() => current.value?.title || current.value?.fileName || t('media.untitled'))

const hasPrev = computed(() => open.value && props.index > 0)
const hasNext = computed(() => open.value && props.index < props.items.length - 1)

/**
 * The preview is the very image the grid tile already downloaded — the API
 * returns one preview URL per file — so it is served from cache and fills the
 * frame at once while the full-screen version arrives over it. Both share the
 * file's aspect ratio, so nothing shifts on the swap.
 */
const preview = computed(() => previewSrc(current.value))
const original = computed(() => fullScreenSrc(current.value))
const stream = computed(() => streamSrc(current.value))
const download = computed(() => downloadSrc(current.value))
const dayDate = computed(() => mediaDate(current.value))

const fullLoaded = ref(false)
const fullFailed = ref(false)

/**
 * The spinner waits before appearing: stepping through photos that are already
 * cached resolves in a few milliseconds, and a spinner flashing on every arrow
 * press is worse than no spinner at all. It only shows for loads slow enough to
 * be worth reporting.
 */
const SPINNER_DELAY = 300

const showSpinner = ref(false)
let spinnerTimer = null

function stopSpinner() {
  clearTimeout(spinnerTimer)
  spinnerTimer = null
  showSpinner.value = false
}

function armSpinner() {
  stopSpinner()
  if (!original.value) return
  spinnerTimer = setTimeout(() => {
    if (!fullLoaded.value && !fullFailed.value) showSpinner.value = true
  }, SPINNER_DELAY)
}

function onFullLoaded() {
  fullLoaded.value = true
  stopSpinner()
}

function onFullFailed() {
  fullFailed.value = true
  stopSpinner()
}

watch(current, () => {
  fullLoaded.value = false
  fullFailed.value = false
  armSpinner()
})

function close() {
  emit('update:index', null)
  emit('close')
}

function step(delta) {
  const next = props.index + delta
  if (next < 0 || next >= props.items.length) return
  emit('update:index', next)
}

/** Keeps Tab inside the dialog while it is open. */
function trapFocus(event) {
  const focusable = dialog.value?.querySelectorAll(
    'button:not([disabled]), a[href], video[controls], [tabindex]:not([tabindex="-1"])',
  )
  if (!focusable?.length) return

  const first = focusable[0]
  const last = focusable[focusable.length - 1]

  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}

function onKeydown(event) {
  if (!open.value) return

  switch (event.key) {
    case 'Escape':
      event.preventDefault()
      close()
      break
    case 'ArrowLeft':
      event.preventDefault()
      step(-1)
      break
    case 'ArrowRight':
      event.preventDefault()
      step(1)
      break
    case 'Tab':
      trapFocus(event)
      break
  }
}

watch(open, async (isOpen) => {
  if (isOpen) {
    lastFocused = document.activeElement
    document.addEventListener('keydown', onKeydown)
    // Locking the body keeps the page behind from scrolling under the overlay.
    document.body.style.overflow = 'hidden'
    await nextTick()
    dialog.value?.focus()
  } else {
    document.removeEventListener('keydown', onKeydown)
    document.body.style.overflow = ''
    stopSpinner()
    // Return focus to the tile that opened the lightbox.
    lastFocused?.focus?.()
    lastFocused = null
  }
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown)
  document.body.style.overflow = ''
  stopSpinner()
})
</script>

<template>
  <Teleport to="body">
    <!--
      Everything except the media itself acts as one big close button, so a tap
      on any empty space dismisses the viewer. The overlay is always dark
      regardless of the app theme — a light lightbox behind photos looks wrong —
      and sits above Leaflet's map panes (z-index ~1000), which otherwise poke
      through on the day page.
    -->
    <div
      v-if="open && current"
      ref="dialog"
      class="fixed inset-0 z-[2000] flex flex-col bg-black/95 text-white"
      role="dialog"
      aria-modal="true"
      :aria-label="label"
      tabindex="-1"
      @click="close"
    >
      <div class="flex items-start justify-between gap-4 px-4 py-3" style="cursor: pointer;">
        <div class="min-w-0">
          <p class="truncate text-sm font-medium">{{ label }}</p>
          <p v-if="current.description" class="mt-1 line-clamp-2 text-xs text-white/70">
            {{ current.description }}
          </p>
        </div>

        <!-- Decorative: closing is handled by the backdrop click, so this is a
             plain icon rather than a separate button. -->
        <span class="shrink-0 p-2 text-white/70" aria-hidden="true">
          <svg
            class="h-5 w-5"
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
          >
            <path d="m5 5 10 10M15 5 5 15" stroke-linecap="round" />
          </svg>
        </span>
      </div>

      <div class="relative flex min-h-0 flex-1 items-center justify-center px-4 pb-4">
        <button
          v-if="hasPrev"
          type="button"
          class="absolute left-2 z-10 rounded-full bg-white/10 p-3 text-white transition hover:bg-white/20"
          :aria-label="t('media.prev')"
          @click.stop="step(-1)"
        >
          <svg
            class="h-5 w-5"
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            aria-hidden="true"
          >
            <path d="M12.5 4 6.5 10l6 6" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </button>

        <!--
          Both media stop the click from bubbling so interacting with them never
          closes the viewer.
        -->
        <video
          v-if="video"
          :key="current.id ?? current.fileName"
          :src="stream"
          :poster="preview"
          controls
          playsinline
          preload="metadata"
          class="max-h-full max-w-full rounded"
          @click.stop
        />
        <!--
          Two stages. The original is always fully opaque underneath; the preview
          the grid already fetched covers it and fades out once the original has
          arrived. Fading the top layer out — rather than fading the bottom one
          in — means there is never a frame where neither is opaque, which is
          what made the picture flash black on the swap. The preview is
          pointer-events-none, so clicks still reach the backdrop.
        -->
        <div
          v-else
          class="relative flex min-h-0 min-w-0 flex-1 items-center justify-center self-stretch"
        >
          <img
            :key="current.id ?? current.fileName"
            :src="original"
            :alt="label"
            class="max-h-full max-w-full rounded object-contain"
            @load="onFullLoaded"
            @error="onFullFailed"
            @click.stop
          />
          <img
            v-if="preview"
            :key="`preview-${current.id ?? current.fileName}`"
            :src="preview"
            alt=""
            aria-hidden="true"
            class="pointer-events-none absolute inset-0 h-full w-full rounded object-contain transition-opacity duration-300"
            :class="fullLoaded ? 'opacity-0' : 'opacity-100'"
          />
          <span
            v-if="showSpinner"
            class="pointer-events-none absolute inset-0 flex items-center justify-center"
            aria-hidden="true"
          >
            <span class="spinner h-9 w-9 rounded-full border-2 border-white/25 border-t-white/90" />
          </span>
        </div>

        <button
          v-if="hasNext"
          type="button"
          class="absolute right-2 z-10 rounded-full bg-white/10 p-3 text-white transition hover:bg-white/20"
          :aria-label="t('media.next')"
          @click.stop="step(1)"
        >
          <svg
            class="h-5 w-5"
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            aria-hidden="true"
          >
            <path d="M7.5 4l6 6-6 6" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </button>

        <!-- Bottom-right is the one corner no other control occupies. -->
        <div class="absolute bottom-2 right-2 z-10 flex items-center gap-1.5" @click.stop>
          <RouterLink
            v-if="dayDate"
            :to="{ name: 'day', params: { date: dayDate } }"
            class="rounded-full bg-white/10 p-2.5 text-white transition hover:bg-white/20"
            :title="t('media.openDay')"
            :aria-label="t('media.openDay')"
            @click="close"
          >
            <svg
              class="h-4 w-4"
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              stroke-width="1.6"
              aria-hidden="true"
            >
              <rect x="3" y="4.5" width="14" height="12.5" rx="2" />
              <path d="M3 8h14M7 3v3M13 3v3" stroke-linecap="round" />
            </svg>
          </RouterLink>

          <a
            v-if="download"
            :href="download"
            download
            target="_blank"
            rel="noopener noreferrer"
            class="rounded-full bg-white/10 p-2.5 text-white transition hover:bg-white/20"
            :title="t('media.download')"
            :aria-label="t('media.download')"
          >
            <svg
              class="h-4 w-4"
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              stroke-width="1.6"
              aria-hidden="true"
            >
              <path d="M10 3v9m0 0 3.5-3.5M10 12 6.5 8.5" stroke-linecap="round" stroke-linejoin="round" />
              <path d="M4 15.5h12" stroke-linecap="round" />
            </svg>
          </a>
        </div>
      </div>

      <div
        v-if="current.tags?.length"
        class="flex flex-wrap gap-1.5 border-t border-white/10 px-2 py-1.5"
        @click.stop
      >
        <!-- A tag navigates to its search; close the viewer so results are not
             left hidden behind it (the search route may reuse this view). -->
        <TagChip
          v-for="tag in current.tags"
          :key="tag"
          :tag="tag"
          class="!border-white/30 !text-white/80 hover:!border-white/60 hover:!text-white"
          @click="close"
        />
      </div>
    </div>
  </Teleport>
</template>
