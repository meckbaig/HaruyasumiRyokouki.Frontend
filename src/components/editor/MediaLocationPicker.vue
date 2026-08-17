<script setup>
import { ref, watch, onMounted, onBeforeUnmount, markRaw, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import L from 'leaflet'
import {
  createBaseMap,
  pinIcon,
  neighborIcon,
  PIN_PATH,
  PIN_COLOR,
  NEIGHBOR_COLOR,
} from '@/services/leaflet'

const props = defineProps({
  /** Current point, or null when the file has no location yet. */
  modelValue: { type: Object, default: null },
  /**
   * Reference points from the day and the ones either side, in the order they
   * were taken — shown as muted pins, joined by the path between them so a photo
   * can be placed against the route rather than against a scatter of dots.
   *
   * Each carries `before`: whether it was taken before the file being placed.
   * That is what makes the framing below possible, and it is null when there is
   * nothing to compare against.
   */
  points: { type: Array, default: () => [] },
})

const emit = defineEmits(['update:modelValue'])

const { t } = useI18n()

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

function setPoint(lat, lng) {
  emit('update:modelValue', { lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)) })
}

/** Places or moves this instance's draggable marker. */
function placeOn(picker, lat, lng) {
  if (picker.marker) {
    picker.marker.setLatLng([lat, lng])
  } else {
    // Above every reference pin, always. Leaflet stacks markers by latitude, so
    // without this the one pin that can be dragged disappears behind a muted one
    // standing a few metres south of it — precisely where they cluster.
    picker.marker = L.marker([lat, lng], {
      icon: pinIcon,
      draggable: true,
      zIndexOffset: 1000,
    }).addTo(picker.map)
    picker.marker.on('dragend', () => {
      const { lat: dLat, lng: dLng } = picker.marker.getLatLng()
      setPoint(dLat, dLng)
    })
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

  /*
    The line first, so the pins sit on top of it.

    Dots alone say where the trip was; the line says which way it went, and that
    is what places a photograph — between these two, on the way from the station
    to the shrine. Same dashed red as the route on the trip map, because it is
    the same thing at a smaller scale.
  */
  if (usable.length > 1) {
    L.polyline(
      usable.map((point) => [point.lat, point.lng]),
      { color: PIN_COLOR, weight: 2, opacity: 0.55, dashArray: '5 5', interactive: false },
    ).addTo(picker.neighborLayer)
  }

  for (const point of usable) {
    L.marker([point.lat, point.lng], { icon: neighborIcon, interactive: false }).addTo(
      picker.neighborLayer,
    )
  }
}

/*
  Where the map should be looking when it opens.

  Placing a photograph is a search for one spot on a map of a whole country, and
  almost every one of them was taken near — or between — the last photograph with
  a location and the next. So that gap is what the map opens on, and the search
  is over before it starts:

    the file already has a point   →  it, centred; the reader is checking it
    points before and after        →  the two of them framed, and the answer is
                                      somewhere on the line drawn between
    points on one side only        →  the nearest one in time
    a selection, with no one time  →  all of them
    nothing at all                 →  wherever the map was left last

  Applied once per file, and only once something is actually known: the reader
  who then pans off looking for a rooftop is not dragged back by a fetch landing
  a moment later.
*/
let framed = false

function bestView() {
  if (valid(props.modelValue)) {
    return { center: [props.modelValue.lat, props.modelValue.lng], zoom: 15 }
  }

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

/** Builds one map instance bound to the shared point and neighbour state. */
function buildPicker(el) {
  const map = markRaw(
    createBaseMap(el, { center: lastView.center, zoom: lastView.zoom, onScrollHint: flashHint }),
  )
  const picker = { map, neighborLayer: markRaw(L.layerGroup().addTo(map)), marker: null }

  map.on('click', (event) => setPoint(event.latlng.lat, event.latlng.lng))
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
  () => props.points,
  () => {
    pickers.forEach(renderNeighborsOn)
    // They arrive after the map is built — the request for them goes out with
    // the dialog — so this is usually where the framing actually happens.
    frameInline()
  },
)

let fullscreenPicker = null
watch(expanded, async (isOpen) => {
  if (isOpen) {
    await nextTick()
    // The overlay element only exists once expanded; build a fresh map in it.
    fullscreenPicker = buildPicker(fullscreenEl.value)
    requestAnimationFrame(() => fullscreenPicker?.map.invalidateSize())
  } else if (fullscreenPicker) {
    destroyPicker(fullscreenPicker)
    fullscreenPicker = null

    /*
      The small map comes back to the point rather than to wherever it was left.

      Going full screen is what people do to place a pin precisely, so the pin is
      the thing they were looking at when they collapsed — and finding the small
      map still showing the stretch of country it showed a minute ago means
      hunting for the mark that was just made.
    */
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

    <!--
      Inline map: always mounted, never reparented.

      `isolate`: Leaflet stacks its own panes from 200 up to 800, and without a
      stacking context of their own those numbers compete with everything else in
      the dialog — which is how the map came to paint over the tag suggestions
      dropping out of the field above it. Isolating pins every one of them inside
      this box.
    -->
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

    <p class="field-hint">{{ t('editor.mapHint') }}</p>

    <!--
      A legend, not a label. The muted drops are the only thing on the map
      nobody put there deliberately, and named on their own — "points from
      neighbouring days" — they explained neither which marks they were nor what
      they were for. Drawn beside the sentence, the mark and its meaning arrive
      together.
    -->
    <p v-if="points.length" class="field-hint flex items-start gap-1.5">
      <svg class="mt-px h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
        <path :d="PIN_PATH" :fill="NEIGHBOR_COLOR" />
      </svg>
      {{ t('editor.neighborPoints') }}
    </p>

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
