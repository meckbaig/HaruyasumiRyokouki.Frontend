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
  showLegend: { type: Boolean, default: true },
})

const emit = defineEmits(['select'])

const { t } = useI18n()

const scroller = ref(null)
const canLeft = ref(false)
const canRight = ref(false)

const index = computed(() => {
  const map = new Map()
  for (const day of props.days) map.set(day.date, day)
  return map
})

const sortedDates = computed(() => props.days.map((day) => day.date).sort())

/**
 * Every month the trip spans, first to last, as a continuous ribbon. The whole
 * range is always rendered; `anchor` only decides where the ribbon is scrolled,
 * so picking a day never rebuilds the set of months — it slides into view,
 * clamped by the scroll bounds (February stays at the left edge, May at the
 * right, March and April centre). On a phone each column fills the width, so
 * exactly one month shows and the rest are a swipe (or an arrow) away.
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

function updateArrows() {
  const el = scroller.value
  if (!el) return
  canLeft.value = el.scrollLeft > 4
  canRight.value = el.scrollLeft < el.scrollWidth - el.clientWidth - 4
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

  target.scrollIntoView({ block: 'nearest', inline: 'center' })
  updateArrows()
}

/** Arrow buttons page the ribbon by roughly one screen width. */
function page(direction) {
  scroller.value?.scrollBy({ left: direction * scroller.value.clientWidth * 0.9, behavior: 'smooth' })
}

/**
 * Drag-to-scroll for the mouse. Touch already pans natively; on a desktop the
 * ribbon would otherwise only move via the arrows. A drag past a few pixels
 * suppresses the click so it does not also open the day under the cursor.
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
  updateArrows()
})

watch(
  () => [props.anchor, props.selected, months.value.length],
  async () => {
    await nextTick()
    scrollToAnchor()
  },
)

onBeforeUnmount(() => {
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
        @scroll="updateArrows"
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
          @select="emit('select', $event)"
        />
      </div>

      <!-- Translucent paging arrows, shown only when there is more that way. -->
      <button
        v-show="canLeft"
        type="button"
        class="absolute left-0 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-paper-raised/80 text-ink-soft shadow-sm ring-1 ring-edge backdrop-blur transition hover:text-ink"
        :aria-label="t('day.prev')"
        @click="page(-1)"
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
      </button>
      <button
        v-show="canRight"
        type="button"
        class="absolute right-0 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-paper-raised/80 text-ink-soft shadow-sm ring-1 ring-edge backdrop-blur transition hover:text-ink"
        :aria-label="t('day.next')"
        @click="page(1)"
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
      </button>
    </div>

    <ul v-if="showLegend" class="mt-4 flex flex-wrap justify-center gap-4 text-xs text-ink-faint">
      <li class="flex items-center gap-1.5">
        <span class="h-3 w-3 rounded-sm bg-edge/70" aria-hidden="true" />
        {{ t('calendar.ready') }}
      </li>
      <li class="flex items-center gap-1.5">
        <span class="h-3 w-3 rounded-sm ring-1 ring-inset ring-edge" aria-hidden="true" />
        {{ t('calendar.draft') }}
      </li>
      <li class="flex items-center gap-1.5">
        <span class="h-3 w-3 rounded-sm bg-ink" aria-hidden="true" />
        {{ t('calendar.hasMedia') }}
      </li>
    </ul>
  </section>
</template>
