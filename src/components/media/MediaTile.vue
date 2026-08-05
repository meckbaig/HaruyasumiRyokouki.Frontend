<script setup>
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { miniatureSrc, previewSrc } from '@/services/mediaAssets'
import { isVideo } from '@/services/mediaType'
import { useIsMobile } from '@/composables/useIsMobile'
import { useEditorStore } from '@/stores/editor'

const props = defineProps({
  media: { type: Object, required: true },
  /**
   * `matched` and `expanded` are the search-result outlines: a dark border for
   * files that actually matched, a muted one for the rest of the day pulled in
   * by "show more".
   */
  variant: { type: String, default: 'normal' },
  editable: { type: Boolean, default: false },
})

const emit = defineEmits(['open', 'edit'])

const { t } = useI18n()
const editor = useEditorStore()

const video = computed(() => isVideo(props.media))
const selected = computed(() => editor.isSelected(props.media.id))
const label = computed(() => props.media.title || props.media.fileName || t('media.untitled'))

const isMobile = useIsMobile()

// The miniature is inline base64, so it paints with no request at all; the real
// preview fades in over it. Previews keep their original aspect ratio and are
// cropped to a square by `object-cover`.
const miniature = computed(() => miniatureSrc(props.media))
const src = computed(() => previewSrc(props.media, isMobile.value))
const loaded = ref(false)
const failed = ref(false)

watch(src, () => {
  loaded.value = false
  failed.value = false
})

const outlineClass = computed(() => {
  if (selected.value) return 'ring-2 ring-accent ring-offset-2 ring-offset-paper'
  if (props.variant === 'matched') return 'ring-2 ring-ink'
  if (props.variant === 'expanded') return 'ring-1 ring-ink-faint/60'
  return 'ring-1 ring-edge'
})

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
  <div class="group relative">
    <button
      type="button"
      class="block w-full touch-none select-none overflow-hidden rounded-md bg-edge/40 transition"
      :class="outlineClass"
      :aria-label="label"
      :aria-pressed="editor.selectionMode ? selected : undefined"
      @click="activate"
      @contextmenu.prevent
    >
      <!-- Fixed square keeps the grid from reflowing while previews arrive. -->
      <div class="relative aspect-square">
        <!-- Placeholder underneath: inline base64, so it is there immediately. -->
        <img
          v-if="miniature && !loaded"
          :src="miniature"
          alt=""
          aria-hidden="true"
          draggable="false"
          class="pointer-events-none absolute inset-0 h-full w-full object-cover"
        />
        <img
          v-if="src && !failed"
          :src="src"
          :alt="label"
          loading="lazy"
          decoding="async"
          draggable="false"
          class="pointer-events-none h-full w-full object-cover transition-opacity duration-200"
          :class="loaded ? 'opacity-100' : 'opacity-0'"
          @load="loaded = true"
          @error="failed = true"
        />
        <div
          v-else-if="!miniature"
          class="flex h-full w-full items-center justify-center text-ink-faint"
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
