<script setup>
import { computed } from 'vue'
import { monthGrid, weekdayLabels, formatMonthTitle } from '@/services/dates'
import { useUiStore } from '@/stores/ui'

const props = defineProps({
  /** Any date inside the month to render. */
  month: { type: Date, required: true },
  /** Map of ISO date -> DayShortDto, for the days that exist in the timeline. */
  index: { type: Object, required: true },
  selected: { type: String, default: null },
  rangeStart: { type: String, default: null },
  rangeEnd: { type: String, default: null },
  /**
   * Words for the two ends of the range, shown as tabs above the picked days.
   *
   * Blank on the day page, where the calendar picks one date and there is no
   * range to name. On the trip map there is, and without them a calendar that
   * answers the first click with one dark square says nothing at all about what
   * the second click is for.
   */
  rangeStartLabel: { type: String, default: '' },
  rangeEndLabel: { type: String, default: '' },
})

const emit = defineEmits(['select'])

const ui = useUiStore()

const cells = computed(() => monthGrid(props.month))
const weekdays = computed(() => weekdayLabels(ui.locale))
const title = computed(() => formatMonthTitle(props.month, ui.locale))

function dayOf(iso) {
  return props.index.get?.(iso) ?? props.index[iso] ?? null
}

function edgeLabel(iso) {
  if (iso === props.rangeStart && iso === props.rangeEnd) return ''
  if (iso === props.rangeStart) return props.rangeStartLabel
  if (iso === props.rangeEnd) return props.rangeEndLabel
  return ''
}

function inRange(iso) {
  if (!props.rangeStart || !props.rangeEnd) return false
  return iso >= props.rangeStart && iso <= props.rangeEnd
}

/**
 * Cell styling carries three signals at once: whether the day exists in the
 * timeline, whether its note is finished, and whether it is currently picked.
 *
 * The same calendar date can appear in two month grids at once — 28 Feb shows in
 * both February's own cells and as a leading cell of March. Only the owning
 * month gets any selection or range highlight, so a picked day never lights up
 * twice; foreign cells are always rendered plain.
 */
/**
 * Two things, drawn two ways.
 *
 * The fill says what kind of day this is — nothing recorded, a draft, a finished
 * note — and it is the same fill on every calendar on the site. Belonging to a
 * picked range is not a kind of day; it is a thing done to a stretch of them, and
 * giving it a fill of its own put it in the same channel as the other three. A
 * finished day and a day inside the range then looked alike, and inside the range
 * the difference between finished and draft disappeared entirely.
 *
 * So the range is a bar under the number instead. It reads along a row the way a
 * range should, it survives every fill underneath it, and the two edges keep the
 * solid mark that says a hand put them there.
 */
function cellClass(cell) {
  if (!cell.inMonth) return 'text-ink-faint/30'

  const day = dayOf(cell.iso)
  const isEdge = cell.iso === props.rangeStart || cell.iso === props.rangeEnd

  if (props.selected === cell.iso || isEdge) return 'bg-ink text-paper font-medium'
  if (!day) return 'text-ink-faint/60'
  if (day.isReady) return 'bg-edge/70 text-ink font-medium hover:bg-edge'
  return 'text-ink-soft hover:bg-edge/50'
}
</script>

<template>
  <div>
    <h3 class="mb-2 text-center text-sm font-medium capitalize text-ink-soft">{{ title }}</h3>

    <div class="grid grid-cols-7 gap-0.5 text-center text-[10px] text-ink-faint">
      <abbr v-for="label in weekdays" :key="label" class="py-1 no-underline">{{ label }}</abbr>
    </div>

    <div class="grid grid-cols-7 gap-0.5">
      <template v-for="cell in cells" :key="cell.iso">
        <button
          v-if="dayOf(cell.iso) && cell.inMonth"
          type="button"
          class="relative aspect-square rounded text-xs transition"
          :class="cellClass(cell)"
          :aria-current="props.selected === cell.iso ? 'date' : undefined"
          @click="emit('select', cell.iso)"
        >
          {{ cell.date.getDate() }}
          <!-- Inside the range, between its ends. The ends wear the solid mark
               instead, so a bar there would be saying the same thing twice. -->
          <span
            v-if="inRange(cell.iso) && cell.iso !== rangeStart && cell.iso !== rangeEnd"
            class="pointer-events-none absolute inset-x-1.5 bottom-1 h-0.5 rounded-full bg-accent"
            aria-hidden="true"
          />
          <!-- Above the square rather than inside it: a cell is barely wider
               than the number in it, and a word squeezed in beside that number
               is a word nobody reads. -->
          <span
            v-if="cell.inMonth && edgeLabel(cell.iso)"
            class="pointer-events-none absolute -top-2 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-full bg-ink px-1.5 py-px text-[9px] font-medium uppercase tracking-wide text-paper shadow-sm"
          >
            {{ edgeLabel(cell.iso) }}
          </span>
        </button>
        <span
          v-else
          class="relative flex aspect-square items-center justify-center rounded text-xs"
          :class="cellClass(cell)"
        >
          {{ cell.date.getDate() }}
          <span
            v-if="cell.inMonth && inRange(cell.iso) && cell.iso !== rangeStart && cell.iso !== rangeEnd"
            class="pointer-events-none absolute inset-x-1.5 bottom-1 h-0.5 rounded-full bg-accent/50"
            aria-hidden="true"
          />
        </span>
      </template>
    </div>
  </div>
</template>
