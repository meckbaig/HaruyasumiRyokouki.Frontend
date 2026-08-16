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
  An exhibition wall that drifts past.

  Pictures hang at one height and keep their own width, so a portrait stands
  narrow between two landscapes instead of every frame being cropped to the same
  square the day pages use. The wall drifts slowly to the left; the edges fade
  out, so a picture enters and leaves rather than being cut off by the viewport.

  It is a real scroll container underneath, and the drift is nothing but
  `scrollLeft` moving on its own. That is what lets the two coexist: the wall can
  be pushed by hand at any moment and the drift picks up from wherever it was
  left. An animated transform could do neither.
*/
const HEIGHT_CLASS = 'h-44 sm:h-56 lg:h-64'
/** Pixels a second. Slow enough to read as drifting rather than scrolling. */
const SPEED = 22
/** How long to wait for the miniatures before setting off regardless. */
const SETTLE_TIMEOUT = 1500

const track = ref(null)
const settled = ref(0)

/**
 * Whether the wall should drift at all.
 *
 * Honours the same choice as the rest of the site: the system's reduce-motion
 * setting, unless the visitor has opted back in here. Standing still is a fine
 * state to be in — the wall is still a scroll container, so every picture stays
 * reachable by hand.
 */
const drifting = computed(() => {
  if (motion.preference === 'always') return true
  return !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
})

/**
 * Drifting needs somewhere to drift to. A second copy of the wall sits after the
 * first, and the scroll jumps back by exactly one copy's width each time it has
 * passed one — landing on an identical picture in an identical place, so the
 * seam is invisible and the wall reads as endless. Standing still, one copy is
 * all there is to show.
 */
const hung = computed(() =>
  drifting.value && props.items.length ? [...props.items, ...props.items] : props.items,
)

/** Which file a frame belongs to, given the wall may be hung twice. */
function fileAt(index) {
  return props.items[index % props.items.length]
}

/*
  Proportions come with the file.

  Each one carries its own `aspectRatio`, so the wall is laid out correctly on
  the first frame — nothing is hung at a guess and corrected as pictures arrive,
  and no frame resizes under a wall that is trying to drift. A file without one
  is hung as a modest landscape and corrected from its miniature, which ships
  inline and can be measured before anything is fetched.
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
  The drift.

  Its position is kept here rather than read back out of the element each frame.
  A browser hands `scrollLeft` back rounded to whole pixels, so a step of a third
  of a pixel was written and then read as nothing, over and over — the wall stood
  still while the loop ran perfectly. Keeping the fractional position in hand and
  only ever writing it is what makes a slow drift possible at all.
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
 * How far the wall travels before it repeats, or 0 when only one copy is hung.
 *
 * Measured as the distance between a frame and its twin, rather than as half the
 * scrollable width: that width also carries the container's padding and one gap
 * too few, and a seam off by even those few tens of pixels is a jump you can see
 * once every lap.
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
 * Keeps the scroll inside one copy's worth of travel, in either direction.
 *
 * Past the end it goes back a copy, and short of the start it goes forward one —
 * both landing on the identical picture in the identical place, so the jump
 * cannot be seen. The second is what lets the wall be pushed backwards at all: a
 * browser stops a scroll dead at zero, and without somewhere to be sent the wall
 * simply refused to go that way.
 *
 * The two bounds are deliberately a pixel apart. Sharing one would put the wall
 * on both sides of it at once and it would be sent back and forth forever.
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
 * A scroll this component did not write is the reader's — a finger, or a wheel
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
  Pushing the wall with a mouse.

  A wheel is left alone on purpose: the wall loops, so it never reaches an end to
  hand the gesture back at, and translating a vertical wheel into it would trap
  the page every time the cursor passed over. Dragging is unambiguous — it can
  only have been meant for the wall — and shift-wheel still works as it always
  does. A drag that actually moved swallows the click that follows, or letting go
  over a picture would open it.
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
          <!--
            The same two stages as a grid tile: the inline miniature at once,
            blurred because it is tiny and scaled past the blur so its softened
            edges do not let the frame show through, and the preview settling
            over it. The preview fades in only once it is whole, so the frame is
            never empty and never half-drawn.
          -->
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
