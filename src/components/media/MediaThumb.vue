<script setup>
import { computed, ref, watch } from 'vue'
import { miniatureSrc, previewSrc } from '@/services/mediaAssets'

const props = defineProps({
  media: { type: Object, required: true },
  alt: { type: String, default: '' },
})

/*
  Two stages, and never one.

  The `miniature` costs no request and is on screen in the first frame; the real
  preview settles over it once it is whole. A single <img> given
  `preview || miniature` means an empty frame for as long as the network takes.
  See docs/features/media-grid-and-selection.md.
*/
const miniature = computed(() => miniatureSrc(props.media))
const src = computed(() => previewSrc(props.media))
const loaded = ref(false)
const failed = ref(false)

watch(src, () => {
  loaded.value = false
  failed.value = false
})

/**
 * `load` only means the bytes arrived; decoding happens during paint, which is
 * what makes a fresh preview appear in bands. `decode()` does it first.
 */
async function onLoaded(event) {
  const image = event.target
  try {
    await image.decode()
  } catch {
    // Decoding can reject if the source changed mid-flight; reveal regardless.
  }
  // Compare the bound attribute rather than `currentSrc`, which the browser
  // resolves to an absolute URL and would never match a relative one.
  if (image.isConnected && image.getAttribute('src') === src.value) loaded.value = true
}
</script>

<template>
  <div class="relative aspect-square overflow-hidden bg-edge/40">
    <img
      v-if="src && !failed"
      :src="src"
      :alt="alt"
      loading="lazy"
      decoding="async"
      draggable="false"
      class="pointer-events-none h-full w-full object-cover"
      :class="loaded ? 'opacity-100' : 'opacity-0'"
      @load="onLoaded"
      @error="failed = true"
    />
    <!-- Scaled past the blur radius: blur bleeds inwards and leaves the edges
         semi-transparent, which would let the frame show through. -->
    <img
      v-if="miniature"
      :src="miniature"
      alt=""
      aria-hidden="true"
      draggable="false"
      class="pointer-events-none absolute inset-0 h-full w-full scale-105 object-cover blur-[10px] transition-opacity duration-300"
      :class="loaded ? 'opacity-0' : 'opacity-100'"
    />
    <!-- Nothing to show at all: no miniature, and no preview that loads. -->
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
  </div>
</template>
