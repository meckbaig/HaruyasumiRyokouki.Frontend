<script setup>
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { useRouter, useRoute } from 'vue-router'
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
import { useMediaLink, MEDIA_PARAM, OPEN_PARAM } from '@/composables/useMediaLink'
import { useMediaRouteViewer } from '@/composables/useMediaRouteViewer'
import { scrollToMedia, scrollTargetFor } from '@/services/scrollToMedia'
import { tileFor } from '@/services/mediaTiles'
import { routeFromMedia } from '@/composables/useTripMedia'
import { hasCoordinates } from '@/services/mapLinks'
import { MAP_EXPAND, MAP_COLLAPSE, MAP_TALLER, MAP_SHORTER } from '@/services/mapIcons'
import { hasOverlay } from '@/services/overlayStack'
import { chromeInsets } from '@/services/pageChrome'
import { followBoxScroll } from '@/services/pageScroll'
import { useHiddenRecords } from '@/composables/useHiddenRecords'
import { useGridReadonly } from '@/composables/useGridReadonly'
import { readNoteAnchor, anchorSelector, scrollToTextAnchor } from '@/services/textAnchor'
import { resolvePick } from '@/services/mediaPick'

const props = defineProps({
  date: { type: String, required: true },
})

const { t } = useI18n()
const router = useRouter()
const route = useRoute()
const days = useDaysStore()
const auth = useAuthStore()
const ui = useUiStore()
const editor = useEditorStore()

const MAP_HIDDEN_KEY = 'haruyasumi.dayMapHidden'

const loading = ref(false)
const error = ref(null)
/** True while the viewer in front was opened from the map's own album. */
const viewerFromMap = ref(false)
const editing = ref(null)
const editingNote = ref(false)
/** `{ media, x, y }` of the file right-clicked in the grid. */
const contextTarget = ref(null)

/*
  The note's own references. A click brings the file's tile into view and singles
  it out; the card's thumbnail opens it full screen. Following one leaves the
  line in the address as `#note=id:index`, so Back walks up to it and the round
  button restores it. See docs/features/rich-text-and-links.md.
*/
const noteAnchor = computed(() => readNoteAnchor(route.hash))
const hasTextAnchor = computed(() => noteAnchor.value != null)
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
 * Writes the line a reference was followed from into the address and pushes a
 * step of its own, so the browser's Back walks up to it. Written by **any**
 * follow that scrolled the page; the memory is spent the moment the line is
 * readable again. See docs/features/rich-text-and-links.md.
 */
function departFromText(reference) {
  mediaLink.followNote(reference.ids ?? [reference.mediaId], {
    mediaId: reference.mediaId,
    index: reference.index,
  })
}

/* A settled scroll decides whether the line is back in the band; during a smooth
   scroll the events keep postponing the check. */
let scrollSettleTimer = null

function onScrollCheck() {
  if (!noteAnchor.value) return
  clearTimeout(scrollSettleTimer)
  scrollSettleTimer = setTimeout(settleAnchor, 160)
}

function settleAnchor() {
  if (!noteAnchor.value) return
  if (referenceReadable(noteAnchor.value)) mediaLink.clearNote()
}

/** The way back: scrolls to the line the address remembers. The settle spends it. */
function returnToText() {
  const anchor = noteAnchor.value
  if (!anchor) return
  scrollToTextAnchor(anchor)
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
  // Always scrolls: a second press on the same reference must move again, which
  // the address alone cannot signal when it does not change.
  scrollToMedia(reference.ids?.length ? reference.ids : reference.mediaId)
}

/**
 * Opening the card's picture full screen. The card sits beside the line and
 * nothing scrolls, so this is no departure: the line is where the reader left
 * it, and a way back only stands if a follow put one there.
 */
function openNoteMedia(reference) {
  viewer.openAt(reference.mediaId)
}

/**
 * Following a reference onto the day's map: the line is remembered and the step
 * gets a history entry, so the browser's Back returns to the note. The files are
 * **not** singled out, the reader going to the map, and the anchor names the
 * reference's own id - a multi-file reference must still be found again.
 * See docs/features/rich-text-and-links.md.
 */
function followNoteMap(reference) {
  mediaLink.departNote({ mediaId: reference.ids?.[0] ?? reference.mediaId, index: reference.index })
  onScrollCheck()
  showMediaOnMap(reference.mediaId)
}

/** A tile press. While a reference is being picked the id goes to the field. */
function onGridOpen(item) {
  if (resolvePick(item?.id)) return
  viewer.openAt(item?.id)
}

/** A pin's album opening full screen. Its card says there is no tile to fly from. */
function openMapMedia(id) {
  // Opened from the album: its own picture is the mark a flight leaves towards.
  viewerFromMap.value = true
  viewer.openAt(id)
}

/**
 * A pin's "go to media": the same follow a note reference makes. A full-screen map
 * covers the grid the reader is heading to, so it folds first and the follow waits
 * for it to leave; the album is not handed back, the reader leaving the map.
 * See docs/features/maps.md.
 */
function activateMapMedia(id) {
  if (!mapFullscreen.value) {
    mediaLink.write(id, false)
    scrollToMedia([id])
    return
  }
  mapFullscreen.value = false
  // The map's own step is left standing for the follow's own write to replace.
  mapStepPushed = false
  window.setTimeout(() => {
    mediaLink.write(id, false)
    scrollToMedia([id])
  }, MAP_REVEAL_MS)
}

/** True while a popstate is returning to the note, so the link does not scroll. */
let returningToText = false
/** True while a full-screen map's own step stands in history. */
let mapStepPushed = false
/** True while this page is taking back a step it pushed for the map it closed. */
let consumingStep = false

/**
 * The browser's own Back and Forward for the page's **own** overlays: the
 * full-screen map, and the return to the note. The viewer is address-driven, so a
 * step closes it through the route; its own hand-close marks that step and is
 * skipped here. See docs/features/media-viewer.md and docs/features/maps.md.
 */
function onPopState() {
  // A step this page took itself, closing the map by hand: nothing to answer.
  const tookBack = consumingStep
  consumingStep = false
  if (tookBack) return
  // The viewer's own hand-close is a step it takes back itself; only the reader's
  // Back and the two UI buttons return to the note.
  if (viewer.consumeHandClose()) return
  /*
    The viewer and the full-screen map are separate overlays, so one Back closes
    one of them. This runs after the router settled, so the viewer's own `held`
    flag - not the route - says whether the step is the viewer's.
  */
  const params = new URLSearchParams(window.location.search)
  if (params.get(OPEN_PARAM) === '1') {
    viewer.held.value = true
    return
  }
  if (viewer.held.value) {
    // This Back closed the viewer and stops there; the map behind it, and the
    // note a reference was followed from, both wait for the next Back.
    viewer.held.value = false
    return
  }
  if (mapFullscreen.value) {
    closeMapFullscreen({ fromStep: true })
    return
  }
  // A step that still names a file is the viewer's own, or a look at one: Back
  // closes the picture and stops there. Only a step that leaves the accent is
  // the return to the note, which the hash names.
  if (params.get(MEDIA_PARAM) != null) return
  if (!noteAnchor.value) return
  returningToText = true
  scrollToTextAnchor(noteAnchor.value)
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

/** The day's wall, so a jump past it can settle it first. See showMediaOnMap. */
const grid = ref(null)

/* The narrow map's own two ways out of its box: taller, or filling the window. */
const mapExpanded = ref(false)
const mapFullscreen = ref(false)
const tripMap = ref(null)
const fullScreenMap = ref(null)
/** The whole map block, heading and buttons included - what the page follows. */
const mapSection = ref(null)
/** The inline map's view and album, handed to the full-screen one. */
const fullMapView = ref(null)
const fullMapSelection = ref(null)

function openMapFullscreen() {
  // The view and the album are **moved**, not copied: a second card left standing
  // on the map behind answers the keyboard and the card's own gestures first.
  fullMapView.value = tripMap.value?.getView() ?? null
  fullMapSelection.value = tripMap.value?.getSelection() ?? null
  mapFullscreen.value = true
  // A step of its own, so Back collapses the map; the close takes it back.
  mapStepPushed = true
  mediaLink.depart()
  nextTick(() => tripMap.value?.showMedia(null))
}

/** The map the reader is looking at: the expanded one stands over the inline. */
function activeMap() {
  return mapFullscreen.value ? fullScreenMap.value : tripMap.value
}

/**
 * Collapsing hands both back to the inline map - the album the reader had open,
 * and the ground they left - once the overlay has let go, so the two never hold
 * the same card at once. By hand it also takes the map's own history step back,
 * so Back leaves the page rather than standing on it. See docs/features/maps.md.
 */
function closeMapFullscreen({ fromStep = false } = {}) {
  const view = fullScreenMap.value?.getView() ?? null
  const selection = fullScreenMap.value?.getSelection() ?? null
  mapFullscreen.value = false
  if (mapStepPushed) {
    mapStepPushed = false
    // A step the browser already popped is not taken back twice.
    if (!fromStep) {
      consumingStep = true
      history.back()
    }
  }
  nextTick(() => {
    tripMap.value?.applyView(view)
    tripMap.value?.showMedia(selection?.id ?? null)
  })
}

/**
 * Whether the file on show can be placed: the reader is looking at one, and it
 * carries coordinates. The viewer offers "show on the map" on that alone.
 * See docs/features/maps.md.
 */
const openMedia = computed(() =>
  viewer.index.value == null ? null : (media.value[viewer.index.value] ?? null),
)
const openOnMap = computed(() => hasCoordinates(openMedia.value))

/**
 * A close hands the file that was on show to the map in front, which puts the
 * album on it or closes the album when that file is not on the map. **Only a
 * viewer opened from a card may move it**, and the map itself remembers that -
 * a flag here goes stale as soon as the address carries the `?i=` pair.
 */
function onViewerClose(id) {
  activeMap()?.syncViewerClose(id ?? null)
}

/**
 * Following the viewer onto the map: the viewer has already closed and synced
 * the album, so only the map's own two extras are left - make sure the inline
 * map is on screen, scroll to it, and frame the pin once the unfold has settled.
 * A full-screen map is already in front of the reader and needs neither.
 */
async function showMediaOnMap(id) {
  // Drop the pair in place, not with a step back: a back would restore the
  // previous entry's scroll position over the scroll to the map.
  viewer.dismiss()
  if (!mapFullscreen.value) {
    // A wall that keeps revealing chunks would push the map down as the glide
    // passes it, so it is settled before the scroll is aimed.
    // See docs/features/maps.md.
    grid.value?.finishRevealing()
    mapShown.value = true
    await nextTick()
    document
      .querySelector('[data-day-map]')
      ?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }
  window.setTimeout(() => activeMap()?.showMedia(id, { zoom: true }), MAP_REVEAL_MS)
}

/** Longer than the fold's own 260ms, so the map is laid out before it is framed. */
const MAP_REVEAL_MS = 320

/**
 * Taller than the default, but never taller than the window. Both ends are
 * `min()` expressions of the same shape, which is what lets the height
 * interpolate instead of jumping.
 */
const mapHeight = computed(() =>
  mapExpanded.value ? 'min(900px, calc(100vh - 12rem))' : 'min(360px, 100vh)',
)

/** The height-follow loop, so a second press does not fight the first. */
let heightFrame = 0

/** Stops the follow and hands the page's own scroll behaviour back. */
function stopHeightFollow() {
  if (heightFrame) cancelAnimationFrame(heightFrame)
  heightFrame = 0
  document.documentElement.style.scrollBehavior = ''
}

/**
 * Keeps the page on the map while the height moves: the scroll is written from
 * the height the transition is **actually** at, frame by frame, so the two cannot
 * run at different speeds - a native smooth scroll has its own curve and start.
 * `followBoxScroll` splits the growth by the box's place on screen.
 */
function followMapHeight(box, from) {
  stopHeightFollow()
  const scrollFrom = window.scrollY
  // The box's own top does not move; only its height does, so it is read once.
  const boxTop = box.getBoundingClientRect().top + scrollFrom
  const insets = chromeInsets()
  // The page scrolls smoothly by default; each step here is its own instant
  // move, so that inheritance is stood down for the length of the follow.
  document.documentElement.style.scrollBehavior = 'auto'
  let last = from
  let still = 0
  const step = () => {
    const height = box.offsetHeight
    window.scrollTo(
      0,
      followBoxScroll({
        scroll: scrollFrom,
        top: boxTop,
        height: from,
        nextHeight: height,
        viewport: window.innerHeight,
        topInset: insets.top,
        bottomInset: insets.bottom,
      })
    )
    still = height === last ? still + 1 : 0
    last = height
    if (still < 2) heightFrame = requestAnimationFrame(step)
    else stopHeightFollow()
  }
  heightFrame = requestAnimationFrame(step)
}

/**
 * Taller or shorter, with the page following the box: the map keeps its own
 * centre, and the page is moved with it so the reader does not have to scroll.
 */
function toggleMapHeight() {
  // The whole block moves: the heading and the buttons are part of what the
  // reader is looking at, not the map box alone. See docs/features/maps.md.
  const box = mapSection.value
  const before = box?.offsetHeight ?? 0
  mapExpanded.value = !mapExpanded.value
  if (box) followMapHeight(box, before)
}

// The page behind an overlay must not scroll under it.
watch(mapFullscreen, (open) => {
  document.body.style.overflow = open ? 'hidden' : ''
})

const day = computed(() => days.getDay(props.date))
/* The editor's hide toggle removes private files here, on the fly; the cached
   day is left untouched, so showing them again is instant. */
const { withoutHidden } = useHiddenRecords()
/* The footer's read-only wall, so a browsing editor cannot edit by accident. */
const { readonly: gridReadonly } = useGridReadonly()
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
    mapExpanded.value = false
    mapFullscreen.value = false
    fullMapSelection.value = null
    // The overlay is gone with the day; its step is not ours to take back.
    mapStepPushed = false
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
/* A link that also opens the viewer leaves the wall paged: nothing scrolls to
   it behind the full screen. See docs/features/media-grid-and-selection.md. */
const linkOpen = computed(() => mediaLink.link.value.open)

/*
  The viewer, driven by the pair in the address. The route is the only writer of
  history: opening pushes, a turn replaces, closing drops the pair. Back and
  Forward are ordinary route changes, so a step closes the viewer exactly as a
  press opens it. See docs/features/media-viewer.md.
*/
const viewer = useMediaRouteViewer({
  items: media,
  // A return to the note owns the page's scroll; the selection must not pull.
  suppressScroll: () => returningToText,
})
/** The viewer's index, at the top level so `v-model` can write it back. */
const lightboxIndex = viewer.index

/*
  A viewer can also leave with no `close` event - the address answers for it - so
  the map's record of it is dropped whenever the lightbox is gone. A close has
  already spent it. See docs/features/maps.md.
*/
watch(
  () => viewer.index.value,
  (index) => {
    if (index == null) {
      activeMap()?.forgetViewerClose()
      viewerFromMap.value = false
    }
  },
)

/*
  A pair naming a file this day does not hold is dropped, once the day has
  settled - a reload leaves the previous day's files standing until the new ones
  arrive. See docs/features/sharing-and-links.md.
*/
watch([() => mediaLink.link.value.id, media], ([id, list]) => {
  if (returningToText || id == null || loading.value || !list.length) return
  if (!list.some((item) => item.id === id)) mediaLink.clear()
})

// Files deleted through the app-level toolbar; the page cannot hear its events.
watch(() => editor.lastDelete, () => load(true))

/**
 * Left/right arrows step between days. Ignored while typing and while **anything**
 * is open over the page - `hasOverlay()`, not this page's own viewer, which is
 * not the only one that can be up. See docs/features/ui-shell.md.
 */
function onKeydown(event) {
  // A pin's own album owns Escape first; `hasOverlay()` says one is up.
  if (event.key === 'Escape' && mapFullscreen.value && !hasOverlay()) {
    closeMapFullscreen()
    return
  }
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
  // A full-screen map owns the arrows: they step its album, and a press after
  // the last picture must not page the day on underneath. See docs/features/maps.md.
  if (hasOverlay() || editingNote.value || mapFullscreen.value) return

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
onBeforeUnmount(() => (document.body.style.overflow = ''))
// Seeing the reference again is the one thing that spends the way back. A
// settled scroll answers it, and `scrollend` answers at once where it exists.
onMounted(() => window.addEventListener('scroll', onScrollCheck, { passive: true }))
onBeforeUnmount(() => window.removeEventListener('scroll', onScrollCheck))
onMounted(() => window.addEventListener('scroll', onEmphasisScroll, { passive: true }))
onBeforeUnmount(() => window.removeEventListener('scroll', onEmphasisScroll))
onMounted(() => document.addEventListener('scrollend', settleAnchor))
onBeforeUnmount(() => document.removeEventListener('scrollend', settleAnchor))
onBeforeUnmount(() => clearTimeout(emphasisTimer))
onBeforeUnmount(() => clearTimeout(scrollSettleTimer))
onBeforeUnmount(() => stopHeightFollow())

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
                can-show-on-map
                half-blank-lines
                keep-card-on-open
                :viewer-open="lightboxIndex != null"
                @media-activate="activateNoteMedia"
                @media-open="openNoteMedia"
                @media-map="followNoteMap"
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
            ref="grid"
            :items="media"
            cascade
            show-time
            :preview-rows="mapHiddenByDefault ? null : 4"
            :editable="auth.isEditor"
            :readonly="gridReadonly"
            :highlighted-id="highlightedId"
            :highlighted-ids="highlightedIds"
            :link-open="linkOpen"
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
          <!--
            A grid, not a row: on a phone the map's buttons drop to the third
            row, under the map, while the heading and the hide-map toggle keep
            the first; on a wider screen everything is back on the first line.
          -->
          <section
            ref="mapSection"
            class="mb-12 grid grid-cols-[1fr_auto] gap-y-3 sm:grid-cols-[1fr_auto_auto] sm:gap-x-4 sm:gap-y-2"
          >
            <!-- Heading becomes a show/hide button when the map is hidden by default. -->
            <button
              v-if="mapHiddenByDefault"
              type="button"
              class="col-start-1 row-start-1 self-center text-left text-sm font-semibold text-ink-soft transition hover:text-ink"
              @click="mapShown = !mapShown"
            >
              {{ mapShown ? t('day.hideMap') : t('day.showMap') }}
            </button>
            <h2
              v-else
              class="col-start-1 row-start-1 self-center text-sm font-semibold text-ink-soft"
            >
              {{ t('day.onMap') }}
            </h2>

            <!--
              Under the map on a phone, on the heading's line on a wider screen:
              a thumb reaching for these above a tall map crosses the whole map.
              They fade away with the map, having nothing to act on without it.
            -->
            <Transition name="soft">
              <div
                v-if="mapShown"
                class="col-span-2 row-start-3 flex flex-wrap items-center justify-end gap-2 sm:col-span-1 sm:col-start-2 sm:row-start-1 sm:justify-self-end"
              >
                <!-- The day as a range on the trip page, where the map is the page. -->
                <RouterLink
                  :to="{ name: 'map', query: { from: date, to: date } }"
                  class="btn-ghost !px-2 !py-1 max-sm:min-h-11 max-sm:min-w-11"
                  :title="t('day.openInMaps')"
                  :aria-label="t('day.openInMaps')"
                >
                  <svg
                    class="h-5 w-5"
                    viewBox="0 0 20 20"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.6"
                    aria-hidden="true"
                  >
                    <path d="M10 18s6-5.1 6-9.5A6 6 0 0 0 4 8.5C4 12.9 10 18 10 18Z" />
                    <circle cx="10" cy="8.5" r="2.2" />
                  </svg>
                </RouterLink>

                <!-- Taller, then back. The icon says which way the next press goes. -->
                <button
                  type="button"
                  class="btn-ghost !px-2 !py-1 max-sm:min-h-11 max-sm:min-w-11"
                  :title="mapExpanded ? t('day.collapseMapHeight') : t('day.expandMapHeight')"
                  :aria-label="mapExpanded ? t('day.collapseMapHeight') : t('day.expandMapHeight')"
                  @click="toggleMapHeight"
                >
                  <svg
                    class="h-5 w-5"
                    viewBox="0 0 20 20"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.6"
                    aria-hidden="true"
                  >
                    <path
                      :d="mapExpanded ? MAP_SHORTER : MAP_TALLER"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    />
                  </svg>
                </button>

                <!-- Fills the window without leaving the day. -->
                <button
                  type="button"
                  class="btn-ghost !px-2 !py-1 max-sm:min-h-11 max-sm:min-w-11"
                  :title="t('day.fullscreenMap')"
                  :aria-label="t('day.fullscreenMap')"
                  @click="openMapFullscreen"
                >
                  <svg
                    class="h-5 w-5"
                    viewBox="0 0 20 20"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.6"
                    aria-hidden="true"
                  >
                    <path
                      :d="MAP_EXPAND"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    />
                  </svg>
                </button>

              </div>
            </Transition>

            <!-- Preference toggle, always available while the day has locations.
                 It keeps the place it always had: on the heading's own line. -->
            <label
              class="col-start-2 row-start-1 flex cursor-pointer items-center gap-2 self-center justify-self-end text-xs text-ink-faint sm:col-start-3 sm:row-start-1"
            >
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

            <Transition name="reveal">
              <div
                v-if="mapShown"
                class="reveal col-span-2 row-start-2 sm:col-span-3 sm:row-start-2"
              >
                <!-- `data-no-swipe`: panning the map must not page to another day. -->
                <TripMap
                  ref="tripMap"
                  data-no-swipe
                  data-day-map
                  mode="day"
                  :media="locatedMedia"
                  :route="dayRoute"
                  :date="date"
                  :height="mapHeight"
                  :wheel-zoom="mapExpanded"
                  animated-height
                  @open="openMapMedia"
                  @activate="activateMapMedia"
                >
                  <!--
                    Invisible grip strips beside the windowed phone map: the map
                    canvas takes `touch-action` for panning, so a thumb on it
                    cannot scroll the page. These see-through boxes give that
                    finger the page back. See docs/features/maps.md.
                  -->
                  <template #controls>
                    <div
                      class="pointer-events-auto absolute inset-y-0 -left-4 z-[500] hidden w-8 max-sm:block"
                      aria-hidden="true"
                    />
                    <div
                      class="pointer-events-auto absolute inset-y-0 -right-4 z-[500] hidden w-8 max-sm:block"
                      aria-hidden="true"
                    />
                  </template>
                </TripMap>
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
        @click="returnToText"
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

    <!--
      The map filling the window without leaving the day: a **second** map, as on
      the trip page - a live map carried through a Teleport comes out broken.
      See docs/features/maps.md.
    -->
    <Teleport to="body">
      <Transition name="map-full">
        <div v-if="mapFullscreen" class="fixed inset-0 z-[2100] flex flex-col bg-paper">
          <TripMap
            ref="fullScreenMap"
            mode="day"
            :media="locatedMedia"
            :route="dayRoute"
            :date="date"
            :initial-view="fullMapView"
            :initial-selection="fullMapSelection"
            height="100%"
            :framed="false"
            wheel-zoom
            class="min-h-0 flex-1"
            @open="openMapMedia"
            @activate="activateMapMedia"
          />

          <!-- The same corners-in mark the button that opened it wears. -->
          <button
            type="button"
            class="btn-ghost map-float-control absolute right-4 top-4 z-[1000] !px-3 !py-2"
            :title="t('day.exitFullscreen')"
            :aria-label="t('day.exitFullscreen')"
            @click="closeMapFullscreen()"
          >
            <svg
              class="h-5 w-5"
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              stroke-width="1.6"
              aria-hidden="true"
            >
              <path
                :d="MAP_COLLAPSE"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </button>
        </div>
      </Transition>
    </Teleport>

    <MediaContextMenu :target="contextTarget" @close="contextTarget = null" />
    <MediaLightbox
      v-model:index="lightboxIndex"
      :items="media"
      :can-return-to-text="hasTextAnchor"
      :can-show-on-map="openOnMap"
      :page-covered="mapFullscreen || viewerFromMap"
      @return="returnToText"
      @close="onViewerClose"
      @show-on-map="showMediaOnMap"
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
