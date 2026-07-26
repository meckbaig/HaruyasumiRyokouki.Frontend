<script setup>
import { ref, computed, watch, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import MediaTile from './MediaTile.vue'
import { useEditorStore } from '@/stores/editor'

const props = defineProps({
  items: { type: Array, default: () => [] },
  variant: { type: String, default: 'normal' },
  editable: { type: Boolean, default: false },
  /** How many tiles to reveal at a time. */
  chunkSize: { type: Number, default: 60 },
})

const emit = defineEmits(['open', 'edit'])

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

let observer = null

watch(sentinel, (element) => {
  observer?.disconnect()
  if (!element) return

  observer = new IntersectionObserver(
    (entries) => {
      if (entries.some((entry) => entry.isIntersecting)) revealMore()
    },
    // Start loading slightly before the sentinel is actually on screen.
    { rootMargin: '600px 0px' },
  )
  observer.observe(element)
})

/**
 * Press-and-drag selection ("painting").
 *
 * The gesture is owned here rather than per-tile because it spans many tiles: a
 * pointer pressed on one tile and dragged across others must keep selecting the
 * ones it passes. On mouse a small drag starts it; on touch a long-press does,
 * so a normal swipe still scrolls the page. Each move recomputes the selection
 * from the snapshot taken at press time plus the origin→current range, so
 * dragging back shrinks it again. A gesture that painted suppresses the click
 * that follows, otherwise the tile under the finger would also toggle.
 */
const LONG_PRESS_MS = 450
const DRAG_THRESHOLD = 8

let gesture = null
let suppressClick = false

function dedupeById(list) {
  const seen = new Set()
  const result = []
  for (const media of list) {
    // `== null`: ids are integers and 0 is valid, so avoid a truthiness check.
    if (media?.id == null || seen.has(media.id)) continue
    seen.add(media.id)
    result.push(media)
  }
  return result
}

function paintTo(currentIndex) {
  if (!gesture) return
  const lo = Math.min(gesture.originIndex, currentIndex)
  const hi = Math.max(gesture.originIndex, currentIndex)
  const range = visibleItems.value.slice(lo, hi + 1)

  if (gesture.mode === 'remove') {
    // Painting from an already-selected tile clears the dragged range instead.
    const rangeIds = new Set(range.map((media) => media.id))
    editor.setSelection(gesture.baseItems.filter((media) => !rangeIds.has(media.id)))
  } else {
    editor.setSelection(dedupeById([...gesture.baseItems, ...range]))
  }
}

function beginPaint() {
  if (!gesture || gesture.painting) return
  gesture.painting = true
  clearLongPress()
  // The origin tile's state decides the whole stroke: start on a selected tile
  // to erase a range, on an empty one to add.
  gesture.mode = editor.isSelected(gesture.originItem?.id) ? 'remove' : 'add'
  paintTo(gesture.originIndex)
}

function clearLongPress() {
  if (gesture?.longPressTimer) {
    clearTimeout(gesture.longPressTimer)
    gesture.longPressTimer = null
  }
}

function onPointerDown(event) {
  if (!props.editable || event.button > 0) return

  // A drag that ended on a different tile fires no click, so a suppress flag set
  // then would linger and eat the next real tap. Clear it as each press starts.
  suppressClick = false

  const tileEl = event.target.closest?.('[data-media-index]')
  if (!tileEl || !container.value?.contains(tileEl)) return

  const originIndex = Number(tileEl.dataset.mediaIndex)
  gesture = {
    originIndex,
    originItem: visibleItems.value[originIndex],
    startX: event.clientX,
    startY: event.clientY,
    pointerType: event.pointerType,
    baseItems: [...editor.items],
    painting: false,
    mode: 'add',
    longPressTimer: null,
  }

  // A held press with no movement still enters selection mode — the touch way
  // in, and a mouse shortcut to select a single tile.
  gesture.longPressTimer = setTimeout(beginPaint, LONG_PRESS_MS)

  document.addEventListener('pointermove', onPointerMove, { passive: false })
  document.addEventListener('pointerup', onPointerUp)
  document.addEventListener('pointercancel', onPointerUp)
}

function onPointerMove(event) {
  if (!gesture) return

  if (!gesture.painting) {
    const dist = Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY)
    if (gesture.pointerType === 'mouse') {
      // Mouse: a drag beyond the threshold starts painting immediately.
      if (dist > DRAG_THRESHOLD) beginPaint()
      else return
    } else {
      // Touch/pen: any movement before the long-press fires means the user is
      // scrolling, not selecting. Abandon the gesture so the page scrolls.
      if (dist > DRAG_THRESHOLD) endGesture()
      return
    }
  }

  // Stop the drag from selecting text or scrolling the page while painting.
  event.preventDefault()

  const under = document.elementFromPoint(event.clientX, event.clientY)
  const tileEl = under?.closest?.('[data-media-index]')
  if (tileEl && container.value?.contains(tileEl)) {
    paintTo(Number(tileEl.dataset.mediaIndex))
  }
}

/** Tears down the active gesture and its listeners. */
function endGesture() {
  clearLongPress()
  gesture = null
  document.removeEventListener('pointermove', onPointerMove)
  document.removeEventListener('pointerup', onPointerUp)
  document.removeEventListener('pointercancel', onPointerUp)
}

function onPointerUp() {
  if (!gesture) return
  // A gesture that painted must eat the click that browsers fire afterwards.
  if (gesture.painting) suppressClick = true
  endGesture()
}

function onClickCapture(event) {
  if (!suppressClick) return
  event.stopPropagation()
  event.preventDefault()
  suppressClick = false
}

onBeforeUnmount(() => {
  observer?.disconnect()
  clearLongPress()
  document.removeEventListener('pointermove', onPointerMove)
  document.removeEventListener('pointerup', onPointerUp)
  document.removeEventListener('pointercancel', onPointerUp)
})
</script>

<template>
  <div>
    <div
      ref="container"
      class="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5"
      @pointerdown="onPointerDown"
      @click.capture="onClickCapture"
    >
      <MediaTile
        v-for="(media, i) in visibleItems"
        :key="media.id ?? media.fileName"
        :data-media-index="i"
        :media="media"
        :variant="variant"
        :editable="editable"
        @open="emit('open', $event)"
        @edit="emit('edit', $event)"
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
