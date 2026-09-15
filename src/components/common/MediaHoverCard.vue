<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useUiStore } from '@/stores/ui'
import MediaThumb from '@/components/media/MediaThumb.vue'
import SteppedScrollbar from '@/components/layout/SteppedScrollbar.vue'
import { pickTranslation } from '@/services/translations'
import { formatShortTime } from '@/services/dates'
import { GHOST_CLICK_MS } from '@/services/ghostClick'
import { markOpenedWithoutSource } from '@/services/openedFrom'
import { SLIDE_MS } from '@/services/motion'

/**
 * The card shown beside a media reference in a text. It carries **every** file
 * the reference names and scrolls between them as a filmstrip - one record
 * leaving over the card's edge while the next arrives behind it. Positioned in
 * **document** coordinates so it scrolls with the page.
 * See docs/features/rich-text-and-links.md.
 */
const props = defineProps({
  /** The files the reference resolved to, in order; a miss is a null entry. */
  medias: { type: Array, default: () => [] },
  /** The reference's own text, shown when no file is on this page. */
  label: { type: String, default: '' },
  /** Viewport rectangle of the element the card belongs to. */
  anchorRect: { type: Object, default: null },
  /** Shown by a tap, so the click that called it must not reach its controls. */
  touch: { type: Boolean, default: false },
})

const emit = defineEmits(['open', 'close', 'enter', 'leave', 'activate'])

const { t } = useI18n()
const ui = useUiStore()

/**
 * A tap that shows the card may leave the point it was aimed at over the
 * picture, and the browser's own click then lands there. Nothing in the card
 * answers a click from before it was open.
 * See docs/features/rich-text-and-links.md.
 */
let openedAt = 0

onMounted(() => {
  openedAt = performance.now()
})

function onRootClickCapture(event) {
  if (!props.touch) return
  if (performance.now() - openedAt >= GHOST_CLICK_MS) return
  event.stopPropagation()
  event.preventDefault()
}

/**
 * One record's height, in pixels. The strip is **clipped by the card itself**,
 * so a record arrives from the card's own edge rather than from an inset a
 * padding away; the slide's box is the card's box, padding included.
 */
const SLIDE_PX = 180

const index = ref(0)
const count = computed(() => props.medias.length)

watch(
  () => props.medias,
  () => {
    index.value = 0
  },
)

const slides = computed(() =>
  props.medias.map((media) => {
    const translation = pickTranslation(media, ui.locale)
    return {
      media,
      title: translation.title || media?.fileName || t('media.untitled'),
      description: translation.description,
      // The clock alone: the card is only ever shown over a day page, so the
      // date is a fact the reader already has.
      stamp: media ? formatShortTime(media.created, ui.locale) : '',
    }
  }),
)

/* The same length as a turn in the full-screen viewer - one constant, two
   places, so the two movements read as the same gesture. */
const trackStyle = computed(() => ({
  transform: `translateY(${-index.value * SLIDE_PX}px)`,
  transitionDuration: `${SLIDE_MS}ms`,
}))

/** One record back or forward, never past either end. */
function step(delta) {
  const next = index.value + delta
  if (next < 0 || next >= count.value) return
  index.value = next
}

/*
  A wheel turns the card by steps, not by pixels: one notch, one record, and the
  track's own transition plays the movement. A short lock keeps a trackpad's
  stream of tiny deltas from running through the whole list.
*/
const WHEEL_NOTCH = 24
const STEP_LOCK_MS = 120
let wheelAccum = 0
let stepLockUntil = 0

function onWheel(event) {
  if (count.value < 2) return
  event.preventDefault()
  if (performance.now() < stepLockUntil) return

  wheelAccum += event.deltaY
  if (Math.abs(wheelAccum) < WHEEL_NOTCH) return

  const delta = wheelAccum > 0 ? 1 : -1
  wheelAccum = 0
  stepLockUntil = performance.now() + STEP_LOCK_MS
  step(delta)
}

/* On a touch screen the same step is a swipe: up for the next record, down for
   the one before, which is the direction the wheel already turns. */
const SWIPE_COMMIT = 30
let swipe = null

function onTouchStart(event) {
  const touch = event.touches[0]
  swipe = touch ? { y: touch.clientY } : null
}

function onTouchMove(event) {
  if (!swipe) return
  // The track never scrolls the page; claiming the moves keeps the swipe ours.
  if (event.cancelable) event.preventDefault()
}

function onTouchEnd(event) {
  const touch = event.changedTouches[0]
  const start = swipe
  swipe = null
  if (!start || !touch) return
  const dy = touch.clientY - start.y
  if (Math.abs(dy) < SWIPE_COMMIT) return
  step(dy < 0 ? 1 : -1)
}

/*
  Opening full screen marks **no source**: the picture is a 160px stand-in, and
  the viewer must not search for a tile to fly from. It plays its plain fade.
  See docs/features/media-viewer.md.
*/
function openAt(media) {
  if (media?.id == null) return
  markOpenedWithoutSource()
  emit('open', media.id)
}

/** Fixed width, so it can be placed to the right and flipped before painting. */
const CARD_WIDTH = 384
const GAP = 8

const position = computed(() => {
  const rect = props.anchorRect
  if (!rect) return {}
  const { scrollX, scrollY, innerWidth } = window
  let left = rect.right + scrollX + GAP
  if (rect.right + GAP + CARD_WIDTH > innerWidth) {
    left = Math.max(scrollX + GAP, rect.left + scrollX - CARD_WIDTH - GAP)
  }
  const top = Math.max(scrollY + GAP, rect.top + scrollY - GAP)
  return { top: `${Math.round(top)}px`, left: `${Math.round(left)}px` }
})
</script>

<template>
  <div
    class="media-hover-card"
    :style="position"
    @click.capture="onRootClickCapture"
    @mouseenter="emit('enter')"
    @mouseleave="emit('leave')"
    @wheel="onWheel"
  >
    <!-- A way out by hand, in case the timeout runs while the pointer is away. -->
    <button
      type="button"
      class="absolute right-1 top-1 z-10 rounded-full p-1 text-ink-faint transition hover:text-ink"
      :aria-label="t('common.close')"
      @click="emit('close')"
    >
      <svg
        class="h-3.5 w-3.5"
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        aria-hidden="true"
      >
        <path d="m5 5 10 10M15 5 5 15" stroke-linecap="round" />
      </svg>
    </button>

    <!--
      The strip: every record stacked, the viewport showing one. Moving between
      them slides the whole stack behind the card's edge, the way the full-screen
      viewer turns a page - no fade, so the list reads as one continuous thing.
    -->
    <div
      class="carousel-viewport"
      @touchstart.passive="onTouchStart"
      @touchmove="onTouchMove"
      @touchend="onTouchEnd"
      @touchcancel="onTouchEnd"
    >
      <div class="carousel-track" :style="trackStyle">
        <div v-for="(slide, i) in slides" :key="i" class="carousel-slide">
          <div v-if="slide.media" class="flex h-full gap-3 pr-5">
            <!-- Square thumbnail on the left; the whole card's subject. -->
            <div class="relative h-40 w-40 shrink-0">
              <button
                type="button"
                class="block h-full w-full overflow-hidden rounded bg-edge/40"
                :title="t('richText.openMedia')"
                :aria-label="t('richText.openMedia')"
                @click="openAt(slide.media)"
              >
                <MediaThumb :media="slide.media" :alt="slide.title" />
              </button>

              <!-- Which record of how many. Stamped like the clock, in the
                   opposite corner so the two never sit on each other. -->
              <span
                v-if="count > 1"
                class="pointer-events-none absolute bottom-1.5 left-1.5 rounded bg-ink/70 px-1.5 py-0.5 text-[10px] font-medium text-paper"
              >
                {{ i + 1 }}/{{ count }}
              </span>

              <!-- Stamped on the picture, the way a day's own tiles do it. -->
              <span
                v-if="slide.stamp"
                class="pointer-events-none absolute bottom-1.5 right-1.5 rounded bg-ink/70 px-1.5 py-0.5 text-[10px] font-medium text-paper"
              >
                {{ slide.stamp }}
              </span>
            </div>

            <div class="flex h-40 min-w-0 flex-1 flex-col">
              <p class="line-clamp-2 text-sm font-medium text-ink">{{ slide.title }}</p>
              <p v-if="slide.description" class="mt-0.5 line-clamp-3 text-xs text-ink-soft">
                {{ slide.description }}
              </p>
              <!-- The way to the tile - the action the text itself takes on a
                   mouse click, offered here where a tap shows this card instead. -->
              <button
                type="button"
                class="mt-auto self-end text-xs font-medium text-accent transition hover:underline -mr-3"
                @click="emit('activate')"
              >
                {{ t('richText.gotoMedia') }}
              </button>
            </div>
          </div>

          <!-- Nothing here resolves; say so plainly. -->
          <div v-else class="flex h-full items-center gap-3 pr-5">
            <span
              class="flex h-40 w-40 shrink-0 items-center justify-center rounded bg-edge/40 text-ink-faint"
              aria-hidden="true"
            >
              <svg
                class="h-6 w-6"
                viewBox="0 0 20 20"
                fill="none"
                stroke="currentColor"
                stroke-width="1.5"
              >
                <rect x="3" y="4" width="14" height="12" rx="2" />
                <path
                  d="m3.5 13 4-4 3 3 2.5-2.5 3.5 3.5"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
            </span>
            <div class="min-w-0 flex-1">
              <p class="text-sm font-medium text-ink">{{ t('richText.mediaMissing') }}</p>
              <p class="mt-0.5 text-xs text-ink-soft">{{ t('richText.mediaMissingHint') }}</p>
              <p v-if="label" class="mt-1 truncate text-[11px] text-ink-faint">{{ label }}</p>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Our own bar, standing for the list rather than a scroller. Where it sits
         is set here; stepping and the thumb's movement live in the component. -->
    <SteppedScrollbar v-model:index="index" :count="count" class="top-[1.75rem] mb-1" />
  </div>
</template>
