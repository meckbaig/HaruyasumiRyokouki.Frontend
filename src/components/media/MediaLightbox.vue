<script setup>
import { computed, ref, watch, nextTick, onBeforeUnmount } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import {
  downloadSrc,
  fullScreenSrc,
  mediaAspect,
  mediaDate,
  miniatureSrc,
  previewSrc,
  streamSrc,
} from '@/services/mediaAssets'
import { isVideo } from '@/services/mediaType'
import { isPrivate } from '@/services/privacy'
import { pickTranslation } from '@/services/translations'
import { useUiStore } from '@/stores/ui'
import { isMobileLayout } from '@/services/display'
import { withMediaLink, pageIdentity } from '@/composables/useMediaLink'
import { copyMediaUrl } from '@/services/share'
import { useCopyFeedback } from '@/composables/useCopyFeedback'
import { pushOverlay, popOverlay, isTopmost, hasOverlay } from '@/services/overlayStack'
import { takeOpenedFrom, NO_SOURCE } from '@/services/openedFrom'
import { motionReduced, SLIDE_MS } from '@/services/motion'
import { GHOST_CLICK_MS } from '@/services/ghostClick'
import { chromeInsets } from '@/services/pageChrome'
import HeroFlight from './HeroFlight.vue'
import { boxOf, isOnScreen, tilesFor, tileFor } from '@/services/mediaTiles'
import TagChip from './TagChip.vue'
import RichText from '@/components/common/RichText.vue'

const props = defineProps({
  items: { type: Array, default: () => [] },
  /** Index of the open file, or null when the lightbox is closed. */
  index: { type: Number, default: null },
  /**
   * Whether a media reference in the text recorded a place to go back to. On
   * for a day note, off everywhere else. See docs/features/rich-text-and-links.md.
   */
  canReturnToText: { type: Boolean, default: false },
})

const emit = defineEmits(['update:index', 'close', 'return'])

const { t } = useI18n()
const route = useRoute()
const ui = useUiStore()

const dialog = ref(null)
let lastFocused = null

const open = computed(() => props.index !== null && props.index >= 0)
const current = computed(() => (open.value ? (props.items[props.index] ?? null) : null))
const video = computed(() => isVideo(current.value))
/* Text from whichever shape the list holds - the pending queue passes edit
   models, whose flat fields do not exist. */
const text = computed(() => pickTranslation(current.value, ui.locale))
const label = computed(() => text.value.title || current.value?.fileName || t('media.untitled'))
const caption = computed(() => text.value.description)

const hasPrev = computed(() => open.value && props.index > 0)
const hasNext = computed(() => open.value && props.index < props.items.length - 1)

/** Neighbours ride along in the filmstrip, shown as the previews the grid cached. */
const prevItem = computed(() => (hasPrev.value ? props.items[props.index - 1] : null))
const nextItem = computed(() => (hasNext.value ? props.items[props.index + 1] : null))

/* Full-size images this session has held, so a file already seen slides past
   sharp. A record, not a probe - probing an uncached URL issues a request.
   See docs/features/media-viewer.md. */
const inHand = new Set()

/*
  How far ahead to warm. The strip mounts only the two neighbours, and the page
  underneath loads its thumbnails lazily, so a file further down a long day has
  no preview cached. Fetch the next few now, not when the reader turns to one.
  See docs/features/media-viewer.md.
*/
const PREVIEW_WARM_AHEAD = 5

/** Preview URLs this session already asked to be fetched ahead of need. */
const warmedPreviews = new Set()

/**
 * Fetches the previews of the next few files into the browser cache, off-DOM,
 * so the file the reader is about to turn to settles in instead of loading
 * while the strip is sliding.
 */
function warmPreviews() {
  if (!open.value) return
  const last = Math.min(props.items.length, props.index + PREVIEW_WARM_AHEAD + 1)
  for (let i = props.index + 1; i < last; i += 1) {
    const item = props.items[i]
    if (!item) continue
    const url = previewSrc(item)
    if (!url || warmedPreviews.has(url)) continue
    warmedPreviews.add(url)
    // No paint and no layout: a detached Image only fills the cache, which is
    // what the layers and the strip read when the file arrives.
    const image = new Image()
    image.src = url
  }
}

/** Full-size URLs this session has already asked the browser to fetch ahead. */
const warmedFullSize = new Set()

/* Full-size URLs whose bytes have actually arrived, so a layer can be settled
   before its own <img> has ever been rendered. Reactive: the filmstrip's
   neighbours switch to the full image the moment it is ready.
   See docs/features/media-viewer.md. */
const fullCached = ref(new Set())

/** Which way the reader last paged, so the neighbour ahead of them is warmed. */
let pageDirection = 1

/**
 * Fetches a neighbour's full-size image, off-DOM, so a page turn shows it sharp
 * from the first frame instead of loading. Opening warms both sides; a turn warms
 * only the way the reader is heading. **Skipped in the mobile layout**, where the
 * swap is invisible and the file is a heavy download.
 */
function warmFullSize(delta) {
  if (!open.value) return
  // Not on a phone: the swap is invisible there and the file is a heavy download.
  if (isMobileLayout()) return
  const item = props.items[props.index + delta]
  if (!item) return
  const url = fullScreenSrc(item)
  if (!url || inHand.has(url) || warmedFullSize.has(url)) return
  warmedFullSize.add(url)
  const image = new Image()
  // The completed fetch is what lets the layer settle the moment it is reached.
  image.onload = () => {
    const next = new Set(fullCached.value)
    next.add(url)
    fullCached.value = next
  }
  image.src = url
}

/** Whether this file's full-size image can be drawn with no request at all. */
function haveFullSize(item) {
  const full = fullScreenSrc(item)
  return Boolean(full) && (inHand.has(full) || fullCached.value.has(full))
}

function stripSrc(item) {
  if (haveFullSize(item)) return fullScreenSrc(item)
  return previewSrc(item) || miniatureSrc(item)
}

/**
 * The preview is the very image the grid tile already downloaded - the API
 * returns one preview URL per file - so it is served from cache and fills the
 * frame at once while the full-screen version arrives over it. Both share the
 * file's aspect ratio, so nothing shifts on the swap.
 */
const preview = computed(() => previewSrc(current.value))
const miniature = computed(() => miniatureSrc(current.value))
const fullScreen = computed(() => fullScreenSrc(current.value))
const stream = computed(() => streamSrc(current.value))
const download = computed(() => downloadSrc(current.value))
const dayDate = computed(() => mediaDate(current.value))
const dayQuery = computed(() =>
  current.value?.id == null ? {} : withMediaLink({}, current.value.id),
)

/** The day button is an offer to go somewhere; on that day there is nowhere to go. */
const onOwnDay = computed(() => route.name === 'day' && String(route.params.date) === dayDate.value)

/* A day and a search resolve `?i=`; the front page cannot - its wall is
   reshuffled every visit. See docs/features/sharing-and-links.md. */
const canResolveLink = computed(() => route.name === 'day' || route.name === 'search')

/** A private file has no link worth handing out, so the button is removed
 *  rather than disabled. See docs/features/media-viewer.md. */
const hidden = computed(() => isPrivate(current.value))
const shareable = computed(
  () =>
    current.value?.id != null &&
    !hidden.value &&
    (canResolveLink.value || Boolean(dayDate.value)),
)

const { feedback: shareFeedback, run: runShare } = useCopyFeedback()

function share() {
  return runShare(() =>
    copyMediaUrl(current.value.id, {
      open: true,
      path: canResolveLink.value ? null : `/day/${dayDate.value}`,
    }),
  )
}

const fullLoaded = ref(false)
const fullFailed = ref(false)
/** The preview has painted, so the miniature under it has done its job. */
const previewLoaded = ref(false)

const SPINNER_DELAY = 50

const showSpinner = ref(false)
let spinnerTimer = null

function stopSpinner() {
  clearTimeout(spinnerTimer)
  spinnerTimer = null
  showSpinner.value = false
}

function armSpinner() {
  stopSpinner()
  if (!fullScreen.value || fullLoaded.value) return

  /*
    Not on a phone. The wait there is longer - a mobile connection fetching a
    full-size picture - and the difference the picture gains over the preview
    already standing in for it is smaller on a small screen. A spinner would
    mostly be something to watch, so the swap is left to happen quietly.
  */
  if (isMobileLayout()) return

  spinnerTimer = setTimeout(() => {
    if (!fullLoaded.value && !fullFailed.value) showSpinner.value = true
  }, SPINNER_DELAY)
}

/**
 * The wheel is held back until the opening flight has landed: the flying picture
 * covers the middle of the window, so a wheel faded in under it is already
 * opaque when the strip arrives. See docs/features/media-viewer.md.
 */
const spinnerShown = computed(() => showSpinner.value && chromeReady.value && !flight.value?.active)

/**
 * Aspect ratio of the open file. The API states it, so the fit is known before a
 * byte arrives; a loaded preview only refines it.
 * See docs/features/media-viewer.md.
 */
const aspect = ref(null)
const aspectStyle = computed(() => (aspect.value ? { '--ar': aspect.value } : undefined))
/**
 * The same fit, for elements that have no proportions of their own to be sized
 * by: a video before its metadata lands, and a plain box holding a layer. Both
 * need the ratio written out, or `height: auto` has nothing to work from.
 */
const fitBoxStyle = computed(() =>
  aspect.value ? { '--ar': aspect.value, aspectRatio: String(aspect.value) } : undefined,
)
const fitClass = computed(() => (aspect.value ? 'fit-media' : 'h-full w-full'))

function rememberAspect(image) {
  if (image.naturalWidth && image.naturalHeight) {
    aspect.value = image.naturalWidth / image.naturalHeight
  }
}

/** Videos report their dimensions on metadata rather than as natural size. */
function onVideoMeta(event) {
  const element = event.target
  // Paged past before it was ready: playing it now leaves a detached element
  // with nothing left to stop it.
  if (!element.isConnected) {
    element.pause?.()
    return
  }

  if (element.videoWidth && element.videoHeight) {
    aspect.value = element.videoWidth / element.videoHeight
  }
  // The click that opened the viewer counts as the gesture that permits
  // playback; a browser that disagrees just leaves the poster up.
  element.play?.()?.catch(() => {})
}

/**
 * Decoding is what makes a freshly downloaded image appear in bands: `load`
 * fires when the bytes have arrived, but the browser still has to turn them into
 * pixels, and it does that while painting. Awaiting `decode()` does that work
 * first, so the image is revealed in one clean frame.
 */
async function revealWhenDecoded(image) {
  try {
    await image.decode()
  } catch {
    // Decoding can reject if the source changed mid-flight; reveal regardless.
  }
  return image.isConnected
}

async function onPreviewLoaded(event) {
  const image = event.target
  rememberAspect(image)
  // Decoded before it is declared ready, or the layer above it stands down onto
  // an image the browser is still turning into pixels - the banding `decode()`
  // exists to avoid.
  if (await revealWhenDecoded(image)) previewLoaded.value = true
}

/* Layers the browser already has. **A layer that will never be wanted must never
   be painted**, not painted and then faded out. So each is asked about before
   the first render. See docs/features/media-viewer.md. */

/** Whether the browser can paint this URL with no request of its own. */
function isCached(url) {
  if (!url) return false
  // A detached element answers straight away for anything in the memory cache.
  // Anything it does not know about simply keeps its stand-in, which is the
  // conservative way round.
  const probe = new Image()
  probe.src = url
  return probe.complete && probe.naturalWidth > 0
}

/*
 * A layer the browser already holds is marked ready before this file's first
 * paint, so it is never shown twice. Every ready layer stays visible beneath
 * the one above it, so the layer on top always renders over a real stand-in.
 * See docs/features/media-viewer.md.
 */
function settleLayers({ full = false, preview = false }) {
  if (full) {
    fullLoaded.value = true
    if (fullScreen.value) inHand.add(fullScreen.value)
    stopSpinner()
  }
  if (full || preview) {
    previewLoaded.value = true
  }
}

/**
 * Second chance at the same question, once the elements exist: an image held
 * only on disk reports `complete` before any `load` fires.
 */
function revealIfCached() {
  const full = picture.value
  if (full?.complete && full.naturalWidth) {
    rememberAspect(full)
    settleLayers({ full: true })
    return
  }

  const preview = previewImage.value
  if (preview?.complete && preview.naturalWidth) {
    rememberAspect(preview)
    settleLayers({ preview: true })
  }
}

async function onFullLoaded(event) {
  const image = event.target
  rememberAspect(image)
  if (await revealWhenDecoded(image)) {
    fullLoaded.value = true
    // Keyed exactly as `settleLayers` and `haveFullSize` key it, or a file would
    // be remembered under a name nothing looks it up by.
    if (fullScreen.value) inHand.add(fullScreen.value)
    stopSpinner()
  }
}

function onFullFailed() {
  fullFailed.value = true
  stopSpinner()
}

/* Gestures. One pointer surface for all of them, because their meanings overlap
   and deciding between them needs the whole picture of what is pressed.
   See docs/features/media-viewer.md. */
const MAX_SCALE = 4
const TAP_ZOOM = 2.5
const TAP_WINDOW = 210
const TAP_SLOP = 40
const DRAG_SLOP = 8
const ANIM_MS = SLIDE_MS
/** Floor for a velocity-shortened slide, so a fast fling is not a snap. */
const MIN_SLIDE_MS = 70
/**
 * Share of the frame a sideways drag must cross to turn the page. Short on
 * purpose: an unwanted turn costs one swipe back, a refused one costs the
 * whole gesture again.
 */
const SWIPE_COMMIT = 0.12
/** Travel, up or down, that dismisses the viewer. */
const DISMISS_DISTANCE = 120

const frame = ref(null)
/** The full-size image element, used to hit-test taps against the picture. */
const picture = ref(null)
const scale = ref(1)
const offsetX = ref(0)
const offsetY = ref(0)
/** Travel of the filmstrip itself, separate from the pan offset of one picture. */
const dragX = ref(0)
const dragY = ref(0)
const animating = ref(false)
const uiVisible = ref(true)

const zoomed = computed(() => scale.value > 1.01)

const stripStyle = computed(() => ({
  ...(dragX.value || dragY.value
    ? { transform: `translate3d(${dragX.value}px, ${dragY.value}px, 0)` }
    : {}),
  // The running slide's own length, so a fast swipe shortens the turn.
  transitionDuration: animating.value ? `${stripMs}ms` : undefined,
}))

/**
 * One scale, measured against the window: 1 fills it, less than 1 clears the
 * bars. Nothing here depends on whether the chrome is showing, which is what
 * keeps a toggle from disturbing the picture.
 */
const zoomStyle = computed(() => ({
  transform: `translate(${offsetX.value}px, ${offsetY.value}px) scale(${scale.value})`,
}))

/** Dragging away dims the surroundings, so the dismissal reads as deliberate. */
const dismissOpacity = computed(() =>
  Math.max(0.35, 1 - Math.abs(dragY.value) / (DISMISS_DISTANCE * 3)),
)

function frameSize() {
  const rect = frame.value?.getBoundingClientRect()
  return {
    width: rect?.width || window.innerWidth,
    height: rect?.height || window.innerHeight,
    rect,
  }
}

/**
 * Hands the picture back to its opening fit. The numbers here are provisional -
 * the proportions and the bars may not be known yet - and the sizing pass puts
 * the real ones in as soon as they are.
 */
function resetZoom() {
  scale.value = 1
  offsetX.value = 0
  offsetY.value = 0
  fitOffsetY.value = 0
  atInitialFit = true
}

/**
 * Holds the picture against the edges of the window. Measured from the picture
 * as drawn, not the window: only the part hanging past an edge may be panned.
 */
function clampOffset() {
  const { width, height } = frameSize()
  const ratio = knownAspect()

  const fittedWidth = ratio ? Math.min(width, height * ratio) : width
  const fittedHeight = ratio ? fittedWidth / ratio : height
  const drawnWidth = fittedWidth * scale.value
  const drawnHeight = fittedHeight * scale.value

  const roomX = (drawnWidth - width) / 2
  const roomY = (drawnHeight - height) / 2

  offsetX.value = roomX > 0 ? Math.min(roomX, Math.max(-roomX, offsetX.value)) : 0
  offsetY.value = roomY > 0 ? Math.min(roomY, Math.max(-roomY, offsetY.value)) : fitOffsetY.value
}

/**
 * The box of the picture as drawn right now - **the preview while the full-size
 * image is still loading**, which has no proportions yet and measures flat.
 * See docs/features/media-viewer.md.
 */
function pictureRect() {
  const drawn = (!fullLoaded.value && previewImage.value) || picture.value
  const rect = drawn?.getBoundingClientRect()
  return rect?.width && rect?.height ? rect : null
}

/** Whether a screen point lands on the picture itself rather than beside it. */
function isOnPicture(clientX, clientY) {
  const rect = pictureRect()
  if (!rect) return false
  return (
    clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom
  )
}

/** A point in frame coordinates, measured from its centre. */
function toFramePoint(clientX, clientY) {
  const { rect } = frameSize()
  if (!rect) return { x: 0, y: 0 }
  return {
    x: clientX - rect.left - rect.width / 2,
    y: clientY - rect.top - rect.height / 2,
  }
}

/**
 * Rescales around a fixed point: whatever sits under the cursor or between the
 * fingers stays there, which is what makes zooming feel attached to the hand.
 */
function zoomTo(next, point) {
  // The far end is wherever the picture rests: clear of the bars while they are
  // up, the whole window once they are away.
  const min = restingScale.value
  const clamped = Math.min(MAX_SCALE, Math.max(min, next))
  if (clamped === scale.value) return

  atInitialFit = false

  if (point) {
    const ratio = clamped / scale.value
    offsetX.value = point.x - (point.x - offsetX.value) * ratio
    offsetY.value = point.y - (point.y - offsetY.value) * ratio
  }

  scale.value = clamped
  if (clamped === min) {
    // Pulled all the way back out - the picture is the viewer's to place again,
    // so a later toggle of the chrome settles it afresh.
    applyRestingFit()
  } else {
    clampOffset()
  }
}

let animationTimer = null
/** How long the strip's current slide runs, read by `stripStyle`. */
let stripMs = ANIM_MS

/**
 * Runs a change with a transition, then drops back to direct manipulation.
 * **Every caller writes the finished state in `done` and only sets up for it in
 * `change`**, so motion-reduced can run both at once.
 */
let pendingSettle = null

/** Ends the running animation and writes the state it was on its way to. */
function settleAnimation() {
  clearTimeout(animationTimer)
  animationTimer = null
  animating.value = false

  const done = pendingSettle
  pendingSettle = null
  done?.()
}

function withAnimation(change, done, duration = ANIM_MS) {
  // Whatever the last one was going to settle is settled first. Dropping it is
  // how a turn interrupted by a zoom used to strand the strip a frame off
  // centre, with the file underneath it never swapped.
  if (pendingSettle) settleAnimation()

  if (motionReduced()) {
    change()
    done?.()
    return
  }

  stripMs = duration
  animating.value = true
  pendingSettle = done ?? null
  change()
  clearTimeout(animationTimer)
  animationTimer = setTimeout(settleAnimation, duration)
}

/**
 * Slide length from release speed: a swipe fast enough to cross the frame in
 * less than one `ANIM_MS` shortens the turn, so a fast fling is not left
 * running at full length once the reader is already starting the next.
 */
function slideMs(speed, width) {
  const neutral = width / ANIM_MS
  const ms = (ANIM_MS * neutral) / Math.max(speed, neutral / 4)
  return Math.round(Math.min(ANIM_MS, Math.max(MIN_SLIDE_MS, ms)))
}

/* Wheel zoom holds the transition on a moment after each notch, so discrete
   steps read as one continuous movement. */
let wheelTimer = null

function onWheel(event) {
  // A video is in the strip but takes no gestures from it; the page below is
  // locked anyway, so the wheel simply does nothing there.
  if (video.value) return
  event.preventDefault()

  // Firefox reports lines rather than pixels; normalise before scaling.
  const delta = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY

  animating.value = true
  zoomTo(scale.value * Math.exp(-delta * 0.0015), toFramePoint(event.clientX, event.clientY))

  clearTimeout(wheelTimer)
  wheelTimer = setTimeout(() => (animating.value = false), 180)
}

const pointers = new Map()
let drag = null
let pinch = null
let lastTapAt = 0
let lastTapX = 0
let uiTapTimer = null
let suppressClick = false

function beginDrag(clientX, clientY, pointerType, moved = false) {
  drag = {
    x: clientX,
    y: clientY,
    offsetX: offsetX.value,
    offsetY: offsetY.value,
    time: Date.now(),
    pointerType,
    moved,
    // True at rest; false when the finger lands on a slide still turning, when
    // the strip keeps its own animation and only decides an extra page later.
    follows: !turning,
    // Locked on the first decisive movement, so a page turn never becomes a
    // dismissal halfway through and vice versa.
    axis: null,
  }
}

/** Two fingers down: remember the span between them and drop any strip drag. */
function beginPinch() {
  const [a, b] = [...pointers.values()]
  drag = null
  dragX.value = 0
  dragY.value = 0
  pinch = {
    distance: Math.hypot(a.x - b.x, a.y - b.y),
    point: toFramePoint((a.x + b.x) / 2, (a.y + b.y) / 2),
    scale: scale.value,
    offsetX: offsetX.value,
    offsetY: offsetY.value,
  }
}

function updatePinch() {
  const [a, b] = [...pointers.values()]
  const distance = Math.hypot(a.x - b.x, a.y - b.y)
  if (!pinch.distance || !distance) return

  const next = Math.min(MAX_SCALE, Math.max(1, (pinch.scale * distance) / pinch.distance))
  // The midpoint may travel as well, which pans at the same time - the motion a
  // maps app makes when the pinch and the hand move together.
  const centre = toFramePoint((a.x + b.x) / 2, (a.y + b.y) / 2)
  const ratio = next / pinch.scale
  offsetX.value = centre.x - (pinch.point.x - pinch.offsetX) * ratio
  offsetY.value = centre.y - (pinch.point.y - pinch.offsetY) * ratio
  scale.value = next
  clampOffset()
}

/** Whether a press landed on the player, whose own drags and taps come first. */
function onPlayer(target) {
  return video.value && Boolean(target?.closest?.('video'))
}

function onPointerDown(event) {
  // Cleared before the press may be handed to the player, whose own click a
  // lingering flag would eat.
  suppressClick = false
  if (onPlayer(event.target)) return

  frame.value?.setPointerCapture?.(event.pointerId)
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })

  // Nothing to magnify in a video, so two fingers stay a drag.
  if (pointers.size === 2 && !video.value) beginPinch()
  else if (pointers.size === 1) beginDrag(event.clientX, event.clientY, event.pointerType)
}

function onPointerMove(event) {
  if (!pointers.has(event.pointerId)) return
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })

  if (pinch) {
    updatePinch()
    return
  }
  if (!drag) return

  const dx = event.clientX - drag.x
  const dy = event.clientY - drag.y
  if (Math.hypot(dx, dy) > DRAG_SLOP) drag.moved = true
  if (!drag.moved) return

  if (zoomed.value) {
    atInitialFit = false
    offsetX.value = drag.offsetX + dx
    offsetY.value = drag.offsetY + dy
    clampOffset()
    return
  }

  // Only touch drags the strip; a mouse has the arrows and the keyboard.
  if (drag.pointerType === 'mouse') return

  if (!drag.axis) drag.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y'

  if (drag.axis === 'x') {
    // A drag that began on a strip still turning must not yank it - the running
    // slide is left to finish, and the finger only adds a page on release.
    if (!drag.follows) return
    // Resist at the ends of the list, so the strip feels bounded.
    const blocked = (dx < 0 && !hasNext.value) || (dx > 0 && !hasPrev.value)
    dragX.value = blocked ? dx * 0.25 : dx
  } else {
    dragY.value = dy
  }
}

/** Decides whether a released sideways drag turns the page or springs back. */
function settleStrip(dx, duration = ANIM_MS) {
  const { width } = frameSize()
  const direction = dx < 0 ? 1 : -1
  const canGo = direction === 1 ? hasNext.value : hasPrev.value

  if (Math.abs(dx) < width * SWIPE_COMMIT || !canGo) {
    withAnimation(() => (dragX.value = 0))
    return
  }

  // The same turn an arrow makes: the strip slides a whole frame, the
  // neighbour riding there lands dead centre, and the index changes underneath
  // it so the picture stays exactly where the animation left it.
  slideOneFrame(direction, duration)
}

/** Whether a released vertical drag dismisses or springs back. Either direction:
 *  up and down say the same thing. */
function settleDismiss(dy) {
  if (Math.abs(dy) > DISMISS_DISTANCE) {
    /*
      No flight back to the tile. The reader has just pushed the picture off the
      screen themselves, which is a departure of its own and the one they are
      watching; adding a second one sent the picture sliding away and shrinking
      towards its tile at the same time, in two directions at once.
    */
    close({ fly: false })
    return
  }
  withAnimation(() => (dragY.value = 0))
}

function toggleUi() {
  uiVisible.value = !uiVisible.value
}

function onPointerUp(event) {
  pointers.delete(event.pointerId)

  if (pinch) {
    if (pointers.size >= 2) return
    pinch = null
    suppressClick = true
    if (!zoomed.value) withAnimation(resetZoom)
    // A finger still on the glass keeps panning rather than starting a strip drag.
    const [rest] = [...pointers.values()]
    if (rest) beginDrag(rest.x, rest.y, 'touch', true)
    return
  }

  if (!drag) return
  const { moved, pointerType, axis, time, follows } = drag
  const dx = event.clientX - drag.x
  const dy = event.clientY - drag.y
  drag = null

  if (moved) {
    suppressClick = true
    if (zoomed.value) return

    // The swipe's own speed shortens its slide, so a fast fling is not left
    // running at full length when the next one is already on its way.
    const width = frameSize().width
    const speed = Math.abs(dx) / Math.max(1, Date.now() - time)
    const duration = slideMs(speed, width)

    if (axis === 'y') {
      settleDismiss(dy)
      return
    }

    const flick =
      pointerType !== 'mouse' &&
      Math.abs(dx) > 40 &&
      Math.abs(dx) > Math.abs(dy) * 1.5 &&
      Date.now() - time < 800

    if (axis === 'x' || flick) {
      // A gesture that began while a slide was still turning never grabbed the
      // strip; it only decides whether to add one more page once that slide has
      // finished. See docs/features/media-viewer.md.
      if (!follows) {
        const want = Math.abs(dx) >= width * SWIPE_COMMIT || flick
        const dir = dx < 0 ? 1 : -1
        if (want && (dir === 1 ? hasNext.value : hasPrev.value)) page(dir, duration)
        return
      }
      settleStrip(dx, duration)
    }
    return
  }

  // A mouse click on the picture hides the chrome, beside it closes. Hit-tested
  // against the image's box, never `event.target` - capture retargets to the
  // frame. A finger only ever toggles the chrome.
  // See docs/features/media-viewer.md.
  if (pointerType === 'mouse') {
    if (isOnPicture(event.clientX, event.clientY)) toggleUi()
    else close()
    return
  }

  /* A tap hides the chrome; a pair magnifies. The toggle waits `TAP_WINDOW` to
     find out which, or a double tap shows the chrome leaving and returning. */
  // Nothing to magnify on a video, so no second tap to wait for.
  if (video.value) {
    toggleUi()
    return
  }

  const now = Date.now()
  if (now - lastTapAt < TAP_WINDOW && Math.abs(event.clientX - lastTapX) < TAP_SLOP) {
    // The second of the pair: call off the toggle the first one queued, or the
    // picture would magnify and the bars would leave in the same breath.
    clearTimeout(uiTapTimer)
    withAnimation(() =>
      zoomed.value ? resetZoom() : zoomTo(TAP_ZOOM, toFramePoint(event.clientX, event.clientY)),
    )
    lastTapAt = 0
    suppressClick = true
    return
  }

  lastTapAt = now
  lastTapX = event.clientX
  clearTimeout(uiTapTimer)
  uiTapTimer = setTimeout(toggleUi, TAP_WINDOW)
}

function onPointerCancel(event) {
  pointers.delete(event.pointerId)
  if (pointers.size < 2) pinch = null
  if (!pointers.size) {
    drag = null
    if (dragX.value || dragY.value) {
      withAnimation(() => {
        dragX.value = 0
        dragY.value = 0
      })
    }
  }
}

/*
  Nothing in here answers a click made before the viewer was open: it belongs to
  the tap that opened it. See docs/features/media-grid-and-selection.md.
*/
let openedAt = 0

function onDialogClickCapture(event) {
  if (performance.now() - openedAt >= GHOST_CLICK_MS) return
  event.stopPropagation()
  event.preventDefault()
}

function onFrameClickCapture(event) {
  if (!suppressClick) return
  event.stopPropagation()
  event.preventDefault()
  suppressClick = false
}

/* Growing out of the tile that was clicked, and shrinking back into it. Boxes
   come from the numbers that place the picture, never measured off the element,
   so a flight can run before it exists and after it is gone.
   See docs/features/media-viewer.md. */

/** What a grid tile wears; `rounded-md`, and gone by the time it lands. */
const TILE_RADIUS = 6

const flight = ref(null)
/** A tile box captured as the viewer opens, waiting for somewhere to fly to. */
let heroOrigin = null
/**
 * The very element the viewer was opened from, and the file it held - a file is
 * often on the page more than once. Only valid for that file; paging away hands
 * the job back to the search. See docs/features/media-viewer.md.
 */
let originTile = null

/** The box a file occupies on the page underneath, if it is on screen at all. */
function tileBox(item, { offscreen = false } = {}) {
  let hidden = null

  for (const tile of tilesFor(item?.id)) {
    const box = boxOf(tile)
    if (!box) continue
    // Every match, not the first: a file hung twice is as likely as not to have
    // its first copy scrolled off the side.
    if (isOnScreen(box)) return box
    hidden ??= box
  }

  // An off-screen tile is a destination but never an origin: arriving out of
  // nothing reads as a glitch, leaving towards it reads correctly.
  return offscreen ? hidden : null
}

/**
 * Where a closing picture goes: the remembered `originTile` even off-screen, and
 * otherwise only a tile that is on screen. No destination leaves the plain fade
 * to do the work, which is the right answer for a viewer opened from a link.
 */
function tileBoxBack(item) {
  if (originTile?.id === item?.id && originTile.el.isConnected) {
    const box = boxOf(originTile.el)
    if (box) return box
  }
  return tileBox(item, { offscreen: false })
}

/**
 * The box the open picture is drawn in, from the numbers that place it rather
 * than from the element - which has none until it has loaded.
 */
function pictureBox() {
  const ratio = knownAspect()
  if (!ratio) return null

  const width = Math.min(window.innerWidth, window.innerHeight * ratio) * scale.value
  const height = width / ratio
  return {
    left: (window.innerWidth - width) / 2 + offsetX.value,
    top: (window.innerHeight - height) / 2 + offsetY.value,
    width,
    height,
  }
}

/**
 * The sharpest image the browser can paint right now. A stale `inHand` record that
 * the browser has evicted would fly empty; the preview is always present here and
 * the full is overlaid the moment it decodes.
 */
function heroSource(item) {
  const full = fullScreenSrc(item)
  if (full && isCached(full)) return full
  return previewSrc(item) || miniatureSrc(item)
}

/*
  A file that finishes arriving mid-flight takes over from its stand-in.

  `fullLoaded` is only raised once the image has been decoded as well as
  fetched, so by the time this runs the browser can paint it in the frame it is
  asked to - which is what makes swapping the source safely invisible.
*/
watch(fullLoaded, (loaded) => {
  if (loaded) flight.value?.setSource(fullScreenSrc(current.value))
})

/**
 * @param {{ fly?: boolean }} options `fly` is false when the reader has already
 *   thrown the picture somewhere themselves - see `settleDismiss`.
 */
function close({ fly = true } = {}) {
  // Captured before the file is let go of: `current` is about to be null, and
  // with it every proportion the picture's box is worked out from.
  if (fly) {
    flight.value?.fly({
      src: heroSource(current.value),
      from: pictureBox(),
      to: tileBoxBack(current.value),
      fromRadius: 0,
      toRadius: TILE_RADIUS,
      insets: chromeInsets(),
    })
  }

  emit('update:index', null)
  emit('close')
}

/**
 * The way back to the note a reference was followed from. Offered on **any**
 * file: the anchor names a place in the text, not the picture it opened, so
 * paging away does not lose it. See docs/features/rich-text-and-links.md.
 */
function returnToText() {
  close()
  emit('return')
}

/** A reference inside the description: show that file instead. */
function openFromCaption(reference) {
  const index = props.items.findIndex((item) => item.id === reference?.mediaId)
  if (index >= 0) emit('update:index', index)
}

function step(delta) {
  const next = props.index + delta
  if (next < 0 || next >= props.items.length) return
  emit('update:index', next)
}

/**
 * Turning the page from an arrow or a key, by the movement a released swipe
 * already makes - so every route to the next file produces the same movement.
 * See docs/features/media-viewer.md.
 */
let queuedTurn = 0
/** The frame a queued turn is waiting on, so closing can call it off. */
let queuedFrame = 0
/** The queued turn's own slide length, carried with `queuedTurn`. */
let queuedDur = ANIM_MS
/**
 * True while a turn's slide is running. **Not `animating`** - a turn only waits
 * for another turn, and the general flag made hiding the chrome swallow the next
 * arrow press.
 */
let turning = false

/** Slides the strip one frame along and swaps the file when it lands. */
function slideOneFrame(delta, duration = ANIM_MS) {
  turning = true
  const { width } = frameSize()

  withAnimation(
    () => (dragX.value = -delta * width),
    () => {
      step(delta)
      dragX.value = 0
      turning = false

      if (!queuedTurn) return
      const waiting = queuedTurn
      const waitingDur = queuedDur
      queuedTurn = 0
      queuedDur = ANIM_MS
      // A frame, not a tick: the next slide must start from a rest the browser
      // has drawn. See docs/features/media-viewer.md.
      cancelAnimationFrame(queuedFrame)
      queuedFrame = requestAnimationFrame(() => page(waiting, waitingDur))
    },
    duration,
  )
}

function page(delta, duration = ANIM_MS) {
  const next = props.index + delta
  if (next < 0 || next >= props.items.length) return

  // A magnified picture cannot be slid sideways - that is what the finger is
  // doing there - so an arrow simply takes the reader to the next file.
  if (zoomed.value) {
    step(delta)
    return
  }

  if (turning) {
    // Waits its own turn; the running slide cannot be cut short. **Only one is
    // remembered**, or a held-down arrow keeps turning after the key comes up.
    queuedTurn = Math.sign(delta)
    queuedDur = duration
    return
  }

  slideOneFrame(delta, duration)
}

// Registered before the `current` watcher, which reads the direction it sets.
watch(
  () => props.index,
  (next, prev) => {
    if (prev != null && next != null) pageDirection = next >= prev ? 1 : -1
  },
)

watch(current, () => {
  fullLoaded.value = false
  fullFailed.value = false
  previewLoaded.value = false
  /*
    Asked before this file has been rendered even once, so a layer the browser
    already holds is never given a frame it would have to be shown twice. A
    full-size whose bytes were warmed ahead of the turn settles here too, so the
    file is drawn sharp from the first frame instead of fading in after the slide.
    See docs/features/media-viewer.md.
  */
  settleLayers({
    full: haveFullSize(current.value),
    preview: isCached(preview.value),
  })
  aspect.value = mediaAspect(current.value)
  tagsExpanded.value = false
  descriptionExpanded.value = false
  resetZoom()
  armSpinner()
  // Turned to a file: fetch the previews just ahead of it now, so a reader
  // flipping down a long, lazily-loaded day is not left waiting on one.
  warmPreviews()
  // And the full-size image of the neighbour ahead, so the next turn is sharp.
  warmFullSize(pageDirection)
})

/**
 * Sizing runs after the DOM has been updated and before the paint that follows,
 * and writes its result straight onto the element. Reading it a tick later, or
 * handing it to a reactive value to apply on the next render, is what used to
 * let a frame out at the wrong size.
 */
watch(
  // `aspect` is in here because the fit cannot be worked out without it, and it
  // usually arrives after the first pass - with the preview, a moment later.
  [open, current, uiVisible, aspect],
  () => {
    if (!open.value) return
    // Before the sizing, so a cached picture is already the one being sized.
    revealIfCached()
    measureChrome()

    if (heroOrigin) {
      const from = heroOrigin
      heroOrigin = null
      flight.value?.fly({
        src: heroSource(current.value),
        from,
        to: pictureBox(),
        fromRadius: TILE_RADIUS,
        toRadius: 0,
        insets: chromeInsets(),
      })
    }

  },
  { flush: 'post' },
)

let restTimer = null

/**
 * Moving the chrome moves where the picture rests, so it travels there rather
 * than jumping. Only for a picture still at rest: one the reader has zoomed is
 * left exactly as they left it.
 */
watch(uiVisible, () => {
  if (!open.value || !atInitialFit || motionReduced()) return
  animating.value = true
  clearTimeout(restTimer)
  restTimer = setTimeout(() => {
    // Unless something with a settling of its own has started meanwhile: that
    // one owns the flag now, and switching it off would drop its transition
    // partway through.
    if (!pendingSettle) animating.value = false
  }, ANIM_MS)
})

/* Chrome measurements. The bars grow with their contents, so their heights are
   measured and fed back as the padding of the filmstrip cells. The same observer
   answers whether the contents overflow. See docs/features/media-viewer.md. */
const header = ref(null)
const footer = ref(null)
const band = ref(null)
const tagList = ref(null)
const description = ref(null)
const previewImage = ref(null)

const tagsExpanded = ref(false)
const tagsOverflow = ref(false)
const descriptionExpanded = ref(false)
const descriptionOverflow = ref(false)

let chromeObserver = null

/** Proportions of the file, read off the preview the grid already downloaded. */
function previewAspect() {
  const image = previewImage.value
  if (!image?.complete || !image.naturalWidth || !image.naturalHeight) return null
  return image.naturalWidth / image.naturalHeight
}

/**
 * The proportions the fitting maths works from. **Everything deciding where the
 * picture goes asks here** - anywhere else and the answer depends on whether an
 * image happened to have loaded.
 */
function knownAspect() {
  return aspect.value ?? previewAspect()
}

/** Whether a bar's contents run past the height it is allowed. */
function overflows(element, expanded) {
  return Boolean(element) && (expanded || element.scrollHeight > element.clientHeight + 1)
}

/**
 * Records the tag row's overflow, and writes its margin class by hand.
 *
 * That class is part of the footer's height, and the binding only lands on the
 * next render - too late for a measurement taken in this pass.
 */
function settleTagOverflow() {
  const tags = tagList.value
  if (!tags) return
  tagsOverflow.value = overflows(tags, tagsExpanded.value)
  tags.classList.toggle('mt-3.5', tagsOverflow.value)
}

/**
 * Where the bars leave off. In state, not read on demand: three fits want the
 * same reading, and a reactive one makes them all recompute when the bars move.
 */
const bandTop = ref(0)
const bandBottom = ref(0)

function readBand() {
  const rect = band.value?.getBoundingClientRect()
  if (!rect || rect.height <= 0) return
  bandTop.value = Math.round(rect.top)
  bandBottom.value = Math.round(window.innerHeight - rect.bottom)
}

/**
 * Insets, but **only when the bars actually bind** - a landscape file runs out of
 * width first and never meets them. Null hands the caller back to the
 * approximate route. See docs/features/media-viewer.md.
 */
function exactBand(ratio) {
  if (!ratio) return null

  const top = bandTop.value
  const bottom = bandBottom.value
  if (top + bottom <= 0) return null

  const barsDifference = Math.abs(top - bottom)
  const available = window.innerHeight - (top + bottom) - barsDifference
  if (available <= 0) return null
  if (ratio >= window.innerWidth / available) return null

  return { top, bottom }
}

/**
 * The scale and the shift that put a file of these proportions where it rests:
 * pulled back far enough to clear the bars, and moved into the middle of what
 * they leave. Pure - nothing but the ratio and the bars decides it - which is
 * what lets the neighbours in the filmstrip be placed by the very same sum.
 */
function fitWithin(insets, ratio) {
  const top = insets?.top ?? 0
  const bottom = insets?.bottom ?? 0

  const height = window.innerHeight
  const width = window.innerWidth
  const band = height - top - bottom

  if (!ratio || band <= 0) return { scale: 1, offsetY: 0 }

  // Widths of the picture fitted to the window and fitted to the band; their
  // ratio is what the bars cost.
  const toWindow = Math.min(width, height * ratio)
  const toBand = Math.min(width, band * ratio)

  return {
    scale: toWindow > 0 ? toBand / toWindow : 1,
    offsetY: (top - bottom) / 2,
  }
}

/** The resting fit of a file, from its proportions alone. */
function restingFitFor(ratio) {
  return fitWithin(exactBand(ratio), ratio)
}

const chromeReady = ref(false)

/* Where the picture rests, and the far end of the zoom. The cell is the whole
   window, so scale 1 means as large as it allows. A reader who has zoomed keeps
   their size through a chrome toggle. See docs/features/media-viewer.md. */
const uiFitScale = ref(1)
const bandOffsetY = ref(0)
/** Where the picture rests, and what panning is measured around. */
const fitOffsetY = ref(0)
/** False once the reader has taken the zoom into their own hands. */
let atInitialFit = true

/** Scale at which the picture rests: clear of the bars, or filling the window. */
const restingScale = computed(() => (uiVisible.value ? uiFitScale.value : 1))
const restingOffsetY = computed(() => (uiVisible.value ? bandOffsetY.value : 0))

function measureBand() {
  // The preview knows its proportions before `aspect` has been told them, and
  // at the moment this first runs that is usually the only place to ask.
  const ratio = knownAspect()
  const insets = exactBand(ratio)

  // Only when the bars actually bind: the expander's margin is part of the
  // footer's height, so this settles the height that is about to be read again.
  if (insets) settleTagOverflow()

  const fit = fitWithin(insets, ratio)
  uiFitScale.value = fit.scale
  bandOffsetY.value = fit.offsetY
}

/**
 * The same placement for a filmstrip neighbour - the open file's sum with the
 * neighbour's **own** ratio, since whether the bars reach a picture depends on
 * its shape.
 */
function neighbourFit(item) {
  if (!uiVisible.value) return undefined
  const { scale, offsetY } = restingFitFor(mediaAspect(item))
  if (scale === 1 && offsetY === 0) return undefined
  return { transform: `translate(0px, ${offsetY}px) scale(${scale})` }
}

/**
 * Sized by `.fit-media` against the cell, **not** capped at it: `max-width` and
 * `max-height` only shrink, so an under-sized preview arrived smaller than the
 * picture it replaced.
 */
function stripFit(item) {
  const ratio = mediaAspect(item)
  if (!ratio) return { class: 'max-h-full max-w-full', style: undefined }

  return {
    class: 'fit-media',
    // Spelled out: `height: auto` has no proportions to follow until the preview
    // has loaded, and a neighbour is drawn before it ever does.
    style: { '--ar': ratio, aspectRatio: String(ratio) },
  }
}

const prevFit = computed(() => stripFit(prevItem.value))
const nextFit = computed(() => stripFit(nextItem.value))

/** Settles the picture at rest for the chrome as it currently stands. */
function applyRestingFit() {
  scale.value = restingScale.value
  fitOffsetY.value = restingOffsetY.value
  offsetX.value = 0
  offsetY.value = fitOffsetY.value
  atInitialFit = true
}

/* Bars easing from one height to another, run on the elements themselves: a bar
   has no height of its own to transition between, and a keyframe can be given
   the two numbers where a stylesheet cannot. See docs/features/media-viewer.md. */
const barHeights = new WeakMap()
const barAnimations = new WeakMap()

/**
 * True while heights are written down but not acted on - a bar easing around a
 * list that is already easing itself is the bounce at the end of a collapse.
 */
let recordBarsOnly = false

function easeBarHeight(element) {
  if (!element) return

  // While one is running the heights being read are its own doing, and taking
  // them for a change would start another animation on every frame of this one.
  const running = barAnimations.get(element)
  if (running?.playState === 'running') return

  const next = element.offsetHeight
  const previous = barHeights.get(element)
  barHeights.set(element, next)
  if (recordBarsOnly || previous == null || previous === next || motionReduced()) return

  barAnimations.set(
    element,
    element.animate([{ height: `${previous}px` }, { height: `${next}px` }], {
      duration: ANIM_MS,
      easing: 'ease-out',
    }),
  )
}

function measureChrome() {
  const root = dialog.value

  // Frozen while a bar is open, and for as long as one is animating shut: the
  // expansion is meant to cover the picture, and following the bar back down
  // would drag the picture along with the collapse.
  if (root && !tagsExpanded.value && !descriptionExpanded.value && !chromeSettling) {
    readBand()
    measureBand()
    // Only until the reader takes over. After that the numbers above are just
    // the limit their zoom is held to.
    if (atInitialFit) applyRestingFit()
    else clampOffset()

    chromeReady.value = true

    // After the placement, not before: the bars are read at the height they have
    // settled on, and only then told to arrive there from where they were.
    easeBarHeight(header.value)
    easeBarHeight(footer.value)
  }

  tagsOverflow.value = overflows(tagList.value, tagsExpanded.value)
  descriptionOverflow.value = overflows(description.value, descriptionExpanded.value)
}

function observeChrome() {
  chromeObserver?.disconnect()
  if (typeof ResizeObserver === 'undefined') {
    measureChrome()
    return
  }

  chromeObserver = new ResizeObserver(measureChrome)
  for (const element of [header.value, footer.value, tagList.value, description.value]) {
    if (element) chromeObserver.observe(element)
  }
  measureChrome()
}

/**
 * Holds the measurement still until an opening or closing bar has finished
 * moving, then takes it once. Without it the observer follows every frame of the
 * collapse and the picture slides along with the bar.
 */
let chromeSettling = false
let chromeSettleTimer = null

/** Longer than the 300ms the tag list and the description take to open or shut. */
const CHROME_SETTLE_MS = 340

function settleChrome() {
  chromeSettling = true
  clearTimeout(chromeSettleTimer)
  chromeSettleTimer = setTimeout(() => {
    chromeSettling = false
    // Written down, not animated: the bar has just finished moving of its own
    // accord, and is already exactly where this would have sent it.
    recordBarsOnly = true
    measureChrome()
    recordBarsOnly = false
  }, CHROME_SETTLE_MS)
}

function toggleTags() {
  tagsExpanded.value = !tagsExpanded.value
  settleChrome()
}

function toggleDescription() {
  // A press that ended a text selection is not a request to expand the description.
  if (!window.getSelection()?.isCollapsed) return
  if (!descriptionOverflow.value) return
  descriptionExpanded.value = !descriptionExpanded.value
  settleChrome()
}

/** The grab handle also answers a drag: up opens the tag list, down closes it. */
let handleY = null

function onHandleDown(event) {
  handleY = event.clientY
}

function onHandleUp(event) {
  if (handleY === null) return
  const dy = event.clientY - handleY
  handleY = null
  if (Math.abs(dy) < 12) toggleTags()
  else tagsExpanded.value = dy < 0
}

/** Keeps Tab inside the dialog while it is open. */
function trapFocus(event) {
  const focusable = dialog.value?.querySelectorAll(
    'button:not([disabled]), a[href], video[controls], [tabindex]:not([tabindex="-1"])',
  )
  if (!focusable?.length) return

  const first = focusable[0]
  const last = focusable[focusable.length - 1]

  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}

/** Its place in the shared overlay stack - see services/overlayStack. */
const overlayToken = Symbol('lightbox')

function onKeydown(event) {
  // A viewer opened from inside an edit dialog sits over it, and both listen on
  // the document. Without this, one Escape closed the viewer and the dialog
  // underneath it - along with whatever had been typed into it.
  if (!open.value || !isTopmost(overlayToken)) return

  switch (event.key) {
    case 'Escape':
      event.preventDefault()
      close()
      break
    case 'ArrowLeft':
      event.preventDefault()
      page(-1)
      break
    case 'ArrowRight':
      event.preventDefault()
      page(1)
      break
    case 'Tab':
      trapFocus(event)
      break
  }
}

function resetGestures() {
  heroOrigin = null
  originTile = null
  queuedTurn = 0
  queuedDur = ANIM_MS
  cancelAnimationFrame(queuedFrame)
  queuedFrame = 0
  turning = false
  pendingSettle = null
  clearTimeout(restTimer)
  pointers.clear()
  drag = null
  pinch = null
  clearTimeout(uiTapTimer)
  clearTimeout(animationTimer)
  clearTimeout(wheelTimer)
  animating.value = false
  dragX.value = 0
  dragY.value = 0
  resetZoom()
  uiVisible.value = true
}

/* Closes when the **route actually changes**, never on the click - the page below
   answers a close by rewriting its address, and that cancels a navigation in
   flight. Compares `pageIdentity`, not the address, which carries `?i=`.
   See docs/features/media-viewer.md. */
watch(
  () => pageIdentity(route),
  () => {
    if (open.value) close()
  },
)

/* Scroll unlock is **delayed**: a dismissal ends on `pointerup` while `touchend`
   is still pending, and a page that becomes scrollable mid-gesture eats the next
   tap as a fling-stop. See docs/features/media-viewer.md. */
const UNLOCK_DELAY = 120
let unlockTimer = null

function lockScroll() {
  clearTimeout(unlockTimer)
  unlockTimer = null
  document.body.style.overflow = 'hidden'
}

/**
 * Giving the page its scrolling back - unless something else still wants it
 * held. A viewer opened from inside an edit dialog closes over that dialog,
 * which is still a full-window overlay and still needs the page still.
 */
function releaseScroll() {
  if (hasOverlay()) return
  document.body.style.overflow = ''
}

function unlockScroll({ now = false } = {}) {
  clearTimeout(unlockTimer)
  unlockTimer = null

  if (now) {
    releaseScroll()
    return
  }

  unlockTimer = setTimeout(() => {
    unlockTimer = null
    releaseScroll()
  }, UNLOCK_DELAY)
}

watch(open, async (isOpen) => {
  if (isOpen) {
    pushOverlay(overlayToken)
    // Read now, with the page below still laid out as the reader left it.
    // Searching by id is the fallback only - a file can be on the page twice.
    // `NO_SOURCE` is the opener saying it has no tile at all, so skip the search.
    const source = takeOpenedFrom()
    const from =
      source === NO_SOURCE ? null : (source ?? tileFor(current.value?.id, { visible: true }))
    originTile = from ? { el: from, id: current.value?.id } : null
    heroOrigin = from ? boxOf(from) : null
    openedAt = performance.now()
    // Opened on a file: the reader may flip either way, so warm both sides. A
    // turn after this warms only the direction it travels - see `watch(current)`.
    warmFullSize(1)
    warmFullSize(-1)
    chromeReady.value = false
    lastFocused = document.activeElement
    document.addEventListener('keydown', onKeydown)
    // Locking the body keeps the page behind from scrolling under the overlay.
    lockScroll()
    await nextTick()
    dialog.value?.focus()
    observeChrome()
  } else {
    popOverlay(overlayToken)
    chromeObserver?.disconnect()
    chromeObserver = null
    clearTimeout(chromeSettleTimer)
    chromeSettling = false
    document.removeEventListener('keydown', onKeydown)
    unlockScroll()
    stopSpinner()
    resetGestures()
    // Focus back to the tile, **never scrolling to it**: the page scrolls
    // smoothly, and a browser discards the click of any touch that began or
    // ended while it was moving. See docs/features/media-viewer.md.
    lastFocused?.focus?.({ preventScroll: true })
    lastFocused = null
  }
})

onBeforeUnmount(() => {
  popOverlay(overlayToken)
  flight.value?.cancel()
  document.removeEventListener('keydown', onKeydown)
  unlockScroll({ now: true })
  stopSpinner()
  resetGestures()
  chromeObserver?.disconnect()
  chromeObserver = null
  clearTimeout(chromeSettleTimer)
})
</script>

<template>
  <Teleport to="body">
    <!--
      A dark room under every theme, with the theme's accent carried through the
      chrome - see `.lightbox` in main.css for the palette. It sits above
      Leaflet's panes (z-index ~1000), which otherwise poke through on the day
      page.
    -->
    <Transition name="lightbox">
      <div
        v-if="open && current"
        ref="dialog"
        class="lightbox fixed inset-0 z-[2400] overflow-hidden"
        :class="chromeReady ? 'lightbox-measured' : ''"
        :style="{
          opacity: chromeReady ? dismissOpacity : 0,
        }"
        role="dialog"
        aria-modal="true"
        :aria-label="label"
        tabindex="-1"
        @click.capture="onDialogClickCapture"
      >
        <!-- Every file lives in the filmstrip, video included; only the gestures
             differ. See docs/features/media-viewer.md. -->
        <div
          ref="frame"
          class="absolute inset-0 overflow-hidden"
          :class="[video ? '' : 'touch-none', zoomed ? 'cursor-grab' : '']"
          @wheel="onWheel"
          @pointerdown="onPointerDown"
          @pointermove="onPointerMove"
          @pointerup="onPointerUp"
          @pointercancel="onPointerCancel"
          @click.capture="onFrameClickCapture"
        >
          <!-- The gesture surface for the space around a player. Under the strip
               rather than on the frame, or the player would inherit `touch-none`
               and lose its scrubbing. -->
          <div v-if="video" class="absolute inset-0 touch-none" aria-hidden="true" />

          <!-- The neighbours sit one frame away on either side, drawn from the
               previews the grid already cached. **Keyed by the file**: an `img`
               given a new `src` goes on painting the old one until it loads. -->
          <div
            class="lightbox-strip absolute inset-0"
            :class="[
              animating ? 'transition-transform duration-200' : '',
              flight?.active ? 'opacity-0' : '',
              video ? 'pointer-events-none' : '',
            ]"
            :style="stripStyle"
          >
            <div
              v-if="prevItem"
              class="lightbox-cell absolute inset-0 flex -translate-x-full items-center justify-center"
            >
              <div
                class="flex h-full w-full items-center justify-center"
                :style="neighbourFit(prevItem)"
              >
                <img
                  :key="prevItem.id ?? prevItem.fileName"
                  :src="stripSrc(prevItem)"
                  alt=""
                  aria-hidden="true"
                  draggable="false"
                  class="object-contain"
                  :class="prevFit.class"
                  :style="prevFit.style"
                />
              </div>
            </div>

            <div class="lightbox-cell absolute inset-0 flex items-center justify-center">
              <!-- Clipped into the band by the same transform that places a
                   picture, and given `aspect-ratio` outright - a video has no
                   proportions until its metadata arrives.
                   See docs/features/media-viewer.md. -->
              <div
                v-if="video"
                class="flex h-full w-full items-center justify-center"
                :class="animating ? 'transition-transform duration-200' : ''"
                :style="zoomStyle"
              >
                <video
                  :key="current.id ?? current.fileName"
                  :src="stream"
                  :poster="preview"
                  controls
                  playsinline
                  preload="metadata"
                  class="pointer-events-auto max-h-full max-w-full object-contain"
                  :class="fitClass"
                  :style="fitBoxStyle"
                  @loadedmetadata="onVideoMeta"
                />
              </div>

              <!--
              Three layers, sharpest on top: the blurred miniature is the base,
              the preview settles over it and the full image over that. Each is
              transparent until it is whole, and once whole it stays beneath the
              next as a placeholder. Every one carries `draggable="false"`.
              See docs/features/media-viewer.md.
            -->
              <div
                v-else
                class="relative isolate flex h-full w-full items-center justify-center"
                :class="animating ? 'transition-transform duration-200' : ''"
                :style="zoomStyle"
              >
                <img
                  :key="current.id ?? current.fileName"
                  :src="fullScreen"
                  :alt="label"
                  ref="picture"
                  draggable="false"
                  class="relative z-[30] object-contain"
                  :class="[
                    fitClass,
                    fullLoaded ? 'opacity-100' : 'opacity-0',
                    flight?.active ? '' : 'transition-opacity duration-300',
                  ]"
                  :style="aspectStyle"
                  @load="onFullLoaded"
                  @error="onFullFailed"
                />

                <img
                  v-if="preview"
                  ref="previewImage"
                  :key="`preview-${current.id ?? current.fileName}`"
                  :src="preview"
                  alt=""
                  aria-hidden="true"
                  draggable="false"
                  class="pointer-events-none absolute left-1/2 top-1/2 z-[20] -translate-x-1/2 -translate-y-1/2 object-contain"
                  :class="[
                    fitClass,
                    previewLoaded ? 'opacity-100' : 'opacity-0',
                    'transition-opacity duration-300',
                  ]"
                  :style="aspectStyle"
                  @load="onPreviewLoaded"
                />

                <div
                  v-if="miniature"
                  class="pointer-events-none absolute left-1/2 top-1/2 z-[10] -translate-x-1/2 -translate-y-1/2 overflow-hidden"
                  :class="fitClass"
                  :style="fitBoxStyle"
                  aria-hidden="true"
                >
                  <img
                    :key="`ground-${current.id ?? current.fileName}`"
                    :src="miniature"
                    alt=""
                    draggable="false"
                    class="h-full w-full scale-110 object-cover blur-[24px]"
                  />
                </div>
              </div>
            </div>

            <div
              v-if="nextItem"
              class="lightbox-cell absolute inset-0 flex translate-x-full items-center justify-center"
            >
              <div
                class="flex h-full w-full items-center justify-center"
                :style="neighbourFit(nextItem)"
              >
                <img
                  :key="nextItem.id ?? nextItem.fileName"
                  :src="stripSrc(nextItem)"
                  alt=""
                  aria-hidden="true"
                  draggable="false"
                  class="object-contain"
                  :class="nextFit.class"
                  :style="nextFit.style"
                />
              </div>
            </div>
          </div>

          <!-- Outside the strip, so neither dragging nor zooming moves it. -->
          <!-- Keyframe classes, not utilities: the wheel fades in on its own
               clock once `spinnerShown` lets it in. See `.lb-spinner-*`. -->
          <Transition name="lb-spinner" appear>
            <!-- `spinnerShown`, not `showSpinner`: the wheel is held back until
                 the room is up **and the opening flight has landed**, or it
                 arrives behind the flying picture already opaque. -->
            <span
              v-if="spinnerShown"
              class="pointer-events-none absolute inset-0 flex items-center justify-center"
              aria-hidden="true"
            >
              <span
                class="spinner h-9 w-9 rounded-full border-2 border-[var(--lb-edge)] border-t-[var(--lb-accent)]"
              />
            </span>
          </Transition>
        </div>

        <!--
        Chrome floating over the picture. The bars **slide, never fade** - a
        backdrop filter and an opacity transition do not co-operate. The wrapper
        ignores pointer events; each bar takes them back.
        See docs/features/media-viewer.md.
      -->
        <div class="pointer-events-none absolute inset-0 flex flex-col overflow-hidden">
          <div
            ref="header"
            class="lightbox-bar lightbox-bar-top flex items-start justify-between gap-4 overflow-hidden px-3 py-2 transition-transform duration-200"
            :class="uiVisible ? 'pointer-events-auto' : '-translate-y-full'"
          >
            <div class="lightbox-selectable min-w-0 pt-1">
              <!-- Above the title rather than beside it: the title is truncated
                   to whatever room is left, and a mark sharing that line would
                   be the first thing squeezed out on a phone. -->
              <p
                v-if="hidden"
                class="mb-1 inline-flex items-center gap-1 rounded bg-accent px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-paper"
              >
                <svg
                  class="h-3 w-3"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.4"
                  aria-hidden="true"
                >
                  <path
                    d="M2.2 8s2.3-3.8 5.8-3.8S13.8 8 13.8 8s-2.3 3.8-5.8 3.8S2.2 8 2.2 8z"
                    stroke-linejoin="round"
                  />
                  <circle cx="8" cy="8" r="1.6" />
                  <path d="M3 13 13 3" stroke-linecap="round" />
                </svg>
                {{ t('media.hidden') }}
              </p>
              <!-- Two lines rather than an ellipsis: a name rarely fits one on a
                   phone. -->
              <p class="line-clamp-2 text-sm font-medium">{{ label }}</p>
              <!-- Two limits, both needed: the clamp ends a cut line in an
                   ellipsis, the max-height is what animates and what the
                   overflow check reads. See docs/features/media-viewer.md. -->
              <p
                v-if="caption"
                ref="description"
                class="mt-1 overflow-hidden text-xs text-[var(--lb-accent)] transition-[max-height] duration-200"
                :class="[
                  descriptionExpanded
                    ? 'line-clamp-none max-h-[40vh] overflow-y-auto'
                    : 'line-clamp-2 max-h-[2.25rem]',
                  descriptionOverflow ? 'cursor-pointer' : '',
                ]"
                @click="toggleDescription"
              >
                <RichText
                  :text="caption"
                  :media="items"
                  @media-activate="openFromCaption"
                  @media-open="openFromCaption"
                />
              </p>
            </div>

            <div class="flex shrink-0 items-center gap-1">
              <!-- Left of the cross, and kept there while paging: the way back is
                   to the text, whatever file is on screen now. -->
              <button
                v-if="canReturnToText"
                type="button"
                class="lightbox-icon shrink-0 rounded-full p-2"
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

              <button
                type="button"
                class="lightbox-icon shrink-0 rounded-full p-2"
                :aria-label="t('media.close')"
                @click="close"
              >
                <svg
                  class="h-5 w-5"
                  viewBox="0 0 20 20"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.8"
                  aria-hidden="true"
                >
                  <path d="m5 5 10 10M15 5 5 15" stroke-linecap="round" />
                </svg>
              </button>
            </div>
          </div>

          <!-- Positioned against the window, not laid out between the bars, and
               sliding rather than fading for the same reason they do.
               See docs/features/media-viewer.md. -->
          <div
            class="absolute inset-x-2 top-1/2 flex -translate-y-1/2 items-center justify-between"
          >
            <!--
            Both stay mounted whether or not there is a file that way: reaching
            the end of the list should retire an arrow the same way hiding the
            chrome does, and a `v-if` would snatch it away instead of letting it
            leave. `disabled` keeps a retired one off the keyboard's path.
          -->
            <button
              type="button"
              :disabled="!hasPrev"
              class="lightbox-arrow lightbox-icon rounded-full p-3 transition-transform duration-200"
              :class="
                uiVisible && hasPrev ? 'pointer-events-auto' : '-translate-x-[calc(100%+1rem)]'
              "
              :aria-label="t('media.prev')"
              @click="page(-1)"
            >
              <svg
                class="h-5 w-5"
                viewBox="0 0 20 20"
                fill="none"
                stroke="currentColor"
                stroke-width="1.8"
                aria-hidden="true"
              >
                <path d="M12.5 4 6.5 10l6 6" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </button>

            <button
              type="button"
              :disabled="!hasNext"
              class="lightbox-arrow lightbox-icon rounded-full p-3 transition-transform duration-200"
              :class="
                uiVisible && hasNext ? 'pointer-events-auto' : 'translate-x-[calc(100%+1rem)]'
              "
              :aria-label="t('media.next')"
              @click="page(1)"
            >
              <svg
                class="h-5 w-5"
                viewBox="0 0 20 20"
                fill="none"
                stroke="currentColor"
                stroke-width="1.8"
                aria-hidden="true"
              >
                <path d="M7.5 4l6 6-6 6" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </button>
          </div>

          <!-- In flow between the two bars, so it *is* the space left for the
               picture - `readBand()` asks it where it ended up. -->
          <div ref="band" class="flex-1" />

          <div
            ref="footer"
            class="lightbox-bar lightbox-bar-bottom relative flex items-center justify-between gap-3 px-3 py-2 transition-transform duration-200"
            :class="uiVisible ? 'pointer-events-auto' : 'translate-y-full'"
          >
            <!-- Offered only when the tags do not fit. The pill is small; its hit
                 area is not - wide and tall above, shallow below where the tags
                 begin. See docs/features/media-viewer.md. -->
            <button
              v-if="tagsOverflow"
              type="button"
              class="absolute -top-2 left-1/2 -translate-x-1/2 px-10 pb-2 pt-4"
              :aria-expanded="tagsExpanded"
              :aria-label="t('media.moreTags')"
              @pointerdown="onHandleDown"
              @pointerup="onHandleUp"
            >
              <span class="block h-1 w-10 rounded-full bg-[var(--lb-accent)] opacity-50" />
            </button>

            <div
              ref="tagList"
              class="flex min-w-0 flex-wrap gap-1.5 overflow-hidden transition-[max-height] duration-300"
              :class="[
                tagsExpanded ? 'max-h-[40vh] overflow-y-auto' : 'max-h-[3.4rem]',
                tagsOverflow ? 'mt-3.5' : '',
              ]"
            >
              <!-- A tag navigates to its search; the route watcher above is what
                 takes the viewer off the results it lands on. -->
              <TagChip
                v-for="tag in current.tags ?? []"
                :key="tag.slug"
                :tag="tag"
                class="lightbox-tag"
              />
            </div>

            <div class="relative flex shrink-0 items-center gap-1.5">
              <!-- Above the row rather than in a corner of the screen, so it is
                 plainly the answer to the button that was just pressed. -->
              <Transition
                enter-from-class="translate-y-1 opacity-0"
                enter-active-class="transition duration-150"
                leave-to-class="translate-y-1 opacity-0"
                leave-active-class="transition duration-150"
              >
                <span
                  v-if="shareFeedback"
                  role="status"
                  class="lightbox-bar absolute bottom-full right-0 mb-2 whitespace-nowrap rounded-md px-2.5 py-1 text-xs"
                >
                  {{ shareFeedback.text }}
                </span>
              </Transition>

              <button
                v-if="shareable"
                type="button"
                class="lightbox-icon rounded-full p-2.5"
                :title="t('common.share')"
                :aria-label="t('common.share')"
                @click="share"
              >
                <svg
                  class="h-4 w-4"
                  viewBox="0 0 20 20"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.6"
                  aria-hidden="true"
                >
                  <path d="M7.5 11.5 12.5 8.5M7.5 8.5l5 3" stroke-linecap="round" />
                  <circle cx="5.5" cy="10" r="2.2" />
                  <circle cx="14.5" cy="6.5" r="2.2" />
                  <circle cx="14.5" cy="13.5" r="2.2" />
                </svg>
              </button>

              <!-- Carries the file into the day with `?i=` but **not** `?o=`, and
                   is left out on that day's own page.
                   See docs/features/media-viewer.md. -->
              <RouterLink
                v-if="dayDate && !onOwnDay"
                :to="{
                  name: 'day',
                  params: { date: dayDate },
                  query: dayQuery,
                }"
                class="lightbox-icon rounded-full p-2.5"
                :title="t('media.openDay')"
                :aria-label="t('media.openDay')"
              >
                <svg
                  class="h-4 w-4"
                  viewBox="0 0 20 20"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.6"
                  aria-hidden="true"
                >
                  <rect x="3" y="4.5" width="14" height="12.5" rx="2" />
                  <path d="M3 8h14M7 3v3M13 3v3" stroke-linecap="round" />
                </svg>
              </RouterLink>

              <a
                v-if="download"
                :href="download"
                download
                target="_blank"
                rel="noopener noreferrer"
                class="lightbox-icon rounded-full p-2.5"
                :title="t('media.download')"
                :aria-label="t('media.download')"
              >
                <svg
                  class="h-4 w-4"
                  viewBox="0 0 20 20"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.6"
                  aria-hidden="true"
                >
                  <path
                    d="M10 3v9m0 0 3.5-3.5M10 12 6.5 8.5"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                  <path d="M4 15.5h12" stroke-linecap="round" />
                </svg>
              </a>
            </div>
          </div>
        </div>
      </div>
    </Transition>

  </Teleport>

  <!--
    The flight between the tile and the picture. Outside the viewer's own `v-if`
    on purpose: on the way out it has to outlive the room it is leaving.
  -->
  <HeroFlight ref="flight" />
</template>
