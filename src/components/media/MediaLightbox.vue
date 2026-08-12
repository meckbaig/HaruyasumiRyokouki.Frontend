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
import { isMobileLayout } from '@/services/display'
import { withMediaLink, pageIdentity } from '@/composables/useMediaLink'
import { copyMediaUrl } from '@/services/share'
import TagChip from './TagChip.vue'

const props = defineProps({
  items: { type: Array, default: () => [] },
  /** Index of the open file, or null when the lightbox is closed. */
  index: { type: Number, default: null },
})

const emit = defineEmits(['update:index', 'close'])

const { t } = useI18n()
const route = useRoute()

const dialog = ref(null)
let lastFocused = null

const open = computed(() => props.index !== null && props.index >= 0)
const current = computed(() => (open.value ? (props.items[props.index] ?? null) : null))
const video = computed(() => isVideo(current.value))
const label = computed(() => current.value?.title || current.value?.fileName || t('media.untitled'))

const hasPrev = computed(() => open.value && props.index > 0)
const hasNext = computed(() => open.value && props.index < props.items.length - 1)

/** Neighbours ride along in the filmstrip, shown as the previews the grid cached. */
const prevItem = computed(() => (hasPrev.value ? props.items[props.index - 1] : null))
const nextItem = computed(() => (hasNext.value ? props.items[props.index + 1] : null))

/*
  Full-size images this session has already had in hand.

  A neighbour riding in the filmstrip is drawn from its preview, because that is
  the one thing certain to be there. But a file already looked at is in the
  browser's cache at full size, and sliding its preview past showed it soft for
  the length of the turn before swapping at the end — which is exactly what a
  reader notices going back through an album.

  Kept as a list of what has been seen rather than asked of the browser each
  time. Asking means setting `src` on a probe, and for a file that is *not*
  cached that is a request — one per neighbour, on every turn, for pictures
  nobody has opened. Fine for the file being opened, which is about to be
  fetched anyway; not fine for the two either side of it.
*/
const inHand = new Set()

/** Whether this file's full-size image can be drawn with no request at all. */
function haveFullSize(item) {
  const full = fullScreenSrc(item)
  return Boolean(full) && inHand.has(full)
}

function stripSrc(item) {
  if (haveFullSize(item)) return fullScreenSrc(item)
  return previewSrc(item) || miniatureSrc(item)
}

/**
 * The preview is the very image the grid tile already downloaded — the API
 * returns one preview URL per file — so it is served from cache and fills the
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

/*
  Sharing the file rather than the page.

  A day and a search can both resolve `?i=`, so the link is built on the address
  the reader is at and lands them among the same neighbours. The front page
  cannot: its wall is reshuffled every visit, so a link into it would point at
  nothing — there the file's own day is what gets shared instead.
*/
const canResolveLink = computed(() => route.name === 'day' || route.name === 'search')
const shareable = computed(
  () => current.value?.id != null && (canResolveLink.value || Boolean(dayDate.value)),
)

const shareFeedback = ref(null)
let shareTimer = null

async function share() {
  const copied = await copyMediaUrl(current.value.id, {
    open: true,
    path: canResolveLink.value ? null : `/day/${dayDate.value}`,
  })
  shareFeedback.value = copied ? t('common.shareCopied') : t('common.shareFailed')
  clearTimeout(shareTimer)
  shareTimer = setTimeout(() => (shareFeedback.value = null), 2000)
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
    Not on a phone. The wait there is longer — a mobile connection fetching a
    full-size picture — and the difference the picture gains over the preview
    already standing in for it is smaller on a small screen. A spinner would
    mostly be something to watch, so the swap is left to happen quietly.
  */
  if (isMobileLayout()) return

  spinnerTimer = setTimeout(() => {
    if (!fullLoaded.value && !fullFailed.value) showSpinner.value = true
  }, SPINNER_DELAY)
}

/**
 * Aspect ratio of the open file.
 *
 * The file states it, so the fitting maths has it before a single byte of the
 * picture has arrived — which is what lets a file open at exactly its final size
 * instead of filling the cell and settling into place once a preview has
 * reported. Whatever does load afterwards refines it, and for a file that states
 * nothing that measurement is still the only source.
 *
 * Until it is known at all the media fills its cell and lets `object-contain`
 * letterbox it; once known, `.fit-media` shrinks the element to the picture
 * itself, which is what makes the empty space beside it clickable.
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
  // an image the browser is still turning into pixels — the banding `decode()`
  // exists to avoid.
  if (await revealWhenDecoded(image)) previewLoaded.value = true
}

/*
  Layers the browser already has.

  A stand-in earns its place only while there is nothing better to show. If the
  full-size file is already in cache the preview is never wanted; if the preview
  is, the miniature is never wanted — and "never wanted" has to mean never
  painted, not painted and then faded away. A layer that gets its turn and is
  then taken back is worse than one that never appeared: what the reader sees is
  a sharp picture going soft and clearing again.

  So each layer is asked about before the first render rather than after it, and
  a layer that was superseded before it was ever seen is also denied its fade —
  there is nothing to fade from.
*/

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

/** The preview was superseded before it was shown, so it swaps without a fade. */
const instantSwap = ref(false)
/** The same, for the miniature under it. */
const groundInstant = ref(false)

/**
 * Marks every layer a ready one stands on as done with.
 *
 * `instant` is the difference between a layer that was superseded before it was
 * ever painted and one that had its turn on screen. The first has nothing to
 * fade from and should simply not be there; the second is being taken away from
 * a reader who is looking at it, and taking it away in one frame is the snap
 * this whole arrangement exists to avoid. Only a decision made before the first
 * paint may claim the first case.
 */
function settleLayers({ full = false, preview = false, instant = false }) {
  if (full) {
    fullLoaded.value = true
    if (fullScreen.value) inHand.add(fullScreen.value)
    if (instant) instantSwap.value = true
    stopSpinner()
  }
  if (full || preview) {
    previewLoaded.value = true
    if (instant) groundInstant.value = true
  }
}

/** True until this file's first post-flush pass, which is its last chance. */
let beforeFirstPaint = true

/**
 * Second chance at the same question, once the elements exist.
 *
 * `isCached` answers for the memory cache; an image held only on disk reports
 * nothing until its element is in the document, and then reports `complete`
 * before any `load` event is dispatched. Running from the post-flush pass
 * catches those while there is still time to decide before the first frame.
 */
function revealIfCached() {
  const full = picture.value
  if (full?.complete && full.naturalWidth) {
    rememberAspect(full)
    settleLayers({ full: true, instant: beforeFirstPaint })
    return
  }

  const preview = previewImage.value
  if (preview?.complete && preview.naturalWidth) {
    rememberAspect(preview)
    settleLayers({ preview: true, instant: beforeFirstPaint })
  }
}

async function onFullLoaded(event) {
  const image = event.target
  rememberAspect(image)
  if (await revealWhenDecoded(image)) {
    fullLoaded.value = true
    // Remembered so this file slides past sharp the next time it is a neighbour.
    inHand.add(image.getAttribute('src'))
    stopSpinner()
  }
}

function onFullFailed() {
  fullFailed.value = true
  stopSpinner()
}

/*
  Gestures.

  All of them share one pointer surface because their meanings overlap: two
  fingers pinch, one finger pans a magnified picture, drags the filmstrip
  sideways, or pulls it down to dismiss. A tap on the picture hides the chrome, a
  tap beside it closes, and a double tap magnifies. Deciding between them needs
  the whole picture of what is pressed, so it is settled here rather than spread
  across handlers.
*/
const MAX_SCALE = 4
const TAP_ZOOM = 2.5
const TAP_WINDOW = 210
const TAP_SLOP = 40
const DRAG_SLOP = 8
const ANIM_MS = 220
/**
 * Share of the frame a sideways drag must cross before the page turns.
 *
 * Deliberately short. There is nothing else a sideways drag on a picture can
 * mean, and the two ways of getting it wrong are not equal: a turn the reader
 * did not want costs them one swipe back, while a turn that refuses to happen
 * makes them repeat the whole gesture harder.
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

const stripStyle = computed(() =>
  dragX.value || dragY.value
    ? { transform: `translate3d(${dragX.value}px, ${dragY.value}px, 0)` }
    : undefined,
)

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
 * Hands the picture back to its opening fit. The numbers here are provisional —
 * the proportions and the bars may not be known yet — and the sizing pass puts
 * the real ones in as soon as they are.
 */
function resetZoom() {
  scale.value = 1
  offsetX.value = 0
  offsetY.value = 0
  fitOffsetY.value = 0
  atInitialFit = true
}

/** Keeps the picture from being panned out of view entirely. */
/**
 * Holds the picture against the edges of the window.
 *
 * Measured from the picture as drawn, not from the window: a portrait file fills
 * the window's height and only a slice of its width, so bounds taken from the
 * window let it be dragged until half the screen is empty. What may be panned is
 * only ever the part that hangs past an edge — and an axis with nothing hanging
 * past it does not move at all, which returns it to where the picture rests.
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
 * The box of the picture as it is drawn at this moment.
 *
 * Which element that is changes while a file is arriving. `.fit-media` gives an
 * image a width and lets its height follow its proportions — so the full-size
 * element, before its bytes land, has no proportions to be sized by and its box
 * is flat. Measuring it then put every tap beside the picture. The preview
 * standing in for it is the layer actually on screen, so it is the one to ask
 * until the full-size picture takes over.
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
    // Pulled all the way back out — the picture is the viewer's to place again,
    // so a later toggle of the chrome settles it afresh.
    applyRestingFit()
  } else {
    clampOffset()
  }
}

let animationTimer = null

/**
 * Runs a change with a transition, then drops back to direct manipulation.
 *
 * With motion turned off there is no transition to wait out, and waiting anyway
 * is the whole animation's length of nothing happening. Turning a page was the
 * plainest case: the strip was moved a frame along and the file underneath it
 * swapped a fifth of a second later, so what the reader looked at in between was
 * the neighbour's preview — even where the picture itself was already in hand.
 *
 * So the settling happens at once instead. Every caller here writes the finished
 * state in `done` and merely sets up for it in `change`, which is what makes
 * running the two together the same thing arrived at sooner.
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

  animating.value = true
  pendingSettle = done ?? null
  change()
  clearTimeout(animationTimer)
  animationTimer = setTimeout(settleAnimation, duration)
}

/*
  Wheel zoom keeps the transition on for a moment after each notch. A wheel
  reports coarse, discrete steps, and applying them straight to the transform
  makes the picture jump from size to size; letting each step ease out — and
  letting the next one interrupt it — turns the same events into one continuous
  movement.
*/
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
  // The midpoint may travel as well, which pans at the same time — the motion a
  // maps app makes when the pinch and the hand move together.
  const centre = toFramePoint((a.x + b.x) / 2, (a.y + b.y) / 2)
  const ratio = next / pinch.scale
  offsetX.value = centre.x - (pinch.point.x - pinch.offsetX) * ratio
  offsetY.value = centre.y - (pinch.point.y - pinch.offsetY) * ratio
  scale.value = next
  clampOffset()
}

function onPointerDown(event) {
  if (video.value) return

  // A gesture that ended off the frame fires no click, so a flag set then would
  // linger and eat the next real tap.
  suppressClick = false
  frame.value?.setPointerCapture?.(event.pointerId)
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })

  if (pointers.size === 2) beginPinch()
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
    // Resist at the ends of the list, so the strip feels bounded.
    const blocked = (dx < 0 && !hasNext.value) || (dx > 0 && !hasPrev.value)
    dragX.value = blocked ? dx * 0.25 : dx
  } else {
    dragY.value = dy
  }
}

/** Decides whether a released sideways drag turns the page or springs back. */
function settleStrip(dx) {
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
  slideOneFrame(direction)
}

/**
 * Decides whether a released vertical drag dismisses or springs back.
 *
 * Either way up. Pushing a picture off the top and pushing it off the bottom say
 * the same thing, and a reader who has just swiped down to leave one file often
 * swipes back up out of the next — asking which way they threw it would be
 * asking about nothing.
 */
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
  const { moved, pointerType, axis, time } = drag
  const dx = event.clientX - drag.x
  const dy = event.clientY - drag.y
  drag = null

  if (moved) {
    suppressClick = true
    if (zoomed.value) return
    if (axis === 'y') settleDismiss(dy)
    else if (axis === 'x') settleStrip(dx)
    else if (
      pointerType !== 'mouse' &&
      Math.abs(dx) > 40 &&
      Math.abs(dx) > Math.abs(dy) * 1.5 &&
      Date.now() - time < 800
    ) {
      // A flick fast enough to outrun the follow threshold still turns the page.
      settleStrip(dx)
    }
    return
  }

  // A click on the picture hides the chrome; a click on the empty space beside
  // it closes the viewer, which is what that space did before it became one
  // continuous surface.
  //
  // Hit-tested against the image's box rather than read from `event.target`:
  // the frame captures the pointer so that a pan survives the cursor leaving it,
  // and capture retargets every later event to the frame itself — so the target
  // was never the picture, and every click read as a click on empty space.
  //
  // A finger is told nothing of the sort: it can only ever hide the chrome, and
  // where it lands does not matter. A phone gives the picture the whole screen
  // and leaves only slivers beside it, so a tap that misses is a tap that was
  // meant for the picture — closing on it dismissed the viewer by accident far
  // more often than on purpose. The close button and the downward pull are what
  // remain, and both are deliberate.
  if (pointerType === 'mouse') {
    if (isOnPicture(event.clientX, event.clientY)) toggleUi()
    else close()
    return
  }

  /*
    A tap hides the chrome; a pair of them magnifies instead.

    The toggle is held for as long as it takes to find out which of the two this
    was, and the whole question is how long that is. Acting at once and undoing
    it on the second tap needs no wait at all, but shows the chrome leaving and
    coming back inside a single double tap; letting the first tap's work stand
    means a double tap quietly toggles the bars as well. Waiting is the honest
    answer — the wait just has to be short enough not to be felt.
  */
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

function onFrameClickCapture(event) {
  if (!suppressClick) return
  event.stopPropagation()
  event.preventDefault()
  suppressClick = false
}

/*
  Growing out of the tile that was clicked, and shrinking back into it.

  A single element flies between the two: an image of the file, laid over
  everything, moved and resized from the tile's box to the picture's and back.
  It is the preview the tile is already showing, so it costs no request.

  The crop takes care of itself, which is the whole trick. A tile shows a square
  cut out of the file — `object-fit: cover` — and the box it flies to has the
  file's own proportions, where covering and containing are the same thing. So
  the same `cover` that crops it at the start shows all of it at the end, and
  the crop opens out along the way with nothing animating it.

  Nothing here is measured off the viewer's own layout: the box the picture will
  occupy is worked out from the numbers that place it, so this can run before the
  picture exists and after it has gone.
*/

/** What a grid tile wears; `rounded-md`, and gone by the time it lands. */
const TILE_RADIUS = '0.375rem'
const HERO_MS = 260

const heroEl = ref(null)
const hero = ref(null)
let heroAnimation = null
/** A tile box captured as the viewer opens, waiting for somewhere to fly to. */
let heroOrigin = null

/** The box a file occupies on the page underneath, if it is on screen at all. */
function tileBox(item, { offscreen = false } = {}) {
  if (item?.id == null) return null

  // Every match, not the first: the front page's wall is hung twice so that it
  // can drift endlessly, and the copy that comes first in the document is as
  // likely as not to be the one scrolled off the side.
  const tiles = document.querySelectorAll(`[data-media-id="${CSS.escape(String(item.id))}"]`)
  let hidden = null

  for (const tile of tiles) {
    const rect = tile.getBoundingClientRect()
    if (!rect.width || !rect.height) continue

    const box = { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
    const onScreen =
      rect.bottom > 0 &&
      rect.top < window.innerHeight &&
      rect.right > 0 &&
      rect.left < window.innerWidth

    if (onScreen) return box
    hidden ??= box
  }

  /*
    A tile the reader cannot see is an origin only in one direction. Arriving
    from beyond the edge is a swoop across the whole window out of nothing, and
    reads as a glitch; leaving towards it is the picture going back where it
    belongs, and the reader is meant to see it go that way even if what it is
    going to is scrolled away.
  */
  return offscreen ? hidden : null
}

/**
 * The box the open picture is drawn in, from the numbers that place it rather
 * than from the element — which has none until it has loaded.
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
 * The sharpest image of a file the browser can paint without asking for it.
 *
 * The flight ends at full size, so a stand-in flown all the way there arrives
 * visibly soft — and where the file itself is already in hand there is no reason
 * to fly the stand-in at all. Where it is not, the preview is still the only
 * thing that can set off at once, and it hands over below.
 */
function heroSource(item) {
  const full = fullScreenSrc(item)
  if (!full) return stripSrc(item)
  return haveFullSize(item) || isCached(full) ? full : stripSrc(item)
}

/*
  A file that finishes arriving mid-flight takes over from its stand-in.

  `fullLoaded` is only raised once the image has been decoded as well as
  fetched, so by the time this runs the browser can paint it in the frame it is
  asked to — which is what makes swapping the source safely invisible.
*/
watch(fullLoaded, (loaded) => {
  if (!loaded || !hero.value) return
  const full = fullScreenSrc(current.value)
  if (full) hero.value = { ...hero.value, src: full }
})

function flyHero({ src, from, to, fromRadius, toRadius }) {
  if (!src || !from || !to || motionReduced()) return

  heroAnimation?.cancel()
  hero.value = { src, ...from, radius: fromRadius }
  // Said on the document, where the viewer's own leaving subtree cannot be
  // reached any more. See the rule it drives in main.css.
  document.documentElement.setAttribute('data-lightbox-flying', '')

  nextTick(() => {
    const element = heroEl.value
    if (!element) return

    heroAnimation = element.animate(
      [
        { ...boxKeyframe(from), borderRadius: fromRadius },
        { ...boxKeyframe(to), borderRadius: toRadius },
      ],
      { duration: HERO_MS, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)', fill: 'forwards' },
    )
    heroAnimation.onfinish = () => {
      hero.value = null
      heroAnimation = null
      document.documentElement.removeAttribute('data-lightbox-flying')
    }
  })
}

function boxKeyframe(box) {
  return {
    left: `${box.left}px`,
    top: `${box.top}px`,
    width: `${box.width}px`,
    height: `${box.height}px`,
  }
}

/**
 * @param {{ fly?: boolean }} options `fly` is false when the reader has already
 *   thrown the picture somewhere themselves — see `settleDismiss`.
 */
function close({ fly = true } = {}) {
  // Captured before the file is let go of: `current` is about to be null, and
  // with it every proportion the picture's box is worked out from.
  if (fly) {
    flyHero({
      src: heroSource(current.value),
      from: pictureBox(),
      to: tileBox(current.value, { offscreen: true }),
      fromRadius: '0px',
      toRadius: TILE_RADIUS,
    })
  }

  emit('update:index', null)
  emit('close')
}

function step(delta) {
  const next = props.index + delta
  if (next < 0 || next >= props.items.length) return
  emit('update:index', next)
}

/**
 * Turning the page from an arrow or a key, by the movement a released swipe
 * already makes: the strip slides one whole frame, the neighbour riding there
 * lands dead centre, and the index changes underneath it — so the same picture
 * ends up in the same place whichever way it was asked for.
 *
 * This was tried once before and taken out again, because the neighbours were
 * then laid out by different rules from the open file and arrived at a size and
 * a height of their own. Sliding only made that plain. They are fitted the same
 * way now, and the movement reads as one strip rather than as two pictures.
 *
 * Two cases are taken plainly instead. A turn asked for while one is already
 * running: holding an arrow down would otherwise cut each animation short and
 * strand the strip, since the swap only happens once the animation ends. And a
 * turn asked for while the picture is magnified, which a swipe cannot even ask
 * for — there the finger is panning.
 */
let queuedTurn = 0
/**
 * True while a turn's slide is running.
 *
 * Not `animating`, which is on for anything that moves — a zoom, a spring back,
 * the picture following the bars as the chrome is toggled. A turn only has to
 * wait for another turn, and asking the general flag meant hiding the interface
 * swallowed the very next arrow press for a fifth of a second, whether or not
 * there was an animation to wait for at all.
 */
let turning = false

/** Slides the strip one frame along and swaps the file when it lands. */
function slideOneFrame(delta) {
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
      queuedTurn = 0
      // Next tick, so the strip is rendered back at rest — untransformed, and
      // without its transition — before the following slide starts from there.
      // Started in the same breath, the browser would never see the resting
      // position and the second slide would have nowhere to travel from.
      nextTick(() => page(waiting))
    },
  )
}

function page(delta) {
  const next = props.index + delta
  if (next < 0 || next >= props.items.length) return

  // A magnified picture cannot be slid sideways — that is what the finger is
  // doing there — so an arrow simply takes the reader to the next file.
  if (zoomed.value) {
    step(delta)
    return
  }

  if (turning) {
    /*
      Asked for while a turn is still running, it waits its own turn.

      Cutting the running one short is not an option: the strip only swaps the
      file underneath it once the slide has finished, and interrupting halfway
      shifts the contents by a frame while the transform still says otherwise —
      the picture jumps forward by a whole screen.

      Only one is remembered. A held-down arrow sends a stream of them, and a
      queue that took them all would carry on turning long after the key came up.
    */
    queuedTurn = Math.sign(delta)
    return
  }

  slideOneFrame(delta)
}

watch(current, () => {
  fullLoaded.value = false
  fullFailed.value = false
  previewLoaded.value = false
  instantSwap.value = false
  groundInstant.value = false
  // Asked before this file has been rendered even once, so a layer the browser
  // already holds is never given a frame it would have to be taken back out of.
  beforeFirstPaint = true
  settleLayers({
    full: isCached(fullScreen.value),
    preview: isCached(preview.value),
    instant: true,
  })
  aspect.value = mediaAspect(current.value)
  tagsExpanded.value = false
  descriptionExpanded.value = false
  resetZoom()
  armSpinner()
})

/**
 * Sizing runs after the DOM has been updated and before the paint that follows,
 * and writes its result straight onto the element. Reading it a tick later, or
 * handing it to a reactive value to apply on the next render, is what used to
 * let a frame out at the wrong size.
 */
watch(
  // `aspect` is in here because the fit cannot be worked out without it, and it
  // usually arrives after the first pass — with the preview, a moment later.
  [open, current, uiVisible, aspect],
  () => {
    if (!open.value) return
    // Before the sizing, so a cached picture is already the one being sized.
    revealIfCached()
    measureChrome()

    if (heroOrigin) {
      const from = heroOrigin
      heroOrigin = null
      flyHero({
        src: heroSource(current.value),
        from,
        to: pictureBox(),
        fromRadius: TILE_RADIUS,
        toRadius: '0px',
      })
    }

    beforeFirstPaint = false
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

/*
  Chrome measurements.

  The bars float over the picture, so the picture has to be told how much room
  they take. Both grow with their contents — a long description, several rows of
  tags, either one expanded by the reader — so the heights are measured rather
  than assumed, and fed back as the padding of the filmstrip cells.

  The same observer answers the other question the bars have about themselves:
  whether their contents overflow, which is what decides if the expander is
  offered at all.
*/
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

/** True while the system asks for less motion and the reader has not opted back in. */
function motionReduced() {
  if (document.documentElement.dataset.motion === 'always') return false
  return Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
}

/** Proportions of the file, read off the preview the grid already downloaded. */
function previewAspect() {
  const image = previewImage.value
  if (!image?.complete || !image.naturalWidth || !image.naturalHeight) return null
  return image.naturalWidth / image.naturalHeight
}

/**
 * The proportions the fitting maths works from.
 *
 * The API states them, so they are known before anything has been fetched; the
 * preview is only a fallback for a file that carries none. Everything that has
 * to decide where the picture goes asks here, and asking anywhere else is what
 * used to make the answer depend on whether an image happened to have finished
 * loading at that instant.
 */
function knownAspect() {
  return aspect.value ?? previewAspect()
}

/**
 * Decides the overflow now rather than at the next render.
 *
 * The expander's margin is part of the footer's height, so a measurement taken
 * before the overflow is known is a measurement of a bar that has not finished
 * deciding how tall it is. Setting the class by hand as well as through the
 * binding closes that gap: the binding still lands on the next render, and
 * agrees with what was just written.
 */
function settleTagOverflow() {
  const tags = tagList.value
  if (!tags) return
  const overflows = tagsExpanded.value || tags.scrollHeight > tags.clientHeight + 1
  tagsOverflow.value = overflows
  tags.classList.toggle('mt-3.5', overflows)
}

/**
 * Where the picture actually goes, asked of the layout rather than worked out
 * from the bars.
 *
 * A quick check comes first: with bars of the usual height, does the file run
 * out of height or out of width? If it runs out of width the bars never touch it
 * and their exact size does not matter. Only when it is the height that binds is
 * the band read from the element that sits in flow between the two bars — the
 * browser has already solved that as part of laying them out.
 *
 * Returns null whenever the recipe cannot be followed, which hands the caller
 * back to the older, approximate route.
 */
/**
 * Where the bars leave off, as the layout last had them.
 *
 * Held in state rather than read on demand, because the fit is now asked for
 * per file — the open one and both of its neighbours — and all three want the
 * same reading of the same bars. Keeping it here also makes every fit that
 * follows from it recompute when the bars change, which a `getBoundingClientRect`
 * buried in a function never would.
 */
const bandTop = ref(0)
const bandBottom = ref(0)

function readBand() {
  const rect = band.value?.getBoundingClientRect()
  if (!rect || rect.height <= 0) return
  bandTop.value = Math.round(rect.top)
  bandBottom.value = Math.round(window.innerHeight - rect.bottom)
}

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
 * they leave. Pure — nothing but the ratio and the bars decides it — which is
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

/*
  Where the picture rests, and how far back it can be pulled.

  The cell is the whole window, so the browser lays the picture out as large as
  the window allows — scale 1 means exactly that. `uiFitScale` is how much
  smaller it has to be to clear the bars, and `bandOffsetY` how far to shift it
  to sit in the middle of the band rather than the middle of the window. Both
  come from where the bars sit in the layout, which does not change when they
  slide out of sight.

  The resting fit then follows the chrome: with the bars up it is the fit under
  them, with the bars away it is the window. That resting fit is both where a
  file opens and the far end of the zoom.

  A reader who has zoomed is left alone — their picture keeps its size through a
  toggle, and only the limit beneath them moves. Pulling all the way back out
  hands them to the resting fit again.
*/
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
 * The same placement, for a neighbour riding in the filmstrip.
 *
 * It is the open file's own sum with a different ratio put into it, and the
 * ratio has to be its own: whether the bars reach a picture is decided by its
 * shape. A landscape file runs out of width before it runs out of height and
 * never meets them; the portrait one beside it always does, and borrowing the
 * open file's scale would leave one of the two in the wrong place.
 *
 * With the chrome away there is nothing to clear, and the neighbour fills the
 * window exactly as the open file does.
 */
function neighbourFit(item) {
  if (!uiVisible.value) return undefined
  const { scale, offsetY } = restingFitFor(mediaAspect(item))
  if (scale === 1 && offsetY === 0) return undefined
  return { transform: `translate(0px, ${offsetY}px) scale(${scale})` }
}

/**
 * And sized by the same rule too — `.fit-media` against the cell, not merely
 * capped at it.
 *
 * `max-width`/`max-height` only ever shrink. The preview is sized by the server
 * for this display, so on a window larger than it the neighbour was drawn at
 * whatever size had been sent and arrived smaller than the picture it replaced;
 * on a small window the cap bound and the two happened to agree. `.fit-media`
 * enlarges as well, which is what the open file has always been doing.
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

/*
  Bars easing from one height to another.

  Turning the page can change how much they have to say — a longer description,
  another row of tags — and the layout answers that in a single frame. What the
  reader saw was the picture flinching as the bar it sits under changed size
  under a file that had only just arrived.

  The animation is run on the elements themselves rather than through CSS: a bar
  has no height of its own to transition between, only whatever its contents come
  to, and a keyframe can be handed the two numbers where a stylesheet cannot.
  Both the height a bar is leaving and the one it is arriving at are measured
  here, and nothing else in the file has to know it is happening.

  The picture needs no animation of its own. Its placement is read from the bars,
  and the observer watching them reports every step of the way — so it follows
  frame by frame rather than being sent to where they are going to end up.
*/
const barHeights = new WeakMap()
const barAnimations = new WeakMap()

/**
 * True while heights are only being written down, not acted on.
 *
 * A tag list opening or closing eases its own height, in CSS, over its own
 * three hundred milliseconds. Easing the bar around it as well set a second
 * animation running over the first — from the height the bar had before all
 * this, back down to where the list was already taking it — which is the little
 * bounce at the end of a collapse. The reading is still wanted, so the next real
 * change is measured from where things actually ended up; only the movement is
 * not.
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

  const tags = tagList.value
  tagsOverflow.value =
    Boolean(tags) && (tagsExpanded.value || tags.scrollHeight > tags.clientHeight + 1)

  const text = description.value
  descriptionOverflow.value =
    Boolean(text) && (descriptionExpanded.value || text.scrollHeight > text.clientHeight + 1)
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

function onKeydown(event) {
  if (!open.value) return

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
  queuedTurn = 0
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

/*
  A link inside the viewer takes the page with it, and the viewer steps aside
  rather than being carried over.

  Closing on the click itself is what it used to do, and that was the bug: the
  page underneath answers a close by rewriting its address, and replacing an
  address while a navigation is in flight cancels it. From a day it went
  unnoticed, because the only day a file's own link leads to is the one already
  open; from a search it meant the link did nothing at all.

  Waiting for the route to actually change instead covers every link in here at
  once — the day and every tag — and it cannot race a navigation it is watching
  for. Links that lead exactly where the reader already is are the one case it
  does not answer, and there is nothing to answer there.

  What it watches is the page, not the address: the page underneath writes the
  open file into the address as `?i=`, so watching the address in full meant
  every file opened and shut in the same breath.
*/
watch(
  () => pageIdentity(route),
  () => {
    if (open.value) close()
  },
)

/*
  The page behind the viewer is held still while it is up, and let go of a moment
  after it comes down.

  A moment, and not at once, because a dismissal ends on `pointerup` — and the
  `touchend` that completes the sequence has not been dispatched yet. Unlocking
  there hands the browser a page that became scrollable in the middle of a
  gesture it is still reading, and a quick flick is handed to it as a fling. At
  the top of the page that fling has nowhere to go and moves nothing, which is
  why no scrolling was ever visible — but the next tap is spent stopping it
  instead of pressing what it landed on, and no click is made at all.

  It also explains the shape of the fault exactly: a slow drag ends with no
  speed to fling, and answered the next tap perfectly.
*/
const UNLOCK_DELAY = 120
let unlockTimer = null

function lockScroll() {
  clearTimeout(unlockTimer)
  unlockTimer = null
  document.body.style.overflow = 'hidden'
}

function unlockScroll({ now = false } = {}) {
  clearTimeout(unlockTimer)
  unlockTimer = null

  if (now) {
    document.body.style.overflow = ''
    return
  }

  unlockTimer = setTimeout(() => {
    unlockTimer = null
    document.body.style.overflow = ''
  }, UNLOCK_DELAY)
}

watch(open, async (isOpen) => {
  if (isOpen) {
    // Read now, with the page underneath still laid out as the reader left it.
    heroOrigin = tileBox(current.value)
    chromeReady.value = false
    lastFocused = document.activeElement
    document.addEventListener('keydown', onKeydown)
    // Locking the body keeps the page behind from scrolling under the overlay.
    lockScroll()
    await nextTick()
    dialog.value?.focus()
    observeChrome()
  } else {
    chromeObserver?.disconnect()
    chromeObserver = null
    clearTimeout(chromeSettleTimer)
    chromeSettling = false
    document.removeEventListener('keydown', onKeydown)
    unlockScroll()
    stopSpinner()
    resetGestures()
    /*
      Return focus to the tile that opened the viewer.

      Never scrolling to it. Focusing an element brings it into view, and the
      page here scrolls smoothly — so a close could set a scroll running that
      outlasted it. That cost twice over: a picture flying to a fixed point
      sailed past its tile as the page moved under it, and, worse, a browser
      throws away the click of any touch that began or ended while the page was
      moving. Which is a tap that does nothing, for no reason the reader can see.

      Nothing is lost by staying put: the reader closed the viewer, and being
      pulled somewhere else is not what they asked for.
    */
    lastFocused?.focus?.({ preventScroll: true })
    lastFocused = null
  }
})

onBeforeUnmount(() => {
  heroAnimation?.cancel()
  document.documentElement.removeAttribute('data-lightbox-flying')
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
      chrome — see `.lightbox` in main.css for the palette. It sits above
      Leaflet's panes (z-index ~1000), which otherwise poke through on the day
      page.
    -->
    <Transition name="lightbox">
      <div
        v-if="open && current"
        ref="dialog"
        class="lightbox fixed inset-0 z-[2000] overflow-hidden"
        :class="chromeReady ? 'lightbox-measured' : ''"
        :style="{
          opacity: chromeReady ? dismissOpacity : 0,
        }"
        role="dialog"
        aria-modal="true"
        :aria-label="label"
        tabindex="-1"
      >
        <!--
          Every file lives in the filmstrip, video included. It used to sit in a
          branch of its own, and the cost was plain the moment a reader stepped
          off one: with no strip on screen there was nothing to slide, so a turn
          away from a video simply swapped, while a turn towards it slid. The
          gestures are what actually differ, and they are turned off per file
          rather than by leaving the strip behind.
        -->
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
          <!--
          A filmstrip: the neighbouring files sit one frame away on either side,
          so dragging sideways reveals the next picture as the current one leaves
          rather than swapping them once the gesture ends. They are drawn from the
          previews the grid already cached, so they cost nothing to keep there.
        -->
          <div
            class="lightbox-strip absolute inset-0"
            :class="[animating ? 'transition-transform duration-200' : '', hero ? 'opacity-0' : '']"
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
              <!--
                Clipped into the band between the bars by the same transform that
                places a picture there, so the controls along a video's bottom
                edge stay above the footer instead of behind it. There is nothing
                to zoom, so the transform never moves off its resting value.

                `aspect-ratio` written out, unlike a picture: a video has no
                proportions of its own until its metadata arrives, so
                `height: auto` would be settled from the 300×150 every video
                element starts life at. The file states its shape, so the element
                is given it outright.
              -->
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
                  class="max-h-full max-w-full object-contain"
                  :class="fitClass"
                  :style="fitBoxStyle"
                  @loadedmetadata="onVideoMeta"
                />
              </div>

              <!--
              Three layers, sharpest at the bottom. Each is transparent until
              it is whole and steps aside once something sharper is, so exactly
              one of them is ever solid — the same arrangement a grid tile uses,
              with the preview added in the middle.

              Transparent *until it is whole* is the half of it that matters:
              a picture still arriving is painted as far as it has got and left
              blank below, and one left visible while it downloaded showed as a
              half-drawn photograph on white.

              Each fades out and none fades in. A layer fading in over one fading
              out leaves a moment where neither is solid and the dark shows
              between them; fading only the upper one away means the one beneath
              is already whole and waiting.

              The ground is the miniature. It ships inline with the file, so it
              is there before a single request has been made — which matters most
              on the one path where nothing is cached: a shared link, opened
              cold, where even the preview arrives over emptiness. Blurred,
              because it is a handful of pixels, and scaled past the blur inside
              a box that clips it, or its softened edges would fray against the
              dark.

              `draggable="false"` matters: without it a mouse press starts the
              browser's own image drag and the pan never receives its moves.
            -->
              <div
                v-else
                class="relative flex h-full w-full items-center justify-center"
                :class="animating ? 'transition-transform duration-200' : ''"
                :style="zoomStyle"
              >
                <img
                  :key="current.id ?? current.fileName"
                  :src="fullScreen"
                  :alt="label"
                  ref="picture"
                  draggable="false"
                  class="object-contain"
                  :class="[fitClass, fullLoaded ? 'opacity-100' : 'opacity-0']"
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
                  class="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 object-contain"
                  :class="[
                    fitClass,
                    previewLoaded && !fullLoaded ? 'opacity-100' : 'opacity-0',
                    fullLoaded && !instantSwap ? 'transition-opacity duration-300' : '',
                  ]"
                  :style="aspectStyle"
                  @load="onPreviewLoaded"
                />

                <div
                  v-if="miniature"
                  class="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 overflow-hidden"
                  :class="[
                    fitClass,
                    previewLoaded || fullLoaded ? 'opacity-0' : 'opacity-100',
                    groundInstant ? '' : 'transition-opacity duration-300',
                  ]"
                  :style="fitBoxStyle"
                  aria-hidden="true"
                >
                  <img
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
          <Transition
            enter-from-class="opacity-0"
            enter-active-class="transition-opacity duration-200"
            leave-to-class="opacity-0"
            leave-active-class="transition-opacity duration-150"
          >
            <span
              v-if="showSpinner"
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
        Chrome floating over the picture.

        The bars slide out of view rather than fading. A backdrop filter and an
        opacity transition on the same element do not co-operate: the browser
        holds the blurred backdrop until the opacity settles, so the bar arrived
        first and the blur snapped in behind it a moment later. Moving the bar
        instead leaves it fully opaque throughout, blur and all.

        The wrapper ignores pointer events so the space between the bars still
        belongs to the gesture surface; each bar takes them back for itself.
      -->
        <div class="pointer-events-none absolute inset-0 flex flex-col overflow-hidden">
          <div
            ref="header"
            class="lightbox-bar flex items-start justify-between gap-4 overflow-hidden px-3 py-2 transition-transform duration-200"
            :class="uiVisible ? 'pointer-events-auto' : '-translate-y-full'"
          >
            <div class="min-w-0 pt-1">
              <p class="truncate text-sm font-medium">{{ label }}</p>
              <!--
              Tapping a clipped description opens it, and again puts it back.

              Two limits at once, and each earns its place: the line clamp is
              what ends a cut-off line in an ellipsis, and the max-height is what
              can be animated — a clamp cannot. They agree on two lines, so the
              clamp decides how the text looks and the height decides how it
              moves. The height is also what the overflow check reads, which is
              what offers the description as something to tap.
            -->
              <p
                v-if="current.description"
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
                {{ current.description }}
              </p>
            </div>

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

          <!--
          Positioned against the window rather than laid out between the bars:
          the arrows belong to the screen, and letting the bars decide their
          height moved them whenever a description or a row of tags did.

          Each leaves towards its own edge, the way the bars leave towards
          theirs — and, like them, sliding rather than fading is what keeps the
          blur behind them alive through the animation.
        -->
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

          <!--
          Pushes the footer to the bottom now that the arrows float free — and,
          because it is in flow between the two bars, it *is* the space left for
          the picture. Asking it where it ended up is how that space is learnt:
          the browser works it out as part of laying the bars out, so the answer
          needs no arithmetic on their heights and no second pass to correct.
        -->
          <div ref="band" class="flex-1" />

          <div
            ref="footer"
            class="lightbox-bar relative flex items-center justify-between gap-3 px-3 py-2 transition-transform duration-200"
            :class="uiVisible ? 'pointer-events-auto' : 'translate-y-full'"
          >
            <!--
            Offered only when the tags do not fit. Answers a press or a pull:
            up opens the list, down folds it back to two rows.

            The pill is small but what answers a finger is not: the padding
            reaches well out to either side and up over the picture, where there
            is nothing to hit by mistake. It stays shallow below, because that is
            where the tags themselves begin.
          -->
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
                :key="tag"
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
                  {{ shareFeedback }}
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

              <!--
              Carries the file into the day so it arrives outlined among the
              rest — a picture met on the front page keeps its identity once it
              is back among its neighbours. Without `o`: it was just being looked
              at full screen, and opening it again there would be no arrival.

              Left out on that day's own page: the button would lead where the
              reader already is.
            -->
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

    <!--
      The flight between the tile and the picture. Outside the viewer's own
      `v-if` on purpose: on the way out it has to outlive the room it is leaving,
      and it is drawn above it either way.
    -->
    <img
      v-if="hero"
      ref="heroEl"
      :src="hero.src"
      alt=""
      aria-hidden="true"
      draggable="false"
      class="pointer-events-none fixed z-[2050] object-cover"
      :style="{
        left: `${hero.left}px`,
        top: `${hero.top}px`,
        width: `${hero.width}px`,
        height: `${hero.height}px`,
        borderRadius: hero.radius,
      }"
    />
  </Teleport>
</template>
