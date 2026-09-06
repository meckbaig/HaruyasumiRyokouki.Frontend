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
  /** Words for the two ends of a range. Blank on the day page, which picks one
   *  date. See docs/features/days-and-calendar.md. */
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
 * Two things, drawn two ways: the **fill** says what kind of day this is, the
 * **bar under the number** says it is in the picked range. A date can appear in
 * two grids at once, so only the owning month draws either.
 * See docs/features/days-and-calendar.md.
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
