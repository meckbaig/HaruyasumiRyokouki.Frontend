<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useUiStore } from '@/stores/ui'
import { pickTranslation } from '@/services/translations'
import { miniatureSrc, previewSrc } from '@/services/mediaAssets'
import { formatShortTime } from '@/services/dates'

/**
 * The card shown beside a media reference in a text. Positioned in **document**
 * coordinates so it scrolls with the page rather than hanging over it.
 * See docs/features/rich-text-and-links.md.
 */
const props = defineProps({
  /** The file the reference resolved to, or null when it is not on this page. */
  media: { type: Object, default: null },
  /** The reference's own text, shown when the file is missing. */
  label: { type: String, default: '' },
  /** Viewport rectangle of the element the card belongs to. */
  anchorRect: { type: Object, default: null },
})

const emit = defineEmits(['open', 'close', 'enter', 'leave'])

const { t } = useI18n()
const ui = useUiStore()

const translation = computed(() => pickTranslation(props.media, ui.locale))
const title = computed(
  () => translation.value.title || props.media?.fileName || t('media.untitled'),
)
const description = computed(() => translation.value.description)
const thumb = computed(() => previewSrc(props.media) || miniatureSrc(props.media))
/* The clock alone: the card is always shown over a day page, so the date is a
   fact the reader already has. */
const stamp = computed(() =>
  props.media ? formatShortTime(props.media.created, ui.locale) : '',
)

/** Fixed width, so it can be placed to the right and flipped before painting. */
const CARD_WIDTH = 384
const GAP = 8

const position = computed(() => {
  const rect = props.anchorRect
  if (!rect) return {}
  const { scrollX, scrollY, innerWidth } = window
  let left = rect.right + scrollX + GAP
  if (rect.right + GAP + CARD_WIDTH > innerWidth) {
    left = Math.max(scrollX + GAP, rect.left + scrollX - CARD_WIDTH - GAP)
  }
  const top = Math.max(scrollY + GAP, rect.top + scrollY - GAP)
  return { top: `${Math.round(top)}px`, left: `${Math.round(left)}px` }
})
</script>

<template>
  <div
    class="media-hover-card"
    :style="position"
    @mouseenter="emit('enter')"
    @mouseleave="emit('leave')"
  >
    <!-- A way out by hand, in case the timeout runs while the pointer is away. -->
    <button
      type="button"
      class="absolute right-1 top-1 rounded-full p-1 text-ink-faint transition hover:text-ink"
      :aria-label="t('common.close')"
      @click="emit('close')"
    >
      <svg
        class="h-3.5 w-3.5"
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        aria-hidden="true"
      >
        <path d="m5 5 10 10M15 5 5 15" stroke-linecap="round" />
      </svg>
    </button>

    <div v-if="media" class="flex gap-3 pr-5">
      <!-- Square thumbnail on the left; the whole card's subject. -->
      <button
        type="button"
        class="relative h-40 w-40 shrink-0 overflow-hidden rounded bg-edge/40"
        :title="t('richText.openMedia')"
        :aria-label="t('richText.openMedia')"
        @click="emit('open')"
      >
        <img :src="thumb" :alt="title" class="h-full w-full object-cover" draggable="false" />
        <!-- Stamped on the picture, the way a day's own tiles do it. -->
        <span
          v-if="stamp"
          class="pointer-events-none absolute bottom-1.5 right-1.5 rounded bg-ink/70 px-1.5 py-0.5 text-[10px] font-medium text-paper"
        >
          {{ stamp }}
        </span>
      </button>

      <div class="flex h-40 min-w-0 flex-1 flex-col">
        <p class="line-clamp-2 text-sm font-medium text-ink">{{ title }}</p>
        <p v-if="description" class="mt-0.5 line-clamp-3 text-xs text-ink-soft">
          {{ description }}
        </p>
      </div>
    </div>

    <!-- The file is gone or was never on this page; say so plainly. -->
    <div v-else class="flex items-center gap-3 pr-5">
      <span
        class="flex h-40 w-40 shrink-0 items-center justify-center rounded bg-edge/40 text-ink-faint"
        aria-hidden="true"
      >
        <svg
          class="h-6 w-6"
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
        >
          <rect x="3" y="4" width="14" height="12" rx="2" />
          <path d="m3.5 13 4-4 3 3 2.5-2.5 3.5 3.5" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </span>
      <div class="min-w-0 flex-1">
        <p class="text-sm font-medium text-ink">{{ t('richText.mediaMissing') }}</p>
        <p class="mt-0.5 text-xs text-ink-soft">{{ t('richText.mediaMissingHint') }}</p>
        <p v-if="label" class="mt-1 truncate text-[11px] text-ink-faint">{{ label }}</p>
      </div>
    </div>
  </div>
</template>
