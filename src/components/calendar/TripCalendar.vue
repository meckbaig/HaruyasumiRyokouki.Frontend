<script setup>
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import CalendarMonth from './CalendarMonth.vue'
import { parseIsoDate, startOfMonth, addMonths, toIsoDate } from '@/services/dates'

const props = defineProps({
  days: { type: Array, default: () => [] },
  /** Date whose month is scrolled into view; the selected day by default. */
  anchor: { type: String, default: null },
  selected: { type: String, default: null },
  rangeStart: { type: String, default: null },
  rangeEnd: { type: String, default: null },
  /** Words for the two ends of a range; see CalendarMonth. */
  rangeStartLabel: { type: String, default: '' },
  rangeEndLabel: { type: String, default: '' },
})

const emit = defineEmits(['select'])

const { t } = useI18n()

const scroller = ref(null)
/** The month nearest the ribbon's centre, lit in the dot row. */
const activeMonth = ref(0)
/** Which ends there is still something to scroll to. */
const canLeft = ref(false)
const canRight = ref(false)
/** Whether the ribbon is on screen; the page's vertical scroll reads this. */
const ribbonVisible = ref(false)
/** The edge chevrons, up while the page is scrolled over a visible ribbon. */
const showScrollHints = ref(false)
const HINTS_MS = 600
let hintsTimer = null
let seen = null

const index = computed(() => {
  const map = new Map()
  for (const day of props.days) map.set(day.date, day)
  return map
})

const sortedDates = computed(() => props.days.map((day) => day.date).sort())

/**
 * Every month the trip spans, as one ribbon. **Always rendered whole** - `anchor`
 * only decides where it is scrolled, so picking a day never rebuilds the set.
 * See docs/features/days-and-calendar.md.
 */
const months = computed(() => {
  const dates = sortedDates.value
  if (dates.length === 0) return []

  const first = startOfMonth(parseIsoDate(dates[0]))
  const last = startOfMonth(parseIsoDate(dates[dates.length - 1]))

  const result = []
  let cursor = first
  for (let guard = 0; guard < 60 && cursor <= last; guard += 1) {
    result.push(cursor)
    cursor = addMonths(cursor, 1)
  }
  return result
})

/**
 * Where the ribbon is: which month is centred, and which ends have more to
 * scroll to. Run on a scroll, a resize, and once the anchor is placed.
 */
function updateEdges() {
  const el = scroller.value
  if (!el) return
  canLeft.value = el.scrollLeft > 4
  canRight.value = el.scrollLeft < el.scrollWidth - el.clientWidth - 4

  // The month nearest the ribbon's middle is the one the dot row lights.
  const centre = el.scrollLeft + el.clientWidth / 2
  let nearest = 0
  let best = Infinity
  for (let i = 0; i < el.children.length; i += 1) {
    const child = el.children[i]
    const distance = Math.abs(child.offsetLeft + child.clientWidth / 2 - centre)
    if (distance < best) {
      best = distance
      nearest = i
    }
  }
  activeMonth.value = nearest
}

/**
 * Shows the chevrons and restarts `HINTS_MS`, so they stay while the page keeps
 * scrolling and fade once it stops. They are never controls - a press falls
 * through to the day cell under them.
 */
function flashHints() {
  showScrollHints.value = true
  clearTimeout(hintsTimer)
  hintsTimer = setTimeout(() => (showScrollHints.value = false), HINTS_MS)
}

/** Any vertical scroll of the page while the ribbon is on screen raises the
 *  chevrons; `flashHints` fades them once the scrolling stops. */
function onPageScroll() {
  if (ribbonVisible.value) flashHints()
}

/** Scrolls the anchor month into view horizontally, without moving the page. */
function scrollToAnchor() {
  const container = scroller.value
  if (!container) return

  const anchorIso = props.anchor ?? props.selected ?? sortedDates.value[0]
  if (!anchorIso) return

  const anchorMonth = toIsoDate(startOfMonth(parseIsoDate(anchorIso)))
  const target = container.querySelector(`[data-month="${anchorMonth}"]`)
  if (!target) return

  // Scrolled by hand, **never `scrollIntoView`** - that obliges every scrollable
  // ancestor, the page included, and drags the reader down to the calendar.
  container.scrollLeft = target.offsetLeft - (container.clientWidth - target.clientWidth) / 2
}

/**
 * Drag-to-scroll for the mouse. Touch already pans natively, and the mask tells
 * the desktop there is more; a drag past a few pixels suppresses the click so it
 * does not also open the day under the cursor.
 */
let drag = null
let suppressClick = false
// Reactive so the cursor reflects the drag; the ribbon itself is always
// select-none (see template) so a horizontal drag never highlights day numbers.
const dragging = ref(false)

function onPointerDown(event) {
  if (event.pointerType !== 'mouse' || event.button > 0) return
  drag = { startX: event.clientX, startScroll: scroller.value.scrollLeft, moved: false }
  dragging.value = true
  document.addEventListener('pointermove', onPointerMove)
  document.addEventListener('pointerup', onPointerUp)
}

function onPointerMove(event) {
  if (!drag) return
  const dx = event.clientX - drag.startX
  if (Math.abs(dx) > 4) drag.moved = true
  scroller.value.scrollLeft = drag.startScroll - dx
}

function onPointerUp() {
  if (drag?.moved) suppressClick = true
  drag = null
  dragging.value = false
  document.removeEventListener('pointermove', onPointerMove)
  document.removeEventListener('pointerup', onPointerUp)
}

function onClickCapture(event) {
  if (!suppressClick) return
  event.stopPropagation()
  event.preventDefault()
  suppressClick = false
}

onMounted(async () => {
  await nextTick()
  scrollToAnchor()
  updateEdges()
  window.addEventListener('resize', updateEdges)
  window.addEventListener('scroll', onPageScroll, { passive: true })

  // Track whether the ribbon is on screen; `onPageScroll` raises the chevrons
  // only while it is. Without the observer the ribbon is taken as always visible.
  if (typeof IntersectionObserver === 'function' && scroller.value) {
    seen = new IntersectionObserver((entries) => {
      ribbonVisible.value = entries.some((entry) => entry.isIntersecting)
    })
    seen.observe(scroller.value)
  } else {
    ribbonVisible.value = true
  }
})

watch(
  () => [props.anchor, props.selected, months.value.length],
  async () => {
    await nextTick()
    scrollToAnchor()
    updateEdges()
  },
)

onBeforeUnmount(() => {
  clearTimeout(hintsTimer)
  seen?.disconnect()
  window.removeEventListener('resize', updateEdges)
  window.removeEventListener('scroll', onPageScroll)
  document.removeEventListener('pointermove', onPointerMove)
  document.removeEventListener('pointerup', onPointerUp)
})
</script>

<template>
  <section :aria-label="t('calendar.title')">
    <div class="relative">
      <div
        ref="scroller"
        class="no-scrollbar flex snap-x snap-mandatory gap-6 overflow-x-auto scroll-smooth select-none"
        :class="dragging ? 'cursor-grabbing' : 'sm:cursor-grab'"
        @scroll.passive="updateEdges"
        @pointerdown="onPointerDown"
        @click.capture="onClickCapture"
      >
        <CalendarMonth
          v-for="month in months"
          :key="month.toISOString()"
          :data-month="toIsoDate(month)"
          class="w-full shrink-0 snap-center sm:w-64"
          :month="month"
          :index="index"
          :selected="selected"
          :range-start="rangeStart"
          :range-end="rangeEnd"
          :range-start-label="rangeStartLabel"
          :range-end-label="rangeEndLabel"
          @select="emit('select', $event)"
        />
      </div>

      <!-- Bare chevrons: a hint that the ribbon moves sideways, never a control.
           They come up as the ribbon reaches the screen and fade a moment later,
           and a press falls through to the day cell under them. -->
      <span
        class="pointer-events-none absolute left-1 top-1/2 z-10 -translate-y-1/2 text-ink-faint transition-opacity duration-200"
        :class="showScrollHints && canLeft ? 'opacity-100' : 'opacity-0'"
        aria-hidden="true"
      >
        <svg
          class="h-5 w-5"
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          aria-hidden="true"
        >
          <path d="M12.5 4 6.5 10l6 6" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </span>
      <span
        class="pointer-events-none absolute right-1 top-1/2 z-10 -translate-y-1/2 text-ink-faint transition-opacity duration-200"
        :class="showScrollHints && canRight ? 'opacity-100' : 'opacity-0'"
        aria-hidden="true"
      >
        <svg
          class="h-5 w-5"
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          aria-hidden="true"
        >
          <path d="M7.5 4l6 6-6 6" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </span>
    </div>

    <!-- Where the ribbon is: one quiet bar a month, the centred one a shade
         darker. The chevrons above are the arrival hint; the dots say how much
         of the trip there is. -->
    <ul v-if="months.length > 1" class="mt-2 flex justify-center gap-1" aria-hidden="true">
      <li
        v-for="(month, i) in months"
        :key="month.toISOString()"
        class="h-1 w-3 rounded-full transition-colors"
        :class="i === activeMonth ? 'bg-ink-faint' : 'bg-edge'"
      />
    </ul>
  </section>
</template>
