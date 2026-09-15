<script setup>
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import MediaGrid from '@/components/media/MediaGrid.vue'
import MediaLightbox from '@/components/media/MediaLightbox.vue'
import MediaContextMenu from '@/components/media/MediaContextMenu.vue'
import TripCalendar from '@/components/calendar/TripCalendar.vue'
import TripMap from '@/components/map/TripMap.vue'
import ShareButton from '@/components/common/ShareButton.vue'
import HiddenRecordsToggle from '@/components/common/HiddenRecordsToggle.vue'
import SkeletonGrid from '@/components/common/SkeletonGrid.vue'
import ErrorState from '@/components/common/ErrorState.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import RichText from '@/components/common/RichText.vue'
import MediaEditDialog from '@/components/editor/MediaEditDialog.vue'
import DayEditForm from '@/components/editor/DayEditForm.vue'
import { deleteMedia } from '@/api/media'
import { useDaysStore } from '@/stores/days'
import { useAuthStore } from '@/stores/auth'
import { useUiStore } from '@/stores/ui'
import { useEditorStore } from '@/stores/editor'
import { formatLongDate, formatWeekday } from '@/services/dates'
import { isFallbackLanguage } from '@/services/translations'
import { useHorizontalSwipe } from '@/composables/useHorizontalSwipe'
import { useMediaLink } from '@/composables/useMediaLink'
import { scrollToMedia, scrollTargetFor } from '@/services/scrollToMedia'
import { tileFor } from '@/services/mediaTiles'
import { routeFromMedia } from '@/composables/useTripMedia'
import { hasOverlay } from '@/services/overlayStack'
import { chromeInsets } from '@/services/pageChrome'
import { useHiddenRecords } from '@/composables/useHiddenRecords'
import {
  useTextAnchor,
  setTextAnchor,
  clearTextAnchor,
  returnToTextAnchor,
  anchorSelector,
} from '@/services/textAnchor'
import { resolvePick } from '@/services/mediaPick'

const props = defineProps({
  date: { type: String, required: true },
})

const { t } = useI18n()
const router = useRouter()
const days = useDaysStore()
const auth = useAuthStore()
const ui = useUiStore()
const editor = useEditorStore()

const MAP_HIDDEN_KEY = 'haruyasumi.dayMapHidden'

const loading = ref(false)
const error = ref(null)
const lightboxIndex = ref(null)
const editing = ref(null)
const editingNote = ref(false)
/** `{ media, x, y }` of the file right-clicked in the grid. */
const contextTarget = ref(null)

/*
  The note's own references. A click brings the file's tile into view and singles
  it out; the card's thumbnail opens it full screen. Following one is a step away
  from the line, so it is remembered and given a history entry of its own - but
  only when the jump scrolled the page at all.
  See docs/features/rich-text-and-links.md.
*/
const textAnchor = useTextAnchor()
const hasTextAnchor = computed(() => Boolean(textAnchor.value))
/*
  Not a fact about the trip, and not part of what is remembered: all the files
  the reference did not name dim for a second, so a block that is out of sight
  still announces itself. See docs/features/rich-text-and-links.md.
*/
const noteEmphasis = ref(false)
const EMPHASIS_MS = 1000
let emphasisTimer = null

/** Runs the dim down, or starts it over while the page is still moving. */
function holdEmphasis() {
  clearTimeout(emphasisTimer)
  emphasisTimer = setTimeout(() => (noteEmphasis.value = false), EMPHASIS_MS)
}

function flashEmphasis() {
  noteEmphasis.value = true
  holdEmphasis()
}

/**
 * The dim has to outlast the glide to the block. On a phone a long scroll took
 * longer than `EMPHASIS_MS`, so the wall lit again before the block was reached.
 * Every scroll the dim is still standing pushes its end back by another window.
 * See docs/features/rich-text-and-links.md.
 */
function onEmphasisScroll() {
  if (noteEmphasis.value) holdEmphasis()
}

function referenceRect(reference) {
  return document.querySelector(anchorSelector(reference))?.getBoundingClientRect() ?? null
}

/**
 * How far the follow will move the page: `scrollToMedia` places the block, and
 * the page may run out of room before it gets there. Null when the tiles are
 * not on the page yet, which the grid is about to fix.
 */
function followDelta(reference) {
  const ids = reference.ids ?? [reference.mediaId]
  const tiles = ids.filter((id) => id != null).map((id) => tileFor(id)).filter(Boolean)
  const target = scrollTargetFor(tiles)
  if (target == null) return null
  return target - window.scrollY
}

/**
 * Whether the follow scrolls the page **and** carries its line out of the band a
 * reader reads. A nudge that leaves the line in view is no departure, so it is
 * not remembered. See docs/features/rich-text-and-links.md.
 */
function followLeavesLine(reference) {
  const delta = followDelta(reference)
  if (delta == null) return true
  if (delta === 0) return false

  const rect = referenceRect(reference)
  if (!rect) return false
  const top = chromeInsets().top + ACTIVE_TOP_GAP
  return rect.top - delta < top || rect.bottom - delta > window.innerHeight - ACTIVE_BOTTOM_GAP
}

/**
 * The band of the window in which a line counts as read again: clear of the
 * sticky header and of the bottom edge, so a word peeking at the very top is not
 * mistaken for the block being back in view.
 * See docs/features/rich-text-and-links.md.
 */
const ACTIVE_TOP_GAP = 24
const ACTIVE_BOTTOM_GAP = 80

function referenceReadable(reference) {
  const rect = referenceRect(reference)
  if (!rect) return false
  const top = chromeInsets().top + ACTIVE_TOP_GAP
  return rect.top >= top && rect.bottom <= window.innerHeight - ACTIVE_BOTTOM_GAP
}

/**
 * Remembers the line a reference was followed from and gives the step an entry
 * of its own, so the browser's Back returns to the note. Written by **any**
 * follow that scrolled the page, however little; the memory is spent the moment
 * the line is readable again. See docs/features/rich-text-and-links.md.
 */
function departFromText(reference) {
  setTextAnchor(reference)
  mediaLink.push(reference.ids ?? [reference.mediaId], false)
}

/* A settled scroll decides whether the line is back in the band; during a smooth
   scroll the events keep postponing the check. */
let scrollSettleTimer = null

function onScrollCheck() {
  if (!textAnchor.value) return
  clearTimeout(scrollSettleTimer)
  scrollSettleTimer = setTimeout(settleAnchor, 160)
}

function settleAnchor() {
  if (!textAnchor.value) return
  if (referenceReadable(textAnchor.value)) clearTextAnchor()
}

/**
 * Following the text into the pile. The address names **every** file the
 * reference carried, so the outline and the link agree. A jump that scrolls the
 * page at all is a departure and is given a history entry; one that moves
 * nothing only outlines the file. See docs/features/rich-text-and-links.md.
 */
function activateNoteMedia(reference) {
  if (followLeavesLine(reference)) {
    departFromText(reference)
    // The page may be too short to move at all; settle the question once anyway.
    onScrollCheck()
  } else {
    mediaLink.write(reference.ids, false)
  }
  flashEmphasis()
  scrollToMedia(reference.ids?.length ? reference.ids : reference.mediaId)
}

/**
 * Opening the card's picture full screen. The card sits beside the line and
 * nothing scrolls, so this is no departure: the line is where the reader left
 * it, and a way back only stands if a follow put one there.
 */
function openNoteMedia(reference) {
  const index = media.value.findIndex((item) => item.id === reference.mediaId)
  if (index >= 0) lightboxIndex.value = index
}

/** A tile press. While a reference is being picked the id goes to the field. */
function onGridOpen(item) {
  if (resolvePick(item?.id)) return
  const index = media.value.indexOf(item)
  if (index >= 0) lightboxIndex.value = index
}

/** True while a popstate is being answered, when the address is the browser's. */
let answeringPop = false
/** True while a popstate is returning to the note, so the link does not scroll. */
let returningToText = false

/**
 * The browser's own Back and Forward. A step onto an entry that does not ask for
 * the viewer closes it, and if a line is remembered that step **is** the return
 * to the note. One that asks for the viewer keeps it open.
 * See docs/features/rich-text-and-links.md.
 */
function onPopState() {
  const wanted = new URLSearchParams(window.location.search).get('o') === '1'
  if (wanted) return

  // The address is the browser's to settle now; a write from the close would
  // cancel the very step it is making.
  if (lightboxIndex.value != null) {
    answeringPop = true
    lightboxIndex.value = null
    nextTick(() => (answeringPop = false))
  }

  if (!textAnchor.value) return
  // The link's own scroll must not fight the return to the note.
  returningToText = true
  returnToTextAnchor()
  nextTick(() => (returningToText = false))
}

// Persisted preference: some visitors find the day map distracting, so it can be
// hidden by default. When on, the map starts collapsed and a show/hide button
// takes the place of the plain heading.
const mapHiddenByDefault = ref(localStorage.getItem(MAP_HIDDEN_KEY) === '1')
const mapShown = ref(!mapHiddenByDefault.value)

function toggleMapDefault() {
  mapHiddenByDefault.value = !mapHiddenByDefault.value
  localStorage.setItem(MAP_HIDDEN_KEY, mapHiddenByDefault.value ? '1' : '0')
  // Reflect the new default in the current view immediately.
  mapShown.value = !mapHiddenByDefault.value
}

const day = computed(() => days.getDay(props.date))
/* The editor's hide toggle removes private files here, on the fly; the cached
   day is left untouched, so showing them again is instant. */
const { withoutHidden } = useHiddenRecords()
const media = computed(() => withoutHidden(day.value?.media ?? []))
const locatedMedia = computed(() =>
  media.value.filter(
    (item) => Number.isFinite(item?.latitude) && Number.isFinite(item?.longitude),
  ),
)
/* The path through the day, in capture order - the same line the trip map draws
   across months, from the same function. See docs/features/maps.md. */
const dayRoute = computed(() => routeFromMedia(locatedMedia.value))

/**
 * How many files this day holds, known from the day list before the day itself
 * has been fetched - which is what lets the placeholder be the right size. Null
 * until the list has arrived, and the placeholder falls back to two rows.
 */
const expectedMedia = computed(() => days.byDate.get(props.date)?.mediaCount ?? null)
const neighbours = computed(() => days.neighbours(props.date))
const showFallbackNotice = computed(() => isFallbackLanguage(day.value, ui.locale))

const heading = computed(() => formatLongDate(props.date, ui.locale))
const weekday = computed(() => formatWeekday(props.date, ui.locale))

async function load(force = false) {
  loading.value = true
  error.value = null
  try {
    await days.loadDay(props.date, force)
  } catch (caught) {
    error.value = caught
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  days.loadList()
  load()
})

// Navigating between days reuses this component, so react to the param itself.
watch(
  () => props.date,
  () => {
    load()
    // Each day starts from the persisted default.
    mapShown.value = !mapHiddenByDefault.value
    // Another day carries its own link, or none at all.
    answered = undefined
    // The anchor named an element of the note just left.
    clearTextAnchor()
    noteEmphasis.value = false
  },
)

// A locale switch clears the cache; refetch the day the visitor is looking at.
watch(() => ui.locale, () => load(true))

function openDay(date) {
  router.push({ name: 'day', params: { date } })
}

/*
  A link pointing at one file of this day. **Read every time the file pointed at
  changes**, not once per day - the day's own map links back into the day it is
  already on. See docs/features/sharing-and-links.md.
*/
// Any overlay, not just this page's viewer: one opened from an edit dialog
// still covers the outline, and a press over it is not the reader dismissing it.
const mediaLink = useMediaLink({ suspended: () => hasOverlay() })
const highlightedId = computed(() => mediaLink.link.value.id)
/** Every file the link names, so the wall outlines the whole block at once. */
const highlightedIds = computed(() => mediaLink.link.value.ids)

/** The file already answered for, so the same one is not answered for twice. */
let answered

watch(
  [media, () => mediaLink.link.value],
  ([list, link]) => {
    // A return to the note owns the page's scroll; the link must not pull to
    // the wall underneath it. See docs/features/rich-text-and-links.md.
    if (returningToText) {
      answered = link.id
      return
    }
    if (!list.length || answered === link.id) return
    answered = link.id
    if (link.id == null) return

    const index = list.findIndex((item) => item.id === link.id)
    if (index < 0) {
      // Not this day's file: a stale link, or one shared from somewhere else.
      // Only once the day has settled, though - a reload leaves the previous
      // day's files standing until the new ones arrive, and a link answered
      // against those would be thrown away for the wrong reason.
      if (!loading.value) mediaLink.clear()
      else answered = undefined
      return
    }

    if (link.open) lightboxIndex.value = index
    else scrollToMedia(link.ids)
  },
  { immediate: true },
)

// Files deleted through the app-level toolbar; the page cannot hear its events.
watch(() => editor.lastDelete, () => load(true))

/**
 * Opening or paging a file replaces the address; closing drops the pair. **The
 * only entry of its own is the one a follow leaves behind**, so a picture turned
 * to or a viewer closed never buries the note under another step.
 * See docs/features/rich-text-and-links.md.
 */
watch(lightboxIndex, (index) => {
  // A popstate is answering for the address; a write here would cancel the step.
  if (answeringPop) return

  const opened = index == null ? null : media.value[index]
  if (opened) mediaLink.write(opened.id, true)
  else mediaLink.clear()
})

/**
 * Left/right arrows step between days. Ignored while typing and while **anything**
 * is open over the page - `hasOverlay()`, not this page's own viewer, which is
 * not the only one that can be up. See docs/features/ui-shell.md.
 */
function onKeydown(event) {
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
  if (hasOverlay() || editingNote.value) return

  const el = document.activeElement
  const tag = el?.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el?.isContentEditable) return

  const target = event.key === 'ArrowLeft' ? neighbours.value.prev : neighbours.value.next
  if (target) {
    event.preventDefault()
    router.push({ name: 'day', params: { date: target } })
  }
}

onMounted(() => document.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown))
onMounted(() => window.addEventListener('popstate', onPopState))
onBeforeUnmount(() => window.removeEventListener('popstate', onPopState))
// Seeing the reference again is the one thing that spends the way back. A
// settled scroll answers it, and `scrollend` answers at once where it exists.
onMounted(() => window.addEventListener('scroll', onScrollCheck, { passive: true }))
onBeforeUnmount(() => window.removeEventListener('scroll', onScrollCheck))
onMounted(() => window.addEventListener('scroll', onEmphasisScroll, { passive: true }))
onBeforeUnmount(() => window.removeEventListener('scroll', onEmphasisScroll))
onMounted(() => document.addEventListener('scrollend', settleAnchor))
onBeforeUnmount(() => document.removeEventListener('scrollend', settleAnchor))
onBeforeUnmount(() => clearTextAnchor())
onBeforeUnmount(() => clearTimeout(emphasisTimer))
onBeforeUnmount(() => clearTimeout(scrollSettleTimer))

/**
 * Touch equivalent of the arrow keys. Suspended under an overlay and during a
 * selection, where the same stroke paints. See docs/features/days-and-calendar.md.
 */
const swipe = useHorizontalSwipe({
  isEnabled: () => !hasOverlay() && !editor.selectionMode,
  onLeft: () => neighbours.value.next && openDay(neighbours.value.next),
  onRight: () => neighbours.value.prev && openDay(neighbours.value.prev),
})

/**
 * The dialog writes the saved model straight onto the file it was editing, and
 * that file is the one in the grid - so the tile, its tags and its marks are
 * already right by the time this runs. Only a save that answered with nothing to
 * write leaves the page having to ask the server what it just sent.
 */
function onMediaSaved({ applied } = {}) {
  editing.value = null
  if (!applied) load(true)
}

/**
 * Deleting is offered wherever a file can be edited. **The confirmation and the
 * request belong to the page**, not the dialog - what to do with the hole left
 * behind differs by page. See docs/features/media-editor.md.
 */
async function removeMedia(list) {
  // The dialog hands over everything it was editing; these pages only ever open
  // it on one file.
  const media = Array.isArray(list) ? list[0] : list
  if (!media) return

  const agreed = await ui.confirm({
    title: t('admin.deleteTitle'),
    message: t('admin.deleteConfirm', { name: media.fileName }),
    confirmLabel: t('common.delete'),
  })
  if (!agreed) return

  try {
    await deleteMedia(media.id)
    ui.notify(t('admin.deleted'), 'success')
    editing.value = null
    load(true)
  } catch (caught) {
    ui.notify(caught?.detail || caught?.title || t('errors.generic'), 'error')
  }
}

function onNoteSaved() {
  editingNote.value = false
  load(true)
  days.loadList(true)
}
</script>

<template>
  <div
    class="mx-auto max-w-6xl px-4 py-8"
    @touchstart.passive="swipe.onTouchStart"
    @touchend="swipe.onTouchEnd"
    @touchcancel="swipe.onTouchCancel"
  >
    <header class="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <p class="text-xs uppercase tracking-wide text-ink-faint">{{ weekday }}</p>
        <h1 class="mt-1 text-2xl font-semibold tracking-tight text-ink">{{ heading }}</h1>
        <p class="mt-1 text-sm text-ink-faint" :class="media.length ? 'opacity-100' : 'opacity-0'">
          {{ t('day.mediaCount', { count: media.length }, media.length) }}
        </p>
      </div>

      <div class="flex items-center gap-2">
        <HiddenRecordsToggle v-if="auth.isEditor" />
        <RouterLink
          v-if="neighbours.prev"
          :to="{ name: 'day', params: { date: neighbours.prev } }"
          class="btn-ghost !px-3"
          :aria-label="t('day.prev')"
        >
          <svg
            class="h-4 w-4"
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            aria-hidden="true"
          >
            <path d="M12.5 4 6.5 10l6 6" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </RouterLink>
        <RouterLink
          v-if="neighbours.next"
          :to="{ name: 'day', params: { date: neighbours.next } }"
          class="btn-ghost !px-3"
          :aria-label="t('day.next')"
        >
          <svg
            class="h-4 w-4"
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            aria-hidden="true"
          >
            <path d="M7.5 4l6 6-6 6" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </RouterLink>
        <ShareButton />
      </div>
    </header>

    <ErrorState v-if="error" :error="error" @retry="load(true)" />

    <template v-else>
      <p
        v-if="showFallbackNotice"
        class="mb-6 rounded-md bg-edge/50 px-4 py-2 text-xs text-ink-soft"
      >
        {{ t('language.fallbackNotice') }}
      </p>

      <section class="mb-10">
        <div class="mb-3 flex items-center justify-between gap-4">
          <h2 class="text-sm font-semibold text-ink-soft">{{ t('day.note') }}</h2>
          <button
            v-if="auth.isEditor && !editingNote"
            type="button"
            class="text-xs text-ink-faint underline underline-offset-4 transition hover:text-ink"
            @click="editingNote = true"
          >
            {{ t('common.edit') }}
          </button>
        </div>

        <!--
          The note folds away and the editor unfolds in its place. `out-in`,
          because the two are nothing like the same height and playing them at
          once would have the section jumping between the two while they cross.
        -->
        <Transition name="reveal" mode="out-in">
          <div v-if="editingNote && day" key="edit" class="reveal reveal-stagger">
            <!-- No strip of thumbnails: the day's own grid is right below. -->
            <DayEditForm
              :day="day"
              :date="date"
              :show-thumbs="false"
              @saved="onNoteSaved"
              @cancel="editingNote = false"
            />
          </div>
          <div v-else key="note" class="reveal">
            <div v-if="loading && !day" class="space-y-2">
              <div class="h-4 w-3/4 animate-pulse rounded bg-edge/60" />
              <div class="h-4 w-full animate-pulse rounded bg-edge/60" />
              <div class="h-4 w-5/6 animate-pulse rounded bg-edge/60" />
            </div>
            <!-- The note is markup: links, and files referenced by id. The
                 reference records where it was, so the viewer can offer a way
                 back. See docs/features/rich-text-and-links.md. -->
            <p
              v-else-if="day?.note"
              class="note-reveal whitespace-pre-wrap text-sm leading-relaxed text-ink-soft"
            >
              <RichText
                :text="day.note"
                :media="media"
                anchorable
                @media-activate="activateNoteMedia"
                @media-open="openNoteMedia"
              />
            </p>
            <p v-else class="note-reveal text-sm text-ink-faint">{{ t('day.noNote') }}</p>
          </div>
        </Transition>
      </section>

      <!--
        The placeholder and the grid share one grid cell, so they overlap for the
        length of the hand-over instead of one being taken away before the other
        arrives. With the placeholder drawn to the day's own file count, the two
        are the same height and nothing moves as they cross.
      -->
      <section class="mb-12 grid [&>*]:col-start-1 [&>*]:row-start-1">
        <Transition name="soft">
          <SkeletonGrid v-if="loading && !day" key="skeleton" :count="expectedMedia" />
          <MediaGrid
            v-else-if="media.length"
            key="grid"
            :items="media"
            cascade
            show-time
            :editable="auth.isEditor"
            :highlighted-id="highlightedId"
            :highlighted-ids="highlightedIds"
            :emphasis="noteEmphasis"
            @open="onGridOpen"
            @edit="editing = $event"
            @context="contextTarget = $event"
          />
          <EmptyState v-else key="empty" :message="t('day.noMedia')" />
        </Transition>
      </section>

      <!-- Two folds, one inside the other: the day arriving, and the reader
           asking for the map. They never play together - the outer has no
           `appear`, so a cached day draws its map with no animation. -->
      <Transition name="reveal">
        <div v-if="locatedMedia.length" class="reveal">
          <section class="mb-12">
            <div class="mb-3 flex items-center justify-between gap-4">
              <!-- Heading becomes a show/hide button when the map is hidden by default. -->
              <button
                v-if="mapHiddenByDefault"
                type="button"
                class="text-sm font-semibold text-ink-soft transition hover:text-ink"
                @click="mapShown = !mapShown"
              >
                {{ mapShown ? t('day.hideMap') : t('day.showMap') }}
              </button>
              <h2 v-else class="text-sm font-semibold text-ink-soft">{{ t('day.onMap') }}</h2>

              <!-- Preference toggle, always available while the day has locations. -->
              <label class="flex cursor-pointer items-center gap-2 text-xs text-ink-faint">
                {{ t('day.mapDefaultHidden') }}
                <input
                  type="checkbox"
                  class="peer sr-only"
                  :checked="mapHiddenByDefault"
                  @change="toggleMapDefault"
                />
                <span
                  class="relative h-4 w-7 rounded-full bg-edge transition peer-checked:bg-accent peer-checked:[&>span]:translate-x-3"
                  aria-hidden="true"
                >
                  <span
                    class="absolute left-0.5 top-0.5 h-3 w-3 rounded-full bg-paper-raised transition"
                  />
                </span>
              </label>
            </div>

            <Transition name="reveal">
              <div v-if="mapShown" class="reveal">
                <!-- `data-no-swipe`: panning the map must not page to another day. -->
                <TripMap
                  data-no-swipe
                  :media="locatedMedia"
                  :route="dayRoute"
                  :date="date"
                  height="360px"
                />
              </div>
            </Transition>
          </section>
        </div>
      </Transition>

      <section class="mb-8">
        <h2 class="mb-6 text-center text-sm font-semibold text-ink-soft">
          {{ t('calendar.title') }}
        </h2>
        <!-- Anchored on the current day, so it sits in the middle month.
             `data-no-swipe`: the ribbon scrolls sideways under the same finger. -->
        <TripCalendar
          data-no-swipe
          :days="days.list"
          :anchor="date"
          :selected="date"
          @select="openDay"
        />
      </section>
    </template>

    <!--
      The way back, standing in the page rather than only in the full-screen
      viewer: a translucent button that scrolls to the line a reference was
      followed from. Gone the moment that line is read again.
      See docs/features/rich-text-and-links.md.
    -->
    <Transition name="soft">
      <button
        v-if="hasTextAnchor"
        type="button"
        class="fixed bottom-4 right-4 z-20 flex h-11 w-11 items-center justify-center rounded-full bg-ink/50 text-paper shadow-lg backdrop-blur transition hover:bg-ink/85"
        :title="t('richText.returnToText')"
        :aria-label="t('richText.returnToText')"
        @click="returnToTextAnchor"
      >
        <svg
          class="h-5 w-5"
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          aria-hidden="true"
        >
          <path
            d="M10 16.5V5m0 0-4.5 4.5M10 5l4.5 4.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </button>
    </Transition>

    <MediaContextMenu :target="contextTarget" @close="contextTarget = null" />
    <MediaLightbox
      v-model:index="lightboxIndex"
      :items="media"
      :can-return-to-text="hasTextAnchor"
      @return="returnToTextAnchor"
    />
    <MediaEditDialog
      :open="Boolean(editing)"
      :media="editing"
      :date="date"
      deletable
      @close="editing = null"
      @saved="onMediaSaved"
      @delete="removeMedia"
    />
  </div>
</template>
