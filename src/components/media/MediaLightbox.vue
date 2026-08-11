<script setup>
import { computed, ref, watch, nextTick, onBeforeUnmount } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import {
  downloadSrc,
  fullScreenSrc,
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

function stripSrc(item) {
  return previewSrc(item) || miniatureSrc(item)
}

/**
 * The preview is the very image the grid tile already downloaded — the API
 * returns one preview URL per file — so it is served from cache and fills the
 * frame at once while the full-screen version arrives over it. Both share the
 * file's aspect ratio, so nothing shifts on the swap.
 */
const preview = computed(() => previewSrc(current.value))
const fullScreen = computed(() => fullScreenSrc(current.value))
const stream = computed(() => streamSrc(current.value))
const download = computed(() => downloadSrc(current.value))
const dayDate = computed(() => mediaDate(current.value))
const dayQuery = computed(() =>
  current.value?.id == null ? {} : withMediaLink({}, current.value.id),
)

/** The day button is an offer to go somewhere; on that day there is nowhere to go. */
const onOwnDay = computed(
  () => route.name === 'day' && String(route.params.date) === dayDate.value,
)

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
  if (!fullScreen.value) return

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
 * Aspect ratio of the open file, taken from whichever layer reports it first.
 * Until it is known the media fills its cell and lets `object-contain` letterbox
 * it; once known, `.fit-media` shrinks the element to the picture itself, which
 * is what makes the empty space beside it clickable. Both paint identically, so
 * nothing moves when the switch happens.
 */
const aspect = ref(null)
const aspectStyle = computed(() => (aspect.value ? { '--ar': aspect.value } : undefined))
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

function onPreviewLoaded(event) {
  rememberAspect(event.target)
}

/**
 * True when the full-size picture was ready before it was ever shown — which is
 * to say it came from cache. Nothing is gained by cross-fading then: the preview
 * never had its turn on screen, and fading it away only holds back a picture
 * that is already there. A file fetched over the network still gets the fade,
 * because there the preview really was standing in for something.
 */
const instantSwap = ref(false)

/**
 * Shows a full-size picture the browser already had, at once and without a fade.
 *
 * A cached image reports `complete` as soon as its element exists, before any
 * `load` event is dispatched — so this runs from the post-flush pass, while
 * there is still time to decide before the first frame.
 */
function revealIfCached() {
  const image = picture.value
  if (!image?.complete || !image.naturalWidth) return

  rememberAspect(image)
  instantSwap.value = true
  fullLoaded.value = true
  stopSpinner()
}

async function onFullLoaded(event) {
  const image = event.target
  rememberAspect(image)
  if (await revealWhenDecoded(image)) {
    fullLoaded.value = true
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
const TAP_WINDOW = 300
const TAP_SLOP = 40
const DRAG_SLOP = 8
const ANIM_MS = 220
/** Share of the frame a sideways drag must cross before the page turns. */
const SWIPE_COMMIT = 0.22
/** Downward travel that dismisses the viewer. */
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

/** Dragging down dims the surroundings, so the dismissal reads as deliberate. */
const dismissOpacity = computed(() =>
  dragY.value > 0 ? Math.max(0.35, 1 - dragY.value / (DISMISS_DISTANCE * 3)) : 1,
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
  const ratio = aspect.value ?? previewAspect()

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
  return { x: clientX - rect.left - rect.width / 2, y: clientY - rect.top - rect.height / 2 }
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

/** Runs a change with a transition, then drops back to direct manipulation. */
function withAnimation(change, done, duration = ANIM_MS) {
  animating.value = true
  change()
  clearTimeout(animationTimer)
  animationTimer = setTimeout(() => {
    animating.value = false
    done?.()
  }, duration)
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

  // Slide the strip by one full frame; the neighbour riding there lands dead
  // centre. Swapping the index afterwards and zeroing the offset leaves the
  // picture exactly where the animation left it, so the turn looks continuous.
  withAnimation(
    () => (dragX.value = -direction * width),
    () => {
      step(direction)
      dragX.value = 0
    },
  )
}

/** Decides whether a released downward drag dismisses or springs back. */
function settleDismiss(dy, point) {
  if (dy > DISMISS_DISTANCE) {
    close({ ghostAt: point })
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
    if (axis === 'y') settleDismiss(dy, { x: event.clientX, y: event.clientY })
    else if (axis === 'x') settleStrip(dx)
    else if (
      pointerType !== 'mouse' &&
      Math.abs(dx) > 60 &&
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

  const now = Date.now()
  if (now - lastTapAt < TAP_WINDOW && Math.abs(event.clientX - lastTapX) < TAP_SLOP) {
    // The second tap of a pair magnifies; cancel the chrome toggle the first one
    // queued, or the picture would zoom and the bars would vanish at once.
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

/**
 * Stops the click a touch gesture leaves behind.
 *
 * A browser synthesises a click a moment after a touch ends, aimed at whatever
 * is under the finger. Dismissing with a downward swipe removes the viewer
 * before it arrives, so it lands on the grid beneath and re-opens the file that
 * was just dismissed.
 *
 * Cancelling the touch sequence is the precise cure — a prevented `touchend`
 * produces no compatibility click at all. The click guard behind it is only a
 * backstop for browsers that synthesise one anyway, and it is deliberately
 * narrow: it ignores anything more than a finger's width from where the gesture
 * ended, so a deliberate tap somewhere else is never swallowed.
 */
function preventGhostClick(x, y) {
  const stopTouch = (event) => {
    if (event.cancelable) event.preventDefault()
  }
  const stopClick = (event) => {
    if (Math.hypot(event.clientX - x, event.clientY - y) > 40) return
    event.stopPropagation()
    event.preventDefault()
  }

  document.addEventListener('touchend', stopTouch, { capture: true, passive: false })
  document.addEventListener('click', stopClick, { capture: true })
  setTimeout(() => {
    document.removeEventListener('touchend', stopTouch, { capture: true })
    document.removeEventListener('click', stopClick, { capture: true })
  }, 350)
}

function close({ ghostAt = null } = {}) {
  if (ghostAt) preventGhostClick(ghostAt.x, ghostAt.y)
  emit('update:index', null)
  emit('close')
}

function step(delta) {
  const next = props.index + delta
  if (next < 0 || next >= props.items.length) return
  emit('update:index', next)
}

watch(current, () => {
  fullLoaded.value = false
  fullFailed.value = false
  instantSwap.value = false
  aspect.value = null
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
  if (!open.value || !atInitialFit) return
  animating.value = true
  clearTimeout(restTimer)
  restTimer = setTimeout(() => (animating.value = false), ANIM_MS)
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
function exactBand() {
  // if (!motionReduced()) return null

  const ratio = previewAspect()  
  if (!ratio) return null

  const rect = band.value?.getBoundingClientRect()
  if (!rect || rect.height <= 0) return null

  const barsDifference = Math.abs(Math.round(rect.top) - Math.round(window.innerHeight - rect.bottom))
  const available = window.innerHeight - (Math.round(rect.top) + Math.round(window.innerHeight - rect.bottom)) - barsDifference
  if (available <= 0) return null
  if (ratio >= window.innerWidth / available) return null

  settleTagOverflow()

  return {
    top: Math.round(rect.top),
    bottom: Math.round(window.innerHeight - rect.bottom),
  }
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
  const exact = exactBand()
  const top = exact?.top ?? 0
  const bottom = exact?.bottom ?? 0

  const height = window.innerHeight
  const width = window.innerWidth
  const band = height - top - bottom
  // The preview knows its proportions before `aspect` has been told them, and
  // at the moment this first runs that is usually the only place to ask.
  const ratio = aspect.value ?? previewAspect()

  if (!ratio || band <= 0) {
    uiFitScale.value = 1
    bandOffsetY.value = 0
    return
  }

  // Widths of the picture fitted to the window and fitted to the band; their
  // ratio is what the bars cost.
  const toWindow = Math.min(width, height * ratio)
  const toBand = Math.min(width, band * ratio)

  uiFitScale.value = toWindow > 0 ? toBand / toWindow : 1
  bandOffsetY.value = (top - bottom) / 2
}

/** Settles the picture at rest for the chrome as it currently stands. */
function applyRestingFit() {
  scale.value = restingScale.value
  fitOffsetY.value = restingOffsetY.value
  offsetX.value = 0
  offsetY.value = fitOffsetY.value
  atInitialFit = true
}

function measureChrome() {
  const root = dialog.value

  // Frozen while a bar is open, and for as long as one is animating shut: the
  // expansion is meant to cover the picture, and following the bar back down
  // would drag the picture along with the collapse.
  if (root && !tagsExpanded.value && !descriptionExpanded.value && !chromeSettling) {
    measureBand()
    // Only until the reader takes over. After that the numbers above are just
    // the limit their zoom is held to.
    if (atInitialFit) applyRestingFit()
    else clampOffset()

    chromeReady.value = true
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

function settleChrome() {
  chromeSettling = true
  clearTimeout(chromeSettleTimer)
  chromeSettleTimer = setTimeout(() => {
    chromeSettling = false
    measureChrome()
  }, 260)
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
      step(-1)
      break
    case 'ArrowRight':
      event.preventDefault()
      step(1)
      break
    case 'Tab':
      trapFocus(event)
      break
  }
}

function resetGestures() {
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

watch(open, async (isOpen) => {
  if (isOpen) {
    chromeReady.value = false
    lastFocused = document.activeElement
    document.addEventListener('keydown', onKeydown)
    // Locking the body keeps the page behind from scrolling under the overlay.
    document.body.style.overflow = 'hidden'
    await nextTick()
    dialog.value?.focus()
    observeChrome()
  } else {
    chromeObserver?.disconnect()
    chromeObserver = null
    clearTimeout(chromeSettleTimer)
    chromeSettling = false
    document.removeEventListener('keydown', onKeydown)
    document.body.style.overflow = ''
    stopSpinner()
    resetGestures()
    // Return focus to the tile that opened the lightbox.
    lastFocused?.focus?.()
    lastFocused = null
  }
})


onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown)
  document.body.style.overflow = ''
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
    <div
      v-if="open && current"
      ref="dialog"
      class="lightbox fixed inset-0 z-[2000] overflow-hidden"
      :style="{
        opacity: chromeReady ? dismissOpacity : 0
      }"
      role="dialog"
      aria-modal="true"
      :aria-label="label"
      tabindex="-1"
    >
      <div
        v-if="video"
        class="lightbox-cell absolute inset-0 flex items-center justify-center"
      >
        <!--
          `max-h-full max-w-full` on top of the fitting rules: a video reports no
          dimensions until its metadata arrives, and until then the fitting maths
          has only a guessed aspect ratio to work with — which is how a clip
          ended up taller than its cell and slid under the bars. The caps are the
          content box of the cell, so they hold whatever the guess turns out to be.
        -->
        <video
          :key="current.id ?? current.fileName"
          :src="stream"
          :poster="preview"
          controls
          playsinline
          preload="metadata"
          class="max-h-full max-w-full object-contain"
          :class="fitClass"
          :style="aspectStyle"
          @loadedmetadata="onVideoMeta"
        />
      </div>

      <div
        v-else
        ref="frame"
        class="absolute inset-0 touch-none overflow-hidden"
        :class="zoomed ? 'cursor-grab' : ''"
        @wheel.prevent="onWheel"
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
          class="absolute inset-0"
          :class="animating ? 'transition-transform duration-200' : ''"
          :style="stripStyle"
        >
          <div
            v-if="prevItem"
            class="lightbox-cell absolute inset-0 flex -translate-x-full items-center justify-center"
          >
            <img
              :src="stripSrc(prevItem)"
              alt=""
              aria-hidden="true"
              draggable="false"
              class="max-h-full max-w-full object-contain"
            />
          </div>

          <div class="lightbox-cell absolute inset-0 flex items-center justify-center">
            <!--
              Two stages. The full-size image is always fully opaque underneath;
              the preview the grid already fetched covers it and fades out once
              the full-screen image has arrived. Fading the top layer out — rather than
              fading the bottom one in — means there is never a frame where
              neither is opaque, which is what made the picture flash on the swap.

              `draggable="false"` matters: without it a mouse press starts the
              browser's own image drag and the pan never receives its moves.
            -->
            <div
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
                :class="fitClass"
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
                  fullLoaded ? 'opacity-0' : 'opacity-100',
                  instantSwap ? '' : 'transition-opacity duration-300',
                ]"
                :style="aspectStyle"
                @load="onPreviewLoaded"
              />
            </div>
          </div>

          <div
            v-if="nextItem"
            class="lightbox-cell absolute inset-0 flex translate-x-full items-center justify-center"
          >
            <img
              :src="stripSrc(nextItem)"
              alt=""
              aria-hidden="true"
              draggable="false"
              class="max-h-full max-w-full object-contain"
            />
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
          class="lightbox-bar flex items-start justify-between gap-4 px-3 py-2 transition-transform duration-200"
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
            @click="step(-1)"
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
            @click="step(1)"
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
              :to="{ name: 'day', params: { date: dayDate }, query: dayQuery }"
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
  </Teleport>
</template>
