<script setup>
import { ref, watch, onMounted, onBeforeUnmount, markRaw, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import L from 'leaflet'
import { createBaseMap, pinIcon, neighborIcon, PIN_PATH, NEIGHBOR_COLOR } from '@/services/leaflet'

const props = defineProps({
  /** Current point, or null when the file has no location yet. */
  modelValue: { type: Object, default: null },
  /**
   * Reference points from neighbouring days, shown as muted pins so a photo can
   * be placed relative to where the trip already was that day.
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

function setPoint(lat, lng) {
  emit('update:modelValue', { lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)) })
}

/** Places or moves this instance's draggable marker. */
function placeOn(picker, lat, lng) {
  if (picker.marker) {
    picker.marker.setLatLng([lat, lng])
  } else {
    picker.marker = L.marker([lat, lng], { icon: pinIcon, draggable: true }).addTo(picker.map)
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
  for (const point of props.points) {
    if (!Number.isFinite(point?.lat) || !Number.isFinite(point?.lng)) continue
    L.marker([point.lat, point.lng], { icon: neighborIcon, interactive: false }).addTo(
      picker.neighborLayer,
    )
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
  if (props.modelValue) {
    placeOn(picker, props.modelValue.lat, props.modelValue.lng)
    if (!lastView.center) map.setView([props.modelValue.lat, props.modelValue.lng], 13)
  }

  pickers.push(picker)
  return picker
}

function destroyPicker(picker) {
  picker.map.remove()
  pickers = pickers.filter((p) => p !== picker)
}

onMounted(() => buildPicker(inlineEl.value))

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
  () => pickers.forEach(renderNeighborsOn),
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

    <!-- Inline map: always mounted, never reparented. -->
    <div class="relative">
      <div
        ref="inlineEl"
        class="h-[220px] w-full overflow-hidden rounded-md ring-1 ring-edge"
      />
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
