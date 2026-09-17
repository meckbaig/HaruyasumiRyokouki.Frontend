<script setup>
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import MediaTile from './MediaTile.vue'
import { useEditorStore } from '@/stores/editor'
import { cascadeDelay } from '@/services/cascade'
import { blockOutlinePath } from '@/services/blockOutline'
import { useTilePaint } from '@/composables/useTilePaint'

const props = defineProps({
  items: { type: Array, default: () => [] },
  editable: { type: Boolean, default: false },
  /** Id of the file a link singled out, outlined wherever it sits in the list. */
  highlightedId: { type: Number, default: null },
  /** Ids a note reference named, all outlined together as one block. */
  highlightedIds: { type: Array, default: () => [] },
  /** Dims every file not singled out, for a moment after a link is followed. */
  emphasis: { type: Boolean, default: false },
  /** Dims every tile, lifting the dim on the one the cursor is over. */
  dimmed: { type: Boolean, default: false },
  /** Stamps each tile with the day its file was taken; see MediaTile. */
  showDate: { type: Boolean, default: false },
  /** Shows the clock time on approach; see MediaTile. */
  showTime: { type: Boolean, default: false },
  /** Keeps the pencil and the star on show without a cursor; see MediaTile. */
  touchControls: { type: Boolean, default: false },
  /** Lets the tiles arrive one after another instead of all at once. */
  cascade: { type: Boolean, default: false },
  chunkSize: { type: Number, default: 60 },
  /**
   * Whether the end of the list reveals the next chunk by itself. **Must be false
   * where the grid is one section among several**, or nothing below it can be
   * reached. See docs/features/media-grid-and-selection.md.
   */
  autoReveal: { type: Boolean, default: true },
  /**
   * Pages the wall to this many rows and hides the rest behind one "show all"
   * button, so a day's map is reachable without scrolling past every file. Null
   * keeps the plain chunked behaviour.
   * See docs/features/media-grid-and-selection.md.
   */
  previewRows: { type: Number, default: null },
})

const emit = defineEmits(['open', 'edit', 'context'])

const { t } = useI18n()
const editor = useEditorStore()

/** Everything singled out right now: the link's one file, or a note's several. */
const highlightSet = computed(() => {
  const set = new Set(props.highlightedIds)
  if (props.highlightedId != null) set.add(props.highlightedId)
  return set
})

/**
 * Client-side pagination.
 *
 * The API deliberately returns every result in one response, so the throttling
 * happens here: only `visibleCount` tiles are ever in the DOM, and the next
 * chunk is revealed when the sentinel at the end of the list scrolls into view.
 *
 * Given `previewRows`, the wall instead opens on that many rows and keeps the
 * rest behind a single button, so the map below a long day is not a long scroll
 * away. A link into the wall turns the page off before the first tile is drawn.
 * See docs/features/media-grid-and-selection.md.
 */
const container = ref(null)
const visibleCount = ref(props.chunkSize)
const sentinel = ref(null)
/** Set once the reader - or a link - has asked for the whole wall. */
const expanded = ref(false)

/** How many tiles a row holds at this width; the wall's own breakpoints. */
const columnCount = ref(2)

function measureColumns() {
  const width = window.innerWidth
  columnCount.value = width >= 1024 ? 5 : width >= 768 ? 4 : width >= 640 ? 3 : 2
}

/** Tiles a `previewRows`-row page holds, or null for plain chunking. */
const previewLimit = computed(() =>
  props.previewRows ? props.previewRows * columnCount.value : null,
)

/** How many tiles a link needs in the DOM: one past the last file it names. */
const linkedReach = computed(() => {
  if (!highlightSet.value.size) return 0
  let reach = 0
  props.items.forEach((media, index) => {
    if (highlightSet.value.has(media?.id)) reach = Math.max(reach, index + 1)
  })
  return reach
})

/*
  The floor stays after the link is gone: the reader closed the viewer while
  looking at that tile, and folding the wall out from under them would be worse
  than showing a few more than the page holds.
*/
const reachFloor = ref(0)

/** How many tiles are shown right now, once the page and the link agree. */
const effectiveCount = computed(() => {
  if (expanded.value) return props.items.length
  const base = previewLimit.value ?? visibleCount.value
  return Math.min(props.items.length, Math.max(base, reachFloor.value))
})

const visibleItems = computed(() => props.items.slice(0, effectiveCount.value))
const hasMore = computed(() => effectiveCount.value < props.items.length)

/*
  A new result set restarts from the first page - but a **shrunken** one does
  not, or approving one file folds four hundred revealed thumbnails back to
  sixty. See docs/features/media-grid-and-selection.md.
*/
let knownIds = new Set()

watch(
  () => props.items,
  (items) => {
    const ids = new Set(items.map((media) => media?.id))
    const shrunk = items.every((media) => knownIds.has(media?.id))
    knownIds = ids

    if (shrunk) {
      visibleCount.value = Math.max(
        props.chunkSize,
        Math.min(visibleCount.value, items.length),
      )
      return
    }

    reachFloor.value = 0
    // A fresh set starts paged - unless the address already names a file in it,
    // and then the page is off before the first tile appears.
    expanded.value = previewLimit.value != null && linkedReach.value > 0

    if (expanded.value) visibleCount.value = items.length
    else if (previewLimit.value != null) visibleCount.value = previewLimit.value
    else visibleCount.value = props.chunkSize
  },
  { immediate: true },
)

/*
  A link reaches into the wall. A **paged** wall opens whole - the reader is
  being taken to a file, and a page cut off just past it would leave the rest
  behind a button for no reason. An ordinary chunked wall only grows far enough
  to hold the file named. See docs/features/media-grid-and-selection.md.
*/
watch(
  linkedReach,
  (reach) => {
    if (reach <= 0) return
    if (previewLimit.value != null) {
      expanded.value = true
      return
    }
    if (reach > reachFloor.value) reachFloor.value = reach
  },
  { immediate: true },
)

// A narrower or wider window changes how many rows a page holds.
watch(previewLimit, (limit) => {
  if (limit == null || expanded.value) return
  visibleCount.value = limit
})

function revealMore() {
  if (!hasMore.value) return
  // A paged wall reveals whole, so one press reaches the map at the bottom.
  if (previewLimit.value != null) {
    expanded.value = true
    return
  }
  visibleCount.value = Math.min(visibleCount.value + props.chunkSize, props.items.length)
}

let observer = null

watch(sentinel, (element) => {
  observer?.disconnect()
  // A paged wall has no sentinel to reveal from; its button is the only way on.
  if (!element || !props.autoReveal || props.previewRows) return

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
  other walls of thumbnails that need it - the "similar" panel in the media
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

/*
  The outline around a block of singled-out files: one stroked centreline, the
  same 2px band and corner radius as the editor's selection ring, so adjacent
  tiles are glued and inner and outer corners are rounded alike.
  See docs/features/media-grid-and-selection.md.
*/
const outlinePath = ref('')

function computeOutlines() {
  const set = highlightSet.value
  const element = container.value
  if (!set.size || !element) {
    outlinePath.value = ''
    return
  }

  const gap = parseFloat(getComputedStyle(element).columnGap)
  const tiles = []
  for (const tile of element.querySelectorAll('[data-media-id]')) {
    /*
      `offset*`, never `getBoundingClientRect`: the tiles arrive with a
      `cascade-in` translate, and a rect read mid-arrival (a page loaded with a
      link already in the address) left the whole outline a few pixels low. Layout
      offsets ignore the transform and are relative to this container.
    */
    if (!tile.offsetWidth) continue
    tiles.push({
      selected: set.has(Number(tile.dataset.mediaId)),
      rect: {
        left: tile.offsetLeft,
        top: tile.offsetTop,
        width: tile.offsetWidth,
        height: tile.offsetHeight,
      },
    })
  }
  outlinePath.value = blockOutlinePath(tiles, gap)
}

let outlineObserver = null

watch(
  [highlightSet, visibleItems],
  () => nextTick(computeOutlines),
  { flush: 'post' },
)

function watchContainer(element) {
  outlineObserver?.disconnect()
  if (!element) return
  if (typeof ResizeObserver !== 'undefined') {
    outlineObserver = new ResizeObserver(() => computeOutlines())
    outlineObserver.observe(element)
  }
}

watch(container, watchContainer)
onMounted(() => {
  watchContainer(container.value)
  measureColumns()
  window.addEventListener('resize', computeOutlines)
  window.addEventListener('resize', measureColumns)
})

onBeforeUnmount(() => {
  observer?.disconnect()
  outlineObserver?.disconnect()
  window.removeEventListener('resize', computeOutlines)
  window.removeEventListener('resize', measureColumns)
})
</script>

<template>
  <div>
    <div
      ref="container"
      class="relative grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5"
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
        :dimmed="dimmed"
        :editable="editable"
        :show-date="showDate"
        :show-time="showTime"
        :touch-controls="touchControls"
        :faded="emphasis && !highlightSet.has(media.id)"
        @open="emit('open', $event)"
        @edit="emit('edit', $event)"
        @context="emit('context', $event)"
      />

      <!-- One path, stroked: the band wraps the whole block, glued at the gaps
           and rounded at every corner. See media-grid-and-selection.md. -->
      <Transition name="tile-outline">
        <svg
          v-if="outlinePath"
          class="tile-outline-svg absolute inset-0 h-full w-full overflow-visible"
          aria-hidden="true"
        >
          <path :d="outlinePath" />
        </svg>
      </Transition>
    </div>

    <div v-if="hasMore" ref="sentinel" class="mt-6 flex flex-col items-center gap-2">
      <button
        type="button"
        class="rounded-md border border-edge px-4 py-2 text-sm text-ink-soft transition hover:border-ink-faint hover:text-ink"
        @click="revealMore"
      >
        {{ previewLimit ? t('media.showAll') : t('media.showMore') }}
      </button>
      <p class="text-xs text-ink-faint">
        {{ t('media.shownOf', { shown: visibleItems.length, total: items.length }) }}
      </p>
    </div>
  </div>
</template>
