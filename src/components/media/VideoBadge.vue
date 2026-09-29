<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { isEmbeddedVideo } from '@/services/mediaType'

const props = defineProps({
  media: { type: Object, required: true },
})

const { t } = useI18n()

/*
  An externally hosted video shows its origin's own mark instead of a play glyph,
  so a wall tells the two apart at a glance. Which sources embed is decided in
  services/mediaType.js. See docs/features/media-grid-and-selection.md.
*/
const embedded = computed(() => isEmbeddedVideo(props.media))
</script>

<template>
  <span
    class="flex items-center gap-1 rounded bg-ink/70 px-1.5 py-0.5 text-[10px] font-medium text-paper"
  >
    <!--
      The origin's own mark for an embedded video: the brand red plate with the
      white play glyph, drawn as two paths so it reads as the logo rather than as
      a monochrome silhouette of it. A plain play triangle for a hosted video.
    -->
    <svg v-if="embedded" class="h-3.5 w-3.5" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#ff0033"
        d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814z"
      />
      <path fill="#ffffff" d="M9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
    </svg>
    <svg v-else class="h-3 w-3" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
      <path d="M3.5 2.5v7l6-3.5z" />
    </svg>
    {{ t('media.video') }}
  </span>
</template>
