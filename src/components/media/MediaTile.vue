<script setup>
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { miniatureSrc, previewSrc } from '@/services/mediaAssets'
import { isVideo } from '@/services/mediaType'
import { toggleFavorite } from '@/services/favorites'
import { useEditorStore } from '@/stores/editor'
import { useUiStore } from '@/stores/ui'

const props = defineProps({
  media: { type: Object, required: true },
  /**
   * `matched` and `expanded` are the search-result outlines: a dark border for
   * files that actually matched, a muted one for the rest of the day pulled in
   * by "show more".
   */
  variant: { type: String, default: 'normal' },
  editable: { type: Boolean, default: false },
  /** Singled out by a link (see composables/useMediaLink). */
  highlighted: { type: Boolean, default: false },
})

const emit = defineEmits(['open', 'edit'])

const { t } = useI18n()
const editor = useEditorStore()
const ui = useUiStore()

const video = computed(() => isVideo(props.media))
const selected = computed(() => editor.isSelected(props.media.id))
const label = computed(() => props.media.title || props.media.fileName || t('media.untitled'))

// The miniature is inline base64, so it paints with no request at all; the real
// preview fades in over it. Previews keep their original aspect ratio and are
// cropped to a square by `object-cover`.
const miniature = computed(() => miniatureSrc(props.media))
const src = computed(() => previewSrc(props.media))
const loaded = ref(false)
const failed = ref(false)

watch(src, () => {
  loaded.value = false
  failed.value = false
})

/**
 * `load` only means the bytes arrived — the browser still has to decode them,
 * and it does that while painting, which is what makes a fresh preview appear
 * in bands over the miniature. Awaiting `decode()` does that work first, so the
 * swap is a single clean frame. From cache it resolves immediately, which is
 * why a revisit already looked smooth.
 */
async function onLoaded(event) {
  const image = event.target
  try {
    await image.decode()
  } catch {
    // Decoding can reject if the source changed mid-flight; reveal regardless.
  }
  // The tile may have been recycled to another file while decoding. Compare the
  // bound attribute rather than `currentSrc`, which the browser resolves to an
  // absolute URL and would never match a relative one.
  if (image.isConnected && image.getAttribute('src') === src.value) loaded.value = true
}

const outlineClass = computed(() => {
  // A link singling this file out gets the same outline as a selection: both
  // mean "this one, out of all of these", and selection mode is an editor's
  // transient state, so the two are never on screen for the same reason at once.
  if (selected.value || props.highlighted) {
    return 'ring-2 ring-accent ring-offset-2 ring-offset-paper'
  }
  if (props.variant === 'matched') return 'ring-2 ring-ink'
  if (props.variant === 'expanded') return 'ring-1 ring-ink-faint/60'
  return 'ring-1 ring-edge'
})

/*
  The front-page mark.

  Sits opposite the pencil and appears the same way, with one difference: a file
  already marked keeps its star on show. The mark is the answer to "what have I
  picked out?", and a mark that only appears under the cursor cannot be scanned
  — nor reached at all on a phone, where nothing hovers.
*/
const favorite = computed(() => props.media.favorite === true)
const marking = ref(false)

/**
 * A request in flight is not a reason to disable the button: a disabled control
 * takes the "not allowed" cursor, and a mark that answers a click with a barred
 * circle reads as a refusal rather than as work already under way. Repeat clicks
 * are simply ignored, and `aria-busy` says so to anyone being read to.
 */
async function mark() {
  if (marking.value) return
  marking.value = true
  try {
    await toggleFavorite(props.media)
  } catch (error) {
    ui.notify(error?.detail || error?.title || t('errors.generic'), 'error')
  } finally {
    marking.value = false
  }
}

/**
 * The browser's own menu is replaced rather than merely suppressed — it was
 * already being suppressed, because a long press on a phone means "select" here
 * and the native menu got in the way of it. What takes its place is offered from
 * the page that owns the grid, which is the one that knows what a link to this
 * file would have to say.
 */
function onContextMenu(event) {
  emit('context', { media: props.media, x: event.clientX, y: event.clientY })
}

/**
 * Plain activation only. The press-and-drag paint gesture and the long-press
 * that enters selection mode both live in MediaGrid, which owns the pointer
 * events across the whole grid; this handler just decides open-vs-toggle for a
 * simple click.
 */
function activate() {
  if (props.editable && editor.selectionMode) {
    editor.toggle(props.media)
    return
  }
  emit('open', props.media)
}
</script>

<template>
  <div class="group relative" :data-media-id="media.id">
    <!-- `touch-pan-y`, not `touch-none`: the browser must keep handling vertical
         scrolling, or a finger landing on a tile pins the page. The paint
         gesture only needs the long press and the horizontal axis. -->
    <button
      type="button"
      class="block w-full touch-pan-y select-none overflow-hidden rounded-md bg-edge/40 transition"
      :class="outlineClass"
      :aria-label="label"
      :aria-pressed="editor.selectionMode ? selected : undefined"
      @click="activate"
      @contextmenu.prevent="onContextMenu"
    >
      <!-- Fixed square keeps the grid from reflowing while previews arrive. -->
      <div class="relative aspect-square">
        <!--
          The preview sits underneath and stays fully transparent until it has
          loaded: a half-loaded <img> renders its own alt text and an empty box,
          and both used to show through the blurred miniature above it.
        -->
        <img
          v-if="src && !failed"
          :src="src"
          :alt="label"
          loading="lazy"
          decoding="async"
          draggable="false"
          class="pointer-events-none h-full w-full object-cover"
          :class="loaded ? 'opacity-100' : 'opacity-0'"
          @load="onLoaded"
          @error="failed = true"
        />
        <!--
          Inline base64, so it is there immediately, and blurred because it is
          tiny. Blur bleeds inwards and leaves the edges semi-transparent, so the
          image is scaled well past the blur radius to keep the corners covered.
          It fades out only once the preview underneath is fully opaque, so one
          layer is always solid and the swap never flashes.
        -->
        <img
          v-if="miniature"
          :src="miniature"
          alt=""
          aria-hidden="true"
          draggable="false"
          class="pointer-events-none absolute inset-0 h-full w-full scale-105 object-cover blur-[10px] transition-opacity duration-300"
          :class="loaded ? 'opacity-0' : 'opacity-100'"
        />
        <div
          v-if="!miniature && (!src || failed)"
          class="absolute inset-0 flex items-center justify-center text-ink-faint"
        >
          <svg
            class="h-8 w-8"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.4"
            aria-hidden="true"
          >
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <path d="m4 16 5-5 4 4 2-2 5 5" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </div>

        <span
          v-if="video"
          class="pointer-events-none absolute bottom-1.5 left-1.5 flex items-center gap-1 rounded bg-ink/70 px-1.5 py-0.5 text-[10px] font-medium text-paper"
        >
          <svg class="h-3 w-3" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
            <path d="M3.5 2.5v7l6-3.5z" />
          </svg>
          {{ t('media.video') }}
        </span>

        <span
          v-if="selected"
          class="pointer-events-none absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-paper"
          aria-hidden="true"
        >
          <svg
            class="h-3 w-3"
            viewBox="0 0 12 12"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="m2.5 6.5 2.5 2.5 4.5-5" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </span>
      </div>
    </button>

    <!--
      Star on the left, pencil on the right. A marked file shows its star at all
      times; an unmarked one offers it the way the pencil is offered.
    -->
    <button
      v-if="editable && !editor.selectionMode"
      type="button"
      class="absolute left-1.5 top-1.5 rounded-md bg-paper/90 p-1.5 shadow-sm transition focus-visible:opacity-100 group-hover:opacity-100"
      :class="favorite ? 'text-star opacity-100' : 'text-ink opacity-0'"
      :aria-busy="marking"
      :aria-pressed="favorite"
      :aria-label="favorite ? t('media.unfavorite') : t('media.favorite')"
      @click.stop="mark"
    >
      <svg
        class="h-3.5 w-3.5"
        viewBox="0 0 16 16"
        :fill="favorite ? 'currentColor' : 'none'"
        stroke="currentColor"
        stroke-width="1.4"
        aria-hidden="true"
      >
        <path
          d="M8 1.8l1.9 3.9 4.3.6-3.1 3 .7 4.3L8 11.6l-3.8 2 .7-4.3-3.1-3 4.3-.6z"
          stroke-linejoin="round"
        />
      </svg>
    </button>

    <!-- Pencil stays hidden until hover or keyboard focus, per the brief. -->
    <button
      v-if="editable && !editor.selectionMode"
      type="button"
      class="absolute right-1.5 top-1.5 rounded-md bg-paper/90 p-1.5 text-ink opacity-0 shadow-sm transition group-hover:opacity-100 focus-visible:opacity-100"
      :aria-label="t('common.edit')"
      @click.stop="emit('edit', props.media)"
    >
      <svg
        class="h-3.5 w-3.5"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        stroke-width="1.6"
        aria-hidden="true"
      >
        <path d="M11 2.5 13.5 5 5.5 13H3v-2.5z" stroke-linejoin="round" />
      </svg>
    </button>
  </div>
</template>
