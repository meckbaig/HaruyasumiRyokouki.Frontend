<script setup>
import { ref, shallowRef, watch, onMounted, onBeforeUnmount, markRaw } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import L from 'leaflet'
import 'leaflet.markercluster'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import 'leaflet.markercluster/dist/MarkerCluster.Default.css'
import {
  createBaseMap,
  pinIcon,
  clusterIconOf,
  FALLBACK_CENTER,
  FALLBACK_ZOOM,
} from '@/services/leaflet'
import { squareUrl } from '@/services/mediaUrl'
import { formatLongDate } from '@/services/dates'

const props = defineProps({
  /** Media that carry coordinates; anything without them is filtered out here. */
  media: { type: Array, default: () => [] },
  /** Ordered `[lat, lng]` pairs for the route line; empty hides it. */
  route: { type: Array, default: () => [] },
  /** Fallback date used in popups when the media object has none. */
  date: { type: String, default: null },
  height: { type: String, default: '420px' },
})

const { t, locale } = useI18n()
const router = useRouter()

const container = ref(null)
const showHint = ref(false)
// Leaflet objects are large and mutate constantly; keep them out of reactivity.
const map = shallowRef(null)
const clusterLayer = shallowRef(null)
const routeLayer = shallowRef(null)

let hintTimer = null
function flashHint() {
  showHint.value = true
  clearTimeout(hintTimer)
  hintTimer = setTimeout(() => (showHint.value = false), 1500)
}

function locatedMedia() {
  return props.media.filter(
    (item) => Number.isFinite(item?.latitude) && Number.isFinite(item?.longitude),
  )
}

/**
 * Builds the popup as real DOM rather than an HTML string, so a title or file
 * name can never be interpreted as markup.
 */
function buildPopup(item) {
  const root = document.createElement('div')
  root.className = 'w-44'

  const thumb = squareUrl(item.fileName, 320)
  if (thumb) {
    const image = document.createElement('img')
    image.src = thumb
    image.alt = item.title || item.fileName || ''
    image.loading = 'lazy'
    image.className = 'mb-2 h-32 w-full rounded object-cover'
    root.append(image)
  }

  const caption = document.createElement('p')
  caption.className = 'text-xs font-medium'
  caption.textContent = item.title || item.fileName || t('media.untitled')
  root.append(caption)

  const date = (item.created ? String(item.created).slice(0, 10) : null) ?? item.date ?? props.date
  if (date) {
    const when = document.createElement('p')
    when.className = 'text-[11px] text-ink-faint'
    when.textContent = formatLongDate(date, locale.value)
    root.append(when)

    const link = document.createElement('button')
    link.type = 'button'
    link.className = 'mt-1 text-xs underline'
    link.textContent = t('search.openDay')
    link.addEventListener('click', () => router.push({ name: 'day', params: { date } }))
    root.append(link)
  }

  return root
}

function renderMarkers() {
  if (!map.value) return

  clusterLayer.value?.clearLayers()

  const located = locatedMedia()
  const markers = located.map((item) =>
    L.marker([item.latitude, item.longitude], { icon: pinIcon, title: item.title ?? '' }).bindPopup(
      () => buildPopup(item),
    ),
  )
  clusterLayer.value?.addLayers(markers)

  routeLayer.value?.clearLayers()
  if (props.route.length > 1) {
    L.polyline(props.route, {
      color: '#b3403f',
      weight: 2.5,
      opacity: 0.75,
      dashArray: '6 6',
    }).addTo(routeLayer.value)
  }

  const bounds = L.latLngBounds([
    ...located.map((item) => [item.latitude, item.longitude]),
    ...props.route,
  ])
  if (bounds.isValid()) {
    map.value.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 })
  } else {
    map.value.setView(FALLBACK_CENTER, FALLBACK_ZOOM)
  }
}

let resizeObserver = null

onMounted(() => {
  const instance = markRaw(createBaseMap(container.value, { onScrollHint: flashHint }))

  map.value = instance
  routeLayer.value = markRaw(L.layerGroup().addTo(instance))
  clusterLayer.value = markRaw(
    L.markerClusterGroup({
      showCoverageOnHover: false,
      maxClusterRadius: 50,
      // Cluster looks like a single drop but carries the count in its head.
      iconCreateFunction: (cluster) => clusterIconOf(cluster.getChildCount()),
    }),
  )
  instance.addLayer(clusterLayer.value)

  renderMarkers()

  // The map is often laid out inside a container that resizes after mount
  // (sidebar, tab switch); without this it renders as a grey box.
  resizeObserver = new ResizeObserver(() => instance.invalidateSize())
  resizeObserver.observe(container.value)
})

watch(() => [props.media, props.route], renderMarkers, { deep: false })

onBeforeUnmount(() => {
  clearTimeout(hintTimer)
  resizeObserver?.disconnect()
  map.value?.remove()
  map.value = null
})
</script>

<template>
  <div class="relative overflow-hidden rounded-lg ring-1 ring-edge">
    <div ref="container" :style="{ height }" class="w-full" />

    <!-- Wheel-without-ctrl hint, the convention embedded maps use. -->
    <Transition
      enter-from-class="opacity-0"
      enter-active-class="transition duration-150"
      leave-to-class="opacity-0"
      leave-active-class="transition duration-300"
    >
      <div
        v-if="showHint"
        class="pointer-events-none absolute inset-0 z-[500] flex items-center justify-center bg-ink/40"
      >
        <p class="rounded-md bg-ink/80 px-4 py-2 text-sm text-paper">{{ t('map.zoomHint') }}</p>
      </div>
    </Transition>
  </div>
</template>

<style>
/* Leaflet's own chrome, toned down to match the surrounding paper palette. */
.leaflet-container {
  font: inherit;
  background: var(--color-paper);
}

.leaflet-popup-content {
  margin: 0.65rem;
}
</style>
