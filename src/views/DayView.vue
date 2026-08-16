<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import MediaGrid from '@/components/media/MediaGrid.vue'
import MediaLightbox from '@/components/media/MediaLightbox.vue'
import MediaContextMenu from '@/components/media/MediaContextMenu.vue'
import TripCalendar from '@/components/calendar/TripCalendar.vue'
import TripMap from '@/components/map/TripMap.vue'
import ShareButton from '@/components/common/ShareButton.vue'
import SkeletonGrid from '@/components/common/SkeletonGrid.vue'
import ErrorState from '@/components/common/ErrorState.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import MediaEditDialog from '@/components/editor/MediaEditDialog.vue'
import DayEditForm from '@/components/editor/DayEditForm.vue'
import { useDaysStore } from '@/stores/days'
import { useAuthStore } from '@/stores/auth'
import { useUiStore } from '@/stores/ui'
import { useEditorStore } from '@/stores/editor'
import { formatLongDate, formatWeekday } from '@/services/dates'
import { isFallbackLanguage } from '@/services/translations'
import { useHorizontalSwipe } from '@/composables/useHorizontalSwipe'
import { useMediaLink } from '@/composables/useMediaLink'
import { scrollToMedia } from '@/services/scrollToMedia'
import { hasOverlay } from '@/services/overlayStack'

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
const media = computed(() => day.value?.media ?? [])
const locatedMedia = computed(() =>
  media.value.filter(
    (item) => Number.isFinite(item?.latitude) && Number.isFinite(item?.longitude),
  ),
)
/**
 * How many files this day holds, known from the day list before the day itself
 * has been fetched — which is what lets the placeholder be the right size. Null
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
  },
)

// A locale switch clears the cache; refetch the day the visitor is looking at.
watch(() => ui.locale, () => load(true))

function openDay(date) {
  router.push({ name: 'day', params: { date } })
}

/*
  A link pointing at one file of this day.

  Reading it and writing it are two halves of the same contract. Reading happens
  as soon as the day's files are known: the file is either here — outlined, and
  opened if the link asked for that — or it is not, and the parameters are
  dropped rather than left in the address bar promising something the page cannot
  show.

  Read every time the file being pointed at changes, not once per day. The day's
  own map links back into the day it is already on, which changes nothing but the
  parameter — and a reading that had already happened left that link outlining
  nothing and scrolling nowhere.

  Writing happens whenever the viewer opens or pages, so the address bar always
  names the picture on screen and the share button copies a link to it. Closing
  takes both away again, along with the outline: the reader is done with that
  picture, and the page they are left on is the plain one.
*/
// Any overlay, not just this page's viewer: one opened from an edit dialog
// still covers the outline, and a press over it is not the reader dismissing it.
const mediaLink = useMediaLink({ suspended: () => hasOverlay() })
const highlightedId = computed(() => mediaLink.link.value.id)

/** The file already answered for, so the same one is not answered for twice. */
let answered

watch(
  [media, () => mediaLink.link.value],
  ([list, link]) => {
    if (!list.length || answered === link.id) return
    answered = link.id
    if (link.id == null) return

    const index = list.findIndex((item) => item.id === link.id)
    if (index < 0) {
      // Not this day's file: a stale link, or one shared from somewhere else.
      // Only once the day has settled, though — a reload leaves the previous
      // day's files standing until the new ones arrive, and a link answered
      // against those would be thrown away for the wrong reason.
      if (!loading.value) mediaLink.clear()
      else answered = undefined
      return
    }

    if (link.open) lightboxIndex.value = index
    else scrollToMedia(link.id)
  },
  { immediate: true },
)

watch(lightboxIndex, (index) => {
  const opened = index == null ? null : media.value[index]
  if (opened) mediaLink.write(opened.id, true)
  else mediaLink.clear()
})

/**
 * Left/right arrows step to the previous/next day. Ignored while typing, while
 * editing the note, and while anything is open over the page.
 *
 * "Anything", not "this page's viewer": a viewer can be opened from inside the
 * note editor's strip or from the "similar" panel of an edit dialog, and those
 * are other instances entirely — the page had no idea they existed and went on
 * turning days under them. The overlay stack is what every overlay announces
 * itself to, so it is the one thing that knows.
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

/**
 * Touch equivalent of the arrow keys. Suspended while the lightbox is open — it
 * runs its own swipe over the file list — and while files are being selected,
 * where the same sideways stroke extends the selection and must not also throw
 * the reader onto another day. Never fires inside the calendar or the map, both
 * of which pan horizontally themselves.
 */
const swipe = useHorizontalSwipe({
  isEnabled: () => !hasOverlay() && !editor.selectionMode,
  onLeft: () => neighbours.value.next && openDay(neighbours.value.next),
  onRight: () => neighbours.value.prev && openDay(neighbours.value.prev),
})

/**
 * The dialog writes the saved model straight onto the file it was editing, and
 * that file is the one in the grid — so the tile, its tags and its marks are
 * already right by the time this runs. Only a save that answered with nothing to
 * write leaves the page having to ask the server what it just sent.
 */
function onMediaSaved({ applied } = {}) {
  editing.value = null
  if (!applied) load(true)
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
        <RouterLink
          v-if="neighbours.prev"
          :to="{ name: 'day', params: { date: neighbours.prev } }"
          class="btn-ghost !px-3"
          :aria-label="t('day.prev')"
        >
          ←
        </RouterLink>
        <RouterLink
          v-if="neighbours.next"
          :to="{ name: 'day', params: { date: neighbours.next } }"
          class="btn-ghost !px-3"
          :aria-label="t('day.next')"
        >
          →
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
            <p
              v-else-if="day?.note"
              class="whitespace-pre-wrap text-sm leading-relaxed text-ink-soft"
            >
              {{ day.note }}
            </p>
            <p v-else class="text-sm text-ink-faint">{{ t('day.noNote') }}</p>
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
            :editable="auth.isEditor"
            :highlighted-id="highlightedId"
            @open="lightboxIndex = media.indexOf($event)"
            @edit="editing = $event"
            @context="contextTarget = $event"
          />
          <EmptyState v-else key="empty" :message="t('day.noMedia')" />
        </Transition>
      </section>

      <!--
        Two folds, one inside the other. The outer one is the day itself
        arriving: until it has been fetched nobody knows whether it holds any
        located files, and a whole map section appearing under the grid the
        instant it does is the jolt this smooths over. The inner one is the
        reader asking for the map, or putting it away.

        They never play together. The outer has no `appear`, so a day already in
        the cache draws its map with no animation at all; a day that arrives
        later unfolds the section with the map already inside it.
      -->
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
                <TripMap data-no-swipe :media="locatedMedia" :date="date" height="360px" />
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

    <MediaContextMenu :target="contextTarget" @close="contextTarget = null" />
    <MediaLightbox v-model:index="lightboxIndex" :items="media" />
    <MediaEditDialog
      :open="Boolean(editing)"
      :media="editing"
      :date="date"
      @close="editing = null"
      @saved="onMediaSaved"
    />
  </div>
</template>
