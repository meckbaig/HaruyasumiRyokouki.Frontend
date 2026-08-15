<script setup>
import { ref, computed, watch, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import MediaTile from './MediaTile.vue'
import { useEditorStore } from '@/stores/editor'
import { cascadeDelay } from '@/services/cascade'

const props = defineProps({
  items: { type: Array, default: () => [] },
  variant: { type: String, default: 'normal' },
  editable: { type: Boolean, default: false },
  /** Id of the file a link singled out, outlined wherever it sits in the list. */
  highlightedId: { type: Number, default: null },
  /** Stamps each tile with the day its file was taken; see MediaTile. */
  showDate: { type: Boolean, default: false },
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
/** Fingers wander: a press held still on a phone still drifts several pixels. */
const TOUCH_THRESHOLD = 24

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

/** Shared setup for both input paths: which tile was pressed, and from where. */
function startGesture(target, x, y, pointerType) {
  // A drag that ended on a different tile fires no click, so a suppress flag set
  // then would linger and eat the next real tap. Clear it as each press starts.
  suppressClick = false

  const tileEl = target?.closest?.('[data-media-index]')
  if (!tileEl || !container.value?.contains(tileEl)) return false

  const originIndex = Number(tileEl.dataset.mediaIndex)
  gesture = {
    originIndex,
    originItem: visibleItems.value[originIndex],
    startX: x,
    startY: y,
    pointerType,
    baseItems: [...editor.items],
    painting: false,
    mode: 'add',
    longPressTimer: null,
  }

  // A held press with no movement still enters selection mode — the touch way
  // in, and a mouse shortcut to select a single tile.
  gesture.longPressTimer = setTimeout(beginPaint, LONG_PRESS_MS)
  return true
}

function onPointerDown(event) {
  // Touch runs on the touch events below; pointer events would duplicate it.
  if (!props.editable || event.button > 0 || event.pointerType !== 'mouse') return
  if (!startGesture(event.target, event.clientX, event.clientY, 'mouse')) return

  document.addEventListener('pointermove', onPointerMove)
  document.addEventListener('pointerup', onPointerUp)
  document.addEventListener('pointercancel', onPointerUp)
}

/*
  Touch takes its own path rather than sharing the pointer one.

  A browser hands out pointer events only until it decides the gesture belongs to
  it — the moment it starts scrolling the page it cancels the stream and sends
  nothing more. A press held still on a phone is exactly the case it guesses
  wrong, which is why the long press worked with a mouse and inside a devtools
  emulator, where nothing competes for the gesture, and never on a real device.
  Touch events keep arriving throughout, and `preventDefault` on a touchmove
  genuinely stops the page from scrolling once painting has begun — something a
  pointermove cannot do.
*/
function onTouchStart(event) {
  if (!props.editable || event.touches.length !== 1) return

  const touch = event.touches[0]
  if (!startGesture(event.target, touch.clientX, touch.clientY, 'touch')) return

  document.addEventListener('touchmove', onTouchMove, { passive: false })
  document.addEventListener('touchend', onTouchEnd)
  document.addEventListener('touchcancel', onTouchEnd)
}

function onTouchMove(event) {
  if (!gesture) return
  const touch = event.touches[0]
  if (!touch) return

  if (!gesture.painting) {
    const dx = touch.clientX - gesture.startX
    const dy = touch.clientY - gesture.startY
    if (Math.hypot(dx, dy) <= TOUCH_THRESHOLD) return

    /*
      Once a selection is open the finger is already in that mode, so a sideways
      drag extends it straight away — the long press is only the way *into*
      selection, not a toll on every stroke afterwards. Vertical movement always
      means scrolling and hands the gesture back to the browser.
    */
    if (editor.selectionMode && Math.abs(dx) > Math.abs(dy)) beginPaint()
    else {
      endGesture()
      return
    }
  }

  // Painting: hold the page still and paint across whatever is under the finger.
  if (event.cancelable) event.preventDefault()

  const under = document.elementFromPoint(touch.clientX, touch.clientY)
  const tileEl = under?.closest?.('[data-media-index]')
  if (tileEl && container.value?.contains(tileEl)) {
    paintTo(Number(tileEl.dataset.mediaIndex))
  }
}

function onTouchEnd() {
  if (!gesture) return
  if (gesture.painting) suppressClick = true
  endGesture()
}

function onPointerMove(event) {
  if (!gesture) return

  if (!gesture.painting) {
    // Mouse: a drag beyond the threshold starts painting immediately.
    const dist = Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY)
    if (dist > DRAG_THRESHOLD) beginPaint()
    else return
  }

  // Stop the drag from selecting text while painting.
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
  document.removeEventListener('touchmove', onTouchMove)
  document.removeEventListener('touchend', onTouchEnd)
  document.removeEventListener('touchcancel', onTouchEnd)
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
  endGesture()
})
</script>

<template>
  <div>
    <div
      ref="container"
      class="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5"
      @pointerdown="onPointerDown"
      @touchstart.passive="onTouchStart"
      @click.capture="onClickCapture"
    >
      <MediaTile
        v-for="(media, i) in visibleItems"
        :key="media.id ?? media.fileName"
        :data-media-index="i"
        :class="cascade ? 'cascade-item' : ''"
        :style="cascade ? cascadeDelay(i) : undefined"
        :media="media"
        :variant="variant"
        :editable="editable"
        :show-date="showDate"
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
