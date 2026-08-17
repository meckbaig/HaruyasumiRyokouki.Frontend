<script setup>
import { ref, computed, watch, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import MediaTile from './MediaTile.vue'
import { useEditorStore } from '@/stores/editor'
import { cascadeDelay } from '@/services/cascade'
import { useTilePaint } from '@/composables/useTilePaint'

const props = defineProps({
  items: { type: Array, default: () => [] },
  variant: { type: String, default: 'normal' },
  editable: { type: Boolean, default: false },
  /** Id of the file a link singled out, outlined wherever it sits in the list. */
  highlightedId: { type: Number, default: null },
  /** Stamps each tile with the day its file was taken; see MediaTile. */
  showDate: { type: Boolean, default: false },
  /** Keeps the pencil and the star on show without a cursor; see MediaTile. */
  touchControls: { type: Boolean, default: false },
  /**
   * Lets the tiles arrive one after another instead of all at once. For a page
   * that is nothing but a grid; where the grid is one section among many, the
   * page's own arrival already covers it.
   */
  cascade: { type: Boolean, default: false },
  /** How many tiles to reveal at a time. */
  chunkSize: { type: Number, default: 60 },
  /**
   * Whether reaching the end of the list reveals the next chunk by itself.
   *
   * On a page that is only this grid, it should: the reader scrolling on is
   * asking for more by the act of scrolling, and a button in the way is a toll.
   *
   * Where the grid is one section among several, it must not. The queue of
   * unfiled media sits above the queue of unwritten days, and with a few
   * thousand files waiting the grid grew a chunk every time the bottom came near
   * — so the days below it could not be reached at all. There the button is the
   * only way past.
   */
  autoReveal: { type: Boolean, default: true },
})

const emit = defineEmits(['open', 'edit', 'context'])

const { t } = useI18n()
const editor = useEditorStore()

/**
 * Client-side pagination.
 *
 * The API deliberately returns every result in one response, so the throttling
 * happens here: only `visibleCount` tiles are ever in the DOM, and the next
 * chunk is revealed when the sentinel at the end of the list scrolls into view.
 */
const container = ref(null)
const visibleCount = ref(props.chunkSize)
const sentinel = ref(null)

const visibleItems = computed(() => props.items.slice(0, visibleCount.value))
const hasMore = computed(() => visibleCount.value < props.items.length)

// A new result set has to start from the first chunk again.
watch(
  () => props.items,
  () => {
    visibleCount.value = props.chunkSize
  },
)

function revealMore() {
  if (!hasMore.value) return
  visibleCount.value = Math.min(visibleCount.value + props.chunkSize, props.items.length)
}

/**
 * A linked file has to be in the DOM to be outlined or scrolled to, and it may
 * sit past the first chunk — the eightieth photo of a day is one link away like
 * any other. Revealing up to it is enough; the rest still waits for the reader.
 */
watch(
  [() => props.highlightedId, () => props.items],
  ([id]) => {
    if (id == null) return
    const index = props.items.findIndex((media) => media.id === id)
    if (index >= visibleCount.value) visibleCount.value = index + 1
  },
  { immediate: true },
)

let observer = null

watch(sentinel, (element) => {
  observer?.disconnect()
  if (!element || !props.autoReveal) return

  observer = new IntersectionObserver(
    (entries) => {
      if (entries.some((entry) => entry.isIntersecting)) revealMore()
    },
    // Start loading slightly before the sentinel is actually on screen.
    { rootMargin: '600px 0px' },
  )
  observer.observe(element)
})

/*
  Press-and-drag selection lives in `composables/useTilePaint`, shared with the
  other walls of thumbnails that need it — the "similar" panel in the media
  editor and the tag-collecting screen. What differs between them is only what
  "selected" means, so this supplies the four functions that say it.
*/
const paint = useTilePaint({
  container,
  idAt: (index) => visibleItems.value[index]?.id ?? null,
  snapshot: () => editor.items.map((media) => media.id),
  isSelected: (id) => editor.isSelected(id),
  apply: (ids) => {
    // The store keeps whole media objects, not ids: a bulk edit needs the files
    // themselves, and they can come from several days at once.
    const known = new Map(
      [...editor.items, ...visibleItems.value].map((media) => [media.id, media]),
    )
    editor.setSelection(ids.map((id) => known.get(id)).filter(Boolean))
  },
  enabled: () => props.editable,
  armed: () => editor.selectionMode,
})

onBeforeUnmount(() => {
  observer?.disconnect()
})
</script>

<template>
  <div>
    <div
      ref="container"
      class="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5"
      @pointerdown="paint.onPointerDown"
      @touchstart.passive="paint.onTouchStart"
      @click.capture="paint.onClickCapture"
    >
      <MediaTile
        v-for="(media, i) in visibleItems"
        :key="media.id ?? media.fileName"
        :data-tile-index="i"
        :class="cascade ? 'cascade-item' : ''"
        :style="cascade ? cascadeDelay(i) : undefined"
        :media="media"
        :variant="variant"
        :editable="editable"
        :show-date="showDate"
        :touch-controls="touchControls"
        :highlighted="highlightedId != null && media.id === highlightedId"
        @open="emit('open', $event)"
        @edit="emit('edit', $event)"
        @context="emit('context', $event)"
      />
    </div>

    <div v-if="hasMore" ref="sentinel" class="mt-6 flex flex-col items-center gap-2">
      <button
        type="button"
        class="rounded-md border border-edge px-4 py-2 text-sm text-ink-soft transition hover:border-ink-faint hover:text-ink"
        @click="revealMore"
      >
        {{ t('media.showMore') }}
      </button>
      <p class="text-xs text-ink-faint">
        {{ t('media.shownOf', { shown: visibleItems.length, total: items.length }) }}
      </p>
    </div>
  </div>
</template>
