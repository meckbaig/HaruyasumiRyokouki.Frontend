<script setup>
import { computed, ref, watch } from 'vue'
import { miniatureSrc, previewSrc } from '@/services/mediaAssets'

const props = defineProps({
  media: { type: Object, required: true },
  alt: { type: String, default: '' },
})

/*
  Two stages, and never one.

  Every file ships a `miniature`: a tiny base64 square that costs no request at
  all and is therefore on screen in the first frame. The real preview settles
  over it once it is whole — and only once it is whole, because a half-arrived
  `<img>` draws its own alt text and an empty box, and both used to show through.

  Handing a single `<img>` `preview || miniature` looks like the same thing and
  is not: it means an empty frame for as long as the network takes, and then the
  picture appearing out of nothing. This is the scheme the grid tiles have always
  used, kept in one place now that four different walls of thumbnails want it.
*/
const miniature = computed(() => miniatureSrc(props.media))
const src = computed(() => previewSrc(props.media))
const loaded = ref(false)

watch(src, () => {
  loaded.value = false
})

/**
 * `load` only means the bytes arrived — the browser still has to decode them,
 * and it does that while painting, which is what makes a fresh preview appear in
 * bands over the miniature. Awaiting `decode()` does that work first, so the
 * swap is a single clean frame. From cache it resolves at once.
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
      v-if="src"
      :src="src"
      :alt="alt"
      loading="lazy"
      decoding="async"
      draggable="false"
      class="pointer-events-none h-full w-full object-cover"
      :class="loaded ? 'opacity-100' : 'opacity-0'"
      @load="onLoaded"
    />
    <!-- Scaled well past the blur radius: blur bleeds inwards and leaves the
         edges semi-transparent, which would let the frame show through. -->
    <img
      v-if="miniature"
      :src="miniature"
      alt=""
      aria-hidden="true"
      draggable="false"
      class="pointer-events-none absolute inset-0 h-full w-full scale-105 object-cover blur-[10px] transition-opacity duration-300"
      :class="loaded ? 'opacity-0' : 'opacity-100'"
    />
  </div>
</template>
