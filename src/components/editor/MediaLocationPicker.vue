<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount, markRaw, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { useUiStore } from '@/stores/ui'
import L from 'leaflet'
import {
  createBaseMap,
  pinIcon,
  neighborIcon,
  beforeIcon,
  afterIcon,
  PIN_PATH,
  PIN_COLOR,
  NEIGHBOR_COLOR,
  BEFORE_COLOR,
  AFTER_COLOR,
} from '@/services/leaflet'
import { formatShortDateTime } from '@/services/dates'

const props = defineProps({
  /** Current point, or null when the file has no location yet. */
  modelValue: { type: Object, default: null },
  /**
   * Reference points from the three-day window, in the order they were taken.
   * Each carries `before`, which is what makes the framing possible.
   * See docs/features/maps.md.
   */
  points: { type: Array, default: () => [] },
  /**
   * Points the files *being edited* already carry, drawn in the live colour.
   *
   * For a selection, where there is no one pin to drag: the question there is
   * "where are these already", and answering it with the same muted pins as the
   * reference points would put the answer and the background in one voice.
   */
  ownPoints: { type: Array, default: () => [] },
})

const emit = defineEmits(['update:modelValue'])

const { t } = useI18n()
const ui = useUiStore()

/**
 * Last map position, kept across dialog opens. Filling thousands of photos means
 * they cluster in the same area, so reopening should land where the previous
 * photo was placed instead of resetting to the whole country every time.
 */
const lastView = { center: null, zoom: null }

const inlineEl = ref(null)
const fullscreenEl = ref(null)
const expanded = ref(false)
const showHint = ref(false)

/**
 * Inline and fullscreen use *separate* Leaflet instances rather than one moved
 * between containers: reparenting a live map through a Teleport leaves it broken
 * (blank tiles, dead on collapse). Each instance is built fresh and torn down on
 * its own, and both are driven from the same `modelValue` and `points`.
 */
let pickers = []

let hintTimer = null
function flashHint() {
  showHint.value = true
  clearTimeout(hintTimer)
  hintTimer = setTimeout(() => (showHint.value = false), 1500)
}

function valid(point) {
  return Number.isFinite(point?.lat) && Number.isFinite(point?.lng)
}

/*
  The two points the photograph fell between - the answer, where everything else
  on the map is context. The list is in capture order, so the nearest before is
  the last one marked `before`. See docs/features/maps.md.
*/
const anchors = computed(() => {
  const usable = props.points.filter(valid)
  const before = usable.filter((point) => point.before === true)
  const after = usable.filter((point) => point.before === false)
  return { before: before[before.length - 1] ?? null, after: after[0] ?? null }
})

/**
 * When an anchor photograph was taken. **Always on show, never a `title`** - that
 * takes a second and never appears on a touchscreen. See docs/features/maps.md.
 */
function timeLabel(marker, point) {
  if (!point.created) return
  marker.bindTooltip(formatShortDateTime(point.created, ui.locale), {
    permanent: true,
    direction: 'top',
    offset: [0, -26],
    className: 'trip-time',
    opacity: 1,
  })
}

function setPoint(lat, lng) {
  emit('update:modelValue', { lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)) })
}

function clearPoint() {
  emit('update:modelValue', null)
}

/*
  A margin round the map that does not answer a click: every control sits in a
  corner, and missing one by a few pixels used to move the pin. Sized from the
  box, not fixed. See docs/features/maps.md.
*/
function insetOf(map) {
  const size = map.getSize()
  return Math.max(16, Math.min(40, Math.min(size.x, size.y) * 0.1))
}

function nearEdge(map, point) {
  const size = map.getSize()
  const inset = insetOf(map)
  return point.x < inset || point.y < inset || point.x > size.x - inset || point.y > size.y - inset
}

/*
  Coordinates pasted from elsewhere - Google Maps copies a place in this exact
  form. Listened for on the **document** so it fires regardless of where the
  cursor sits, and always takes precedence over text insertion when matched.
  See docs/features/maps.md.
*/
const COORDS = /^\s*(-?\d{1,3}(?:\.\d+)?)\s*[,;]\s*(-?\d{1,3}(?:\.\d+)?)\s*$/

function onPaste(event) {
  const match = COORDS.exec(event.clipboardData?.getData('text') ?? '')
  if (!match) return // let normal paste continue when there is no coordinate pattern

  const lat = Number(match[1])
  const lng = Number(match[2])
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return // not valid coordinates, let it through

  event.preventDefault() // stop text insertion when we have valid coordinates
  setPoint(lat, lng)
  for (const picker of pickers) picker.map.setView([lat, lng], Math.max(picker.map.getZoom(), 15))
  ui.notify(t('editor.pastedPoint'), 'success')
}

/** Places or moves this instance's draggable marker. */
function placeOn(picker, lat, lng) {
  if (picker.marker) {
    picker.marker.setLatLng([lat, lng])
  } else {
    // Above every reference pin, always. Leaflet stacks markers by latitude, so
    // without this the one pin that can be dragged disappears behind a muted one
    // standing a few metres south of it - precisely where they cluster.
    picker.marker = L.marker([lat, lng], {
      icon: pinIcon,
      draggable: true,
      zIndexOffset: 1000,
    }).addTo(picker.map)
    picker.marker.on('dragend', () => {
      const { lat: dLat, lng: dLng } = picker.marker.getLatLng()
      setPoint(dLat, dLng)
    })
    // Right-click takes the pin off. Leaflet suppresses the browser's own menu on
    // the map, and a marker is part of it - so the gesture is free to mean this.
    picker.marker.on('contextmenu', clearPoint)
  }
}

function clearMarker(picker) {
  if (picker.marker) {
    picker.marker.remove()
    picker.marker = null
  }
}

function renderNeighborsOn(picker) {
  picker.neighborLayer.clearLayers()

  const usable = props.points.filter(valid)

  // The line first, so the pins sit on top of it. Dots say where the trip was;
  // the line says which way it went, and that is what places a photograph.
  if (usable.length > 1) {
    L.polyline(
      usable.map((point) => [point.lat, point.lng]),
      { color: PIN_COLOR, weight: 2, opacity: 0.55, dashArray: '5 5', interactive: false },
    ).addTo(picker.neighborLayer)
  }

  /*
    The gap itself, drawn solid over the dashed path: whatever is being placed
    happened somewhere along this stretch, and usually within sight of it.
  */
  const { before, after } = anchors.value
  if (before && after) {
    L.polyline(
      [
        [before.lat, before.lng],
        [after.lat, after.lng],
      ],
      { color: PIN_COLOR, weight: 3, opacity: 0.7, interactive: false },
    ).addTo(picker.neighborLayer)
  }

  for (const point of usable) {
    if (point === before || point === after) continue
    L.marker([point.lat, point.lng], { icon: neighborIcon, interactive: false }).addTo(
      picker.neighborLayer,
    )
  }

  // The anchors last and larger, so neither is lost under a neighbour standing
  // a few metres south of it.
  if (before) {
    const marker = L.marker([before.lat, before.lng], {
      icon: beforeIcon,
      interactive: false,
      zIndexOffset: 500,
    }).addTo(picker.neighborLayer)
    timeLabel(marker, before)
  }
  if (after) {
    const marker = L.marker([after.lat, after.lng], {
      icon: afterIcon,
      interactive: false,
      zIndexOffset: 600,
    }).addTo(picker.neighborLayer)
    timeLabel(marker, after)
  }

  // Last, and in the accent: these are the files in hand, not the scenery.
  // `zIndexOffset` keeps them above the anchors, which otherwise paint over the
  // selection a few metres south of it - the same clash the draggable pin avoids.
  for (const point of props.ownPoints.filter(valid)) {
    L.marker([point.lat, point.lng], {
      icon: pinIcon,
      interactive: false,
      zIndexOffset: 700,
    }).addTo(picker.neighborLayer)
  }
}

/*
  Where the map looks when it opens - the gap the photograph fell into, so the
  search is over before it starts. Applied **once per file**, and only once
  something is known. The full order is in docs/features/maps.md.
*/
let framed = false

function bestView() {
  if (valid(props.modelValue)) {
    return { center: [props.modelValue.lat, props.modelValue.lng], zoom: 15 }
  }

  // A selection's own points are the subject of the map, so they frame it.
  const own = props.ownPoints.filter(valid)
  if (own.length) return { bounds: own.map((point) => [point.lat, point.lng]) }

  const points = props.points.filter(valid)
  if (!points.length) return null

  const before = points.filter((point) => point.before === true)
  const after = points.filter((point) => point.before === false)

  const last = before[before.length - 1]
  const first = after[0]

  if (last && first)
    return {
      bounds: [
        [last.lat, last.lng],
        [first.lat, first.lng],
      ],
    }
  if (last) return { center: [last.lat, last.lng], zoom: 15 }
  if (first) return { center: [first.lat, first.lng], zoom: 15 }

  // A selection has no single moment to be before or after, so the whole of what
  // is known about that stretch of the day is the honest frame.
  return { bounds: points.map((point) => [point.lat, point.lng]) }
}

function frameInline() {
  const picker = pickers[0]
  if (!picker || framed) return

  const view = bestView()
  if (!view) return
  framed = true

  if (view.bounds) {
    const bounds = L.latLngBounds(view.bounds)
    // `maxZoom` matters most for the two-point case: a photograph taken seconds
    // after the last one gives a gap of a few metres, and framing that exactly
    // puts the map on a rooftop with no idea which rooftop.
    if (bounds.isValid())
      picker.map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16, animate: false })
  } else {
    picker.map.setView(view.center, view.zoom, { animate: false })
  }
}

/**
 * Builds one map instance bound to the shared point and neighbour state.
 * `wheelZoom` is for the instance filling the window, where there is no page
 * behind it to scroll. See docs/features/maps.md.
 */
function buildPicker(el, { wheelZoom = false } = {}) {
  const map = markRaw(
    createBaseMap(el, {
      center: lastView.center,
      zoom: lastView.zoom,
      onScrollHint: flashHint,
      wheelZoom,
    }),
  )
  const picker = { map, neighborLayer: markRaw(L.layerGroup().addTo(map)), marker: null }

  map.on('click', (event) => {
    if (nearEdge(map, event.containerPoint)) return
    setPoint(event.latlng.lat, event.latlng.lng)
  })
  map.on('moveend', () => {
    lastView.center = map.getCenter()
    lastView.zoom = map.getZoom()
  })

  renderNeighborsOn(picker)
  if (valid(props.modelValue)) placeOn(picker, props.modelValue.lat, props.modelValue.lng)

  pickers.push(picker)
  return picker
}

function destroyPicker(picker) {
  picker.map.remove()
  pickers = pickers.filter((p) => p !== picker)
}

onMounted(() => {
  buildPicker(inlineEl.value)
  frameInline()
  document.addEventListener('paste', onPaste)
})

// Keep every live map in step when the point changes (map click, drag, or the
// parent editing the coordinate inputs by hand).
watch(
  () => props.modelValue,
  (value) => {
    const valid = value && Number.isFinite(value.lat) && Number.isFinite(value.lng)
    for (const picker of pickers) {
      if (valid) placeOn(picker, value.lat, value.lng)
      else clearMarker(picker)
    }
  },
)

watch(
  () => [props.points, props.ownPoints],
  () => {
    pickers.forEach(renderNeighborsOn)
    // They arrive after the map is built - the request for them goes out with
    // the dialog - so this is usually where the framing actually happens.
    frameInline()
  },
)

let fullscreenPicker = null
watch(expanded, async (isOpen) => {
  if (isOpen) {
    await nextTick()
    // The overlay element only exists once expanded; build a fresh map in it.
    fullscreenPicker = buildPicker(fullscreenEl.value, { wheelZoom: true })
    requestAnimationFrame(() => fullscreenPicker?.map.invalidateSize())
  } else if (fullscreenPicker) {
    destroyPicker(fullscreenPicker)
    fullscreenPicker = null

    // Back to the point, not to wherever the small map was left: the pin is what
    // the reader was looking at when they collapsed.
    const inline = pickers[0]
    if (inline && props.modelValue) {
      inline.map.setView(
        [props.modelValue.lat, props.modelValue.lng],
        Math.max(inline.map.getZoom(), 14),
      )
    }
    // The box was under an overlay while it was collapsed; Leaflet has to be
    // told its size again or it paints half a map.
    await nextTick()
    inline?.map.invalidateSize()
  }
})

onBeforeUnmount(() => {
  document.removeEventListener('paste', onPaste)
  clearTimeout(hintTimer)
  pickers.forEach((picker) => picker.map.remove())
  pickers = []
})
</script>

<template>
  <div>
    <div class="mb-1 flex items-center justify-between">
      <span class="field-label mb-0">{{ t('editor.coordinates') }}</span>
      <button
        type="button"
        class="text-xs text-ink-faint underline underline-offset-2 transition hover:text-ink"
        @click="expanded = !expanded"
      >
        {{ expanded ? t('editor.collapseMap') : t('editor.expandMap') }}
      </button>
    </div>

    <!-- Inline map: always mounted, never reparented. `isolate` pins Leaflet's
         200-800 pane z-indexes inside this box. See docs/features/maps.md. -->
    <div class="relative isolate">
      <div ref="inlineEl" class="h-[220px] w-full overflow-hidden rounded-md ring-1 ring-edge" />
      <Transition
        enter-from-class="opacity-0"
        enter-active-class="transition duration-150"
        leave-to-class="opacity-0"
        leave-active-class="transition duration-300"
      >
        <div
          v-if="showHint && !expanded"
          class="pointer-events-none absolute inset-0 z-[5] flex items-center justify-center"
        >
          <p class="rounded-md bg-ink/80 px-4 py-2 text-sm text-paper">{{ t('map.zoomHint') }}</p>
        </div>
      </Transition>
    </div>

    <div class="grid h-10 grid-rows-2 overflow-hidden">
      <p class="field-hint truncate">{{ t('editor.mapHint') }}</p>

      <!-- Keep the second row in place while reference points arrive. -->
      <div class="min-w-0">
        <p v-if="anchors.before || anchors.after" class="field-hint flex items-center gap-3">
          <span v-if="anchors.before" class="flex shrink-0 items-center gap-1.5">
            <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" aria-hidden="true">
              <path :d="PIN_PATH" :fill="BEFORE_COLOR" />
            </svg>
            {{ t('editor.pointBefore') }}
          </span>
          <span v-if="anchors.after" class="flex shrink-0 items-center gap-1.5">
            <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" aria-hidden="true">
              <path :d="PIN_PATH" :fill="AFTER_COLOR" />
            </svg>
            {{ t('editor.pointAfter') }}
          </span>
        </p>
        <p v-else-if="points.length" class="field-hint flex items-center gap-1.5">
          <svg class="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
            <path :d="PIN_PATH" :fill="NEIGHBOR_COLOR" />
          </svg>
          <span class="truncate">{{ t('editor.neighborPoints') }}</span>
        </p>
        <p v-else class="field-hint truncate">
          {{ t('editor.clearPointHint') }}
        </p>
      </div>
    </div>

    <!-- Fullscreen map: a separate instance in a body-level overlay. -->
    <Teleport to="body">
      <div v-if="expanded" class="fixed inset-0 z-[2100] flex flex-col bg-paper">
        <div ref="fullscreenEl" class="min-h-0 flex-1" />

        <button
          type="button"
          class="btn-ghost absolute right-4 top-4 z-[1000] bg-paper-raised shadow-sm"
          @click="expanded = false"
        >
          {{ t('editor.collapseMap') }}
        </button>

        <Transition
          enter-from-class="opacity-0"
          enter-active-class="transition duration-150"
          leave-to-class="opacity-0"
          leave-active-class="transition duration-300"
        >
          <div
            v-if="showHint"
            class="pointer-events-none absolute inset-0 z-[5] flex items-center justify-center"
          >
            <p class="rounded-md bg-ink/80 px-4 py-2 text-sm text-paper">{{ t('map.zoomHint') }}</p>
          </div>
        </Transition>
      </div>
    </Teleport>
  </div>
</template>
