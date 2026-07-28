<script setup>
import { computed, ref, watch, nextTick, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import { originalUrl, posterUrl, videoUrl } from '@/services/mediaUrl'
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
    // Return focus to the tile that opened the lightbox.
    lastFocused?.focus?.()
    lastFocused = null
  }
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown)
  document.body.style.overflow = ''
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
          Video streams the real file over WebDAV (the preview endpoint yields
          only a still). Both media stop the click from bubbling so interacting
          with them never closes the viewer.
        -->
        <video
          v-if="video"
          :key="current.id ?? current.fileName"
          :src="videoUrl(current.fileName)"
          :poster="posterUrl(current.fileName)"
          controls
          autoplay
          playsinline
          class="max-h-full max-w-full rounded"
          @click.stop
        />
        <img
          v-else
          :key="current.id ?? current.fileName"
          :src="originalUrl(current.fileName)"
          :alt="label"
          class="max-h-full max-w-full rounded object-contain"
          @click.stop
        />

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
      </div>

      <div
        v-if="current.tags?.length"
        class="flex flex-wrap gap-1.5 border-t border-white/10 px-4 py-3"
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
