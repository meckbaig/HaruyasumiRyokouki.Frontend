<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import { markOpenedFrom } from '@/services/openedFrom'
import { miniatureSrc, previewSrc, mediaAspect } from '@/services/mediaAssets'
import { isVideo } from '@/services/mediaType'
import { useMotionStore } from '@/stores/motion'

const props = defineProps({
  items: { type: Array, default: () => [] },
})

const emit = defineEmits(['open'])

const { t } = useI18n()
const motion = useMotionStore()

/*
  An exhibition wall that drifts past. A real scroll container underneath, with
  the drift nothing but `scrollLeft` moving on its own - which is what lets a
  hand push it at any moment. See docs/features/home-and-favorites.md.
*/
const HEIGHT_CLASS = 'h-44 sm:h-56 lg:h-64'
/** Pixels a second. Slow enough to read as drifting rather than scrolling. */
const SPEED = 22
/** How long to wait for the miniatures before setting off regardless. */
const SETTLE_TIMEOUT = 1500

const track = ref(null)
const settled = ref(0)

/** Whether the wall drifts. Standing still is a fine state - it is still a
 *  scroll container. */
const drifting = computed(() => {
  if (motion.preference === 'always') return true
  return !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
})

/**
 * Drifting needs somewhere to drift to, so the wall is hung twice and the scroll
 * jumps back a copy each lap. See docs/features/home-and-favorites.md.
 */
const hung = computed(() =>
  drifting.value && props.items.length ? [...props.items, ...props.items] : props.items,
)

/** Which file a frame belongs to, given the wall may be hung twice. */
function fileAt(index) {
  return props.items[index % props.items.length]
}

/*
  Proportions come with the file, so nothing is hung at a guess and resized under
  a wall that is trying to drift. A file without one is corrected from its
  miniature. See docs/features/home-and-favorites.md.
*/
const ratios = ref({})
const loaded = ref({})

function onMiniature(event, media) {
  const image = event.target
  if (media?.id != null && !mediaAspect(media) && image.naturalWidth && image.naturalHeight) {
    ratios.value = { ...ratios.value, [media.id]: image.naturalWidth / image.naturalHeight }
  }
  settled.value += 1
}

function onPreview(media) {
  if (media?.id != null) loaded.value = { ...loaded.value, [media.id]: true }
}

function ratioOf(media) {
  return mediaAspect(media) ?? ratios.value[media?.id] ?? 1.5
}

/*
  The drift. **Writes `scrollLeft` and never reads it back**: a browser rounds it
  to whole pixels, so a third-of-a-pixel step was written and read as nothing.
  See docs/features/home-and-favorites.md.
*/
let raf = null
let lastFrame = 0
let offset = 0
/** The last value written, so a scroll from anywhere else can be told apart. */
let written = -1
let settleTimer = null
let ready = false
/** Held still while a hand is on the wall, or while the tab is in the background. */
const held = ref(false)

/**
 * How far the wall travels before it repeats. Measured **between a frame and its
 * twin**, never as half the scrollable width, which carries padding and a gap.
 */
function copyWidth() {
  const element = track.value
  if (!element || !drifting.value) return 0

  const frames = element.children
  const twin = frames[frames.length / 2]
  if (!twin || !frames[0]) return 0
  return twin.offsetLeft - frames[0].offsetLeft
}

/**
 * Keeps the scroll inside one copy's travel, either direction. **The two bounds
 * are a pixel apart on purpose** - sharing one sends the wall back and forth
 * forever. See docs/features/home-and-favorites.md.
 */
function wrapped(position, copy) {
  if (copy <= 0) return position
  if (position >= copy + 1) return position - copy
  if (position < 1) return position + copy
  return position
}

function moveTo(position) {
  const element = track.value
  if (!element) return
  offset = wrapped(position, copyWidth())
  element.scrollLeft = offset
  written = element.scrollLeft
}

function step(now) {
  raf = requestAnimationFrame(step)

  const element = track.value
  if (!element) return

  const elapsed = lastFrame ? (now - lastFrame) / 1000 : 0
  lastFrame = now
  if (held.value || !ready || elapsed <= 0) return

  moveTo(offset + SPEED * elapsed)
}

/**
 * A scroll this component did not write is the reader's - a finger, or a wheel
 * held sideways. Take the position as the new truth, and wrap it the same way,
 * so their push loops exactly as the drift does.
 */
function onScroll() {
  const element = track.value
  if (!element) return
  if (Math.abs(element.scrollLeft - written) < 1.5) return

  const next = wrapped(element.scrollLeft, copyWidth())
  offset = next
  if (next !== element.scrollLeft) element.scrollLeft = next
  written = element.scrollLeft
}

function start() {
  if (raf !== null) return
  lastFrame = 0
  raf = requestAnimationFrame(step)
}

function stop() {
  if (raf !== null) cancelAnimationFrame(raf)
  raf = null
}

/*
  Pushing the wall with a mouse. **A wheel is left alone** - the wall loops, so it
  never reaches an end at which to hand the gesture back.
  See docs/features/home-and-favorites.md.
*/
const DRAG_SLOP = 6
let drag = null
let suppressClick = false

function onPointerDown(event) {
  held.value = true

  // Touch already pans the container natively, and far better than this would.
  if (event.pointerType !== 'mouse' || event.button > 0) return
  const element = track.value
  if (!element) return

  suppressClick = false
  drag = { x: event.clientX, moved: false }
}

function onPointerMove(event) {
  if (!drag) return

  const dx = event.clientX - drag.x
  if (!drag.moved && Math.abs(dx) < DRAG_SLOP) return

  // Each move carries its own step rather than a distance from where the press
  // began: the wall may wrap mid-drag, and an origin measured before that would
  // send it a whole copy backwards the moment it did.
  drag.x = event.clientX
  drag.moved = true
  suppressClick = true
  event.preventDefault()
  moveTo(offset - dx)
}

function endDrag() {
  drag = null
}

/** Cursor gone: the drag is over and so is the reason to stand still. */
function release() {
  endDrag()
  held.value = false
}

function onClickCapture(event) {
  if (!suppressClick) return
  suppressClick = false
  event.stopPropagation()
  event.preventDefault()
}

/** Sets off once every miniature has been measured, or once waiting stops paying. */
watch(
  [() => props.items.length, settled],
  ([count, done]) => {
    if (!count) return
    clearTimeout(settleTimer)
    if (done >= count) {
      ready = true
      return
    }
    settleTimer = setTimeout(() => (ready = true), SETTLE_TIMEOUT)
  },
  { immediate: true },
)

watch(
  drifting,
  (on) => {
    if (on) start()
    else {
      stop()
      // Back to the beginning: with one copy hung, a scroll left inside the
      // second one would be past the end of what is now there.
      offset = 0
      if (track.value) track.value.scrollLeft = 0
    }
  },
  { immediate: true },
)

function onVisibility() {
  held.value = document.hidden
}

onMounted(() => document.addEventListener('visibilitychange', onVisibility))

onBeforeUnmount(() => {
  stop()
  clearTimeout(settleTimer)
  document.removeEventListener('visibilitychange', onVisibility)
})

/**
 * The wall is hung twice so it can drift endlessly, so the same file is on the
 * page in two places at once. Which of them was pressed is knowable only here.
 */
function open(event, index) {
  markOpenedFrom(event.currentTarget)
  emit('open', fileAt(index))
}
</script>

<template>
  <section v-if="items.length" aria-labelledby="showcase-heading">
    <h2 id="showcase-heading" class="mb-4 text-center text-sm font-semibold text-ink-soft">
      {{ t('home.showcase') }}
    </h2>

    <!--
      Full-bleed: the wall runs edge to edge while the rest of the page keeps its
      margins, which is what makes it read as something passing behind the page
      rather than a box sitting on it.
    -->
    <div class="showcase-edge relative -mx-4">
      <div
        ref="track"
        class="showcase-track flex cursor-grab gap-3 overflow-x-auto px-4 active:cursor-grabbing sm:gap-4"
        :class="HEIGHT_CLASS"
        @scroll.passive="onScroll"
        @pointerenter="held = true"
        @pointerleave="release"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="endDrag"
        @touchstart.passive="held = true"
        @touchend="held = false"
        @touchcancel="held = false"
        @focusin="held = true"
        @focusout="held = false"
        @click.capture="onClickCapture"
      >
        <button
          v-for="(media, index) in hung"
          :key="`${media.id}-${index}`"
          :data-media-id="media.id"
          type="button"
          class="group relative h-full shrink-0 overflow-hidden rounded-md bg-edge/40 ring-1 ring-edge transition hover:ring-ink-faint"
          :style="{ aspectRatio: ratioOf(media) }"
          :aria-label="media.title || media.fileName || t('media.untitled')"
          @click="open($event, index)"
        >
          <!-- The same two stages as a grid tile: inline miniature at once,
               preview settling over it once it is whole.
               See docs/features/media-grid-and-selection.md. -->
          <img
            v-if="miniatureSrc(media)"
            :src="miniatureSrc(media)"
            alt=""
            aria-hidden="true"
            draggable="false"
            class="absolute inset-0 h-full w-full scale-105 object-cover blur-[10px]"
            @load="onMiniature($event, media)"
            @error="onMiniature($event, media)"
          />
          <img
            :src="previewSrc(media)"
            :alt="media.title || media.fileName || ''"
            decoding="async"
            draggable="false"
            class="relative h-full w-full object-cover transition-opacity duration-300"
            :class="loaded[media.id] ? 'opacity-100' : 'opacity-0'"
            @load="onPreview(media)"
          />

          <span
            v-if="isVideo(media)"
            class="pointer-events-none absolute bottom-1.5 left-1.5 flex items-center gap-1 rounded bg-ink/70 px-1.5 py-0.5 text-[10px] font-medium text-paper"
          >
            <svg class="h-3 w-3" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
              <path d="M3.5 2.5v7l6-3.5z" />
            </svg>
            {{ t('media.video') }}
          </span>
        </button>
      </div>
    </div>
  </section>
</template>
