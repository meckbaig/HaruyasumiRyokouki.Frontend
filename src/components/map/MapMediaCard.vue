<script setup>
import { computed, onBeforeUnmount, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useUiStore } from '@/stores/ui'
import MediaThumb from '@/components/media/MediaThumb.vue'
import MediaStrip from '@/components/common/MediaStrip.vue'
import { pickTranslation } from '@/services/translations'
import { isVideo } from '@/services/mediaType'
import { formatShortTime, formatShortDateTime } from '@/services/dates'
import { markOpenedFrom } from '@/services/openedFrom'
import { MAP_SERVICES, mapServiceUrl } from '@/services/mapLinks'

/**
 * The album that opens over a map pin. The **pin itself becomes this**: the pin
 * is hidden while the card stands, the card unfolds from where it was, and it is
 * always above the point. Styled after `MediaHoverCard`, wearing the Lightbox's
 * own chrome and turning a page with the viewer's own strip.
 *
 * **It takes no presses of its own.** Only its controls and its text do, so a
 * drag, a wheel or a pinch anywhere over the picture is still the map's; a press
 * on the picture is read from its geometry by `TripMap`, which owns the map.
 * See docs/features/maps.md.
 */
const props = defineProps({
  /** The pins in chronological order; the arrows walk this list. */
  medias: { type: Array, default: () => [] },
  /** Which of `medias` is on show. */
  index: { type: Number, default: 0 },
  /** `map` shows the date with the time and offers "open day"; `day` offers "go to media". */
  mode: { type: String, default: 'map' },
  /** The pin's position in the map's own box, in pixels. */
  anchor: { type: Object, default: null },
  /** The map box, for keeping the card inside it. */
  bounds: { type: Object, default: null },
})

const emit = defineEmits(['update:index', 'close', 'open', 'open-day', 'activate', 'settled'])

const { t } = useI18n()
const ui = useUiStore()

const root = ref(null)

const count = computed(() => props.medias.length)

/** The clock alone on a day page - the date there is a fact the reader has. */
const withDate = computed(() => props.mode === 'map')

/**
 * The frame the strip has **settled** on. The badges, the open-full target, the
 * service links and the primary action all read this, never `props.index` -
 * which names where a running turn is going, not the picture on screen.
 * See docs/features/maps.md.
 */
const shownIndex = ref(props.index)

const currentItem = computed(() => props.medias[shownIndex.value] ?? null)

const labelOf = (media) =>
  pickTranslation(media, ui.locale).title || media?.fileName || t('media.untitled')

const descriptionOf = (media) => pickTranslation(media, ui.locale).description

/** The stamp follows the page: a day page has already said the date. */
const stampOf = (media) =>
  !media?.created
    ? ''
    : withDate.value
      ? formatShortDateTime(media.created, ui.locale)
      : formatShortTime(media.created, ui.locale)

const isVideoItem = (media) => isVideo(media)

/** Every service link for the file on show, in the order `MAP_SERVICES` lists them. */
const services = computed(() =>
  MAP_SERVICES.map((service) => ({
    id: service.id,
    label: t(service.label),
    href: mapServiceUrl(currentItem.value, service.id, { locale: ui.locale }),
  })).filter((service) => service.href),
)

/*
  The turn carries the **whole** of the viewer's guard - one remembered step, a
  frame-timed dispatch, "ignore while turning" and a settle fallback - because a
  held arrow is otherwise a backlog: the index runs on to wherever the repeats
  got to and the strip snaps there instead of keeping its beat. `shownIndex`
  follows the strip's settle, so nothing on the card races the picture.
  See docs/features/media-viewer.md.
*/
/** A slide's own length plus a margin, for a settle that never arrives. */
const TURN_FALLBACK_MS = 480
let turning = false
let queuedTurn = 0
let queuedFrame = 0
let turnTimer = null

/** Steps the album, one turn at a time however fast the input arrives. */
function step(delta) {
  const next = props.index + delta
  if (next < 0 || next >= count.value) return
  // Waits its own turn; the running slide cannot be cut short. Only **one** is
  // remembered, or a held arrow keeps turning after the key comes up.
  if (turning) {
    queuedTurn = Math.sign(delta)
    return
  }

  turning = true
  emit('update:index', next)
  clearTimeout(turnTimer)
  turnTimer = setTimeout(finishTurn, TURN_FALLBACK_MS)
}

/** A turn has landed: the content takes the frame the strip settled on. */
function onSettled(frame) {
  if (frame != null) shownIndex.value = frame
  finishTurn()
  emit('settled')
}

/** Ends the running turn and dispatches the one that waited for it. */
function finishTurn() {
  clearTimeout(turnTimer)
  turnTimer = null
  turning = false
  if (!queuedTurn) return

  const waiting = queuedTurn
  queuedTurn = 0
  // A frame, not a tick: the next turn must start from a rest the browser has
  // drawn, or it begins from where the track stood before the settle.
  cancelAnimationFrame(queuedFrame)
  queuedFrame = requestAnimationFrame(() => step(waiting))
}

onBeforeUnmount(() => {
  clearTimeout(turnTimer)
  cancelAnimationFrame(queuedFrame)
})

/**
 * Onto the album. The card's picture **is** the tile the viewer flies from, so
 * the opening is the grid's opening - the same service, the same flight.
 */
function openFull() {
  const media = currentItem.value
  if (media?.id == null) return
  markOpenedFrom(photoElement())
  emit('open', media.id)
}

/** The primary action: elsewhere on the site it is the way to the day. */
function primary() {
  const media = currentItem.value
  if (!media) return
  if (withDate.value) {
    const date = typeof media.created === 'string' ? media.created.slice(0, 10) : null
    emit('open-day', { date, id: media.id })
    return
  }
  emit('activate', media.id)
}

/**
 * The picture on show, for whoever needs its box: `TripMap` reads it to tell a
 * press on the picture from a press on the map, and the viewer flies from it.
 * **The active record's**, never the first one in the DOM - the strip has both
 * neighbours mounted, and theirs sit off to either side.
 */
function photoElement() {
  const card = root.value
  if (!card) return null
  // A card whose strip has not settled on a frame yet still has the picture on
  // show at its first record; the unfold must never be handed `null`.
  return (
    card.querySelector('.map-card-record-active .map-card-photo') ??
    card.querySelector('.map-card-photo') ??
    null
  )
}

function photoRect() {
  return photoElement()?.getBoundingClientRect() ?? null
}

defineExpose({ element: () => root.value, photoRect, photoElement, openFull, step })

const CARD_WIDTH = 340
const EDGE = 8

/*
  Anchored to the point by its **bottom** edge: `top` is the anchor and the
  stylesheet pulls the frame up by its own height (`translate(-50%, -100%)`), so
  it grows upward and sideways and its tail keeps touching the point. The frame
  moves, never the card. See docs/features/maps.md.
*/
const position = computed(() => {
  const anchor = props.anchor
  if (!anchor) return {}

  const box = props.bounds
  const width = box
    ? Math.min(CARD_WIDTH, Math.max(200, box.width - EDGE * 2))
    : CARD_WIDTH
  return {
    left: `${Math.round(anchor.x)}px`,
    top: `${Math.round(anchor.y)}px`,
    '--map-card-width': `${Math.round(width)}px`,
  }
})
</script>

<template>
  <div
    v-if="currentItem"
    ref="root"
    class="map-card"
    :style="position"
  >
    <div class="map-card-inner lightbox-chrome">
      <div class="map-card-body">
        <!-- One frame on show and its neighbours beside it, turned the way the
             viewer turns a page. -->
        <MediaStrip :items="medias" :index="index" @settled="onSettled">
          <template #default="{ item, frame }">
            <div
              class="map-card-record"
              :class="frame === shownIndex ? 'map-card-record-active' : ''"
            >
              <div class="map-card-photo">
                <MediaThumb class="map-card-photo-media" :media="item" :alt="labelOf(item)" />

                <!-- One row in the bottom left, the corner a grid tile stamps too. -->
                <span class="pointer-events-none absolute bottom-1.5 left-1.5 flex items-center gap-1">
                  <span
                    v-if="count > 1"
                    class="rounded bg-ink/70 px-1.5 py-0.5 text-[10px] font-medium text-paper"
                  >
                    {{ shownIndex + 1 }}/{{ count }}
                  </span>
                  <span
                    v-if="isVideoItem(item)"
                    class="flex items-center gap-1 rounded bg-ink/70 px-1.5 py-0.5 text-[10px] font-medium text-paper"
                  >
                    <svg class="h-3 w-3" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
                      <path d="M3.5 2.5v7l6-3.5z" />
                    </svg>
                    {{ t('media.video') }}
                  </span>
                </span>

                <span
                  v-if="stampOf(item)"
                  class="pointer-events-none absolute bottom-1.5 right-1.5 rounded bg-ink/70 px-1.5 py-0.5 text-[10px] font-medium text-paper"
                >
                  {{ stampOf(item) }}
                </span>
              </div>

              <!-- Selectable: a place name is the one thing here worth copying. -->
              <div class="map-card-text lightbox-selectable">
                <p class="line-clamp-2 text-sm font-medium text-ink" :title="labelOf(item)">
                  {{ labelOf(item) }}
                </p>
                <p v-if="descriptionOf(item)" class="mt-0.5 line-clamp-3 text-xs text-ink-soft">
                  {{ descriptionOf(item) }}
                </p>
              </div>
            </div>
          </template>
        </MediaStrip>

        <!-- Over the picture, the same box as it: the card's width less its
             padding, at the record's own 16:9. -->
        <div class="map-card-arrows">
          <button
            v-if="shownIndex > 0"
            type="button"
            class="lightbox-icon lightbox-arrow icon-button"
            :aria-label="t('media.prev')"
            @click="step(-1)"
          >
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
              <path d="M12.5 4 6.5 10l6 6" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </button>
          <span v-else />
          <button
            v-if="shownIndex < count - 1"
            type="button"
            class="lightbox-icon lightbox-arrow icon-button"
            :aria-label="t('media.next')"
            @click="step(1)"
          >
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
              <path d="M7.5 4l6 6-6 6" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </button>
          <span v-else />
        </div>

        <button
          type="button"
          class="map-card-close"
          :aria-label="t('common.close')"
          @click="emit('close')"
        >
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
            <path d="m5 5 10 10M15 5 5 15" stroke-linecap="round" />
          </svg>
        </button>

        <div class="map-card-actions">
          <a
            v-for="service in services"
            :key="service.id"
            class="lightbox-icon lightbox-arrow icon-button"
            :href="service.href"
            target="_blank"
            rel="noopener noreferrer"
            :title="service.label"
            :aria-label="service.label"
          >
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
              <path d="M10 18s6-5.1 6-9.5A6 6 0 0 0 4 8.5C4 12.9 10 18 10 18Z" />
              <circle cx="10" cy="8.5" r="2.2" />
            </svg>
          </a>
          
          <button
            type="button"
            class="lightbox-icon lightbox-arrow icon-button"
            :title="withDate ? t('search.openDay') : t('richText.gotoMedia')"
            :aria-label="withDate ? t('search.openDay') : t('richText.gotoMedia')"
            @click="primary"
          >
            <!-- A calendar on the trip page; a target on the day, where the file
                 is already here and the reader only needs it singled out. -->
            <svg
              v-if="withDate"
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              stroke-width="1.6"
              aria-hidden="true"
            >
              <rect x="3" y="4.5" width="14" height="12.5" rx="2" />
              <path d="M3 8h14M7 3v3M13 3v3" stroke-linecap="round" />
            </svg>
            <svg
              v-else
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              stroke-width="1.6"
              aria-hidden="true"
            >
              <circle cx="10" cy="10" r="6" />
              <circle cx="10" cy="10" r="1.6" fill="currentColor" stroke="none" />
              <path d="M10 1.5v3M10 15.5v3M1.5 10h3M15.5 10h3" stroke-linecap="round" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
