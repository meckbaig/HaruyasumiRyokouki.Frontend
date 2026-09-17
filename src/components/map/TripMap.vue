<script setup>
import {
  ref,
  shallowRef,
  computed,
  watch,
  nextTick,
  onMounted,
  onBeforeUnmount,
  markRaw,
} from 'vue'
import { useI18n } from 'vue-i18n'
import L from 'leaflet'
import {
  createBaseMap,
  photoPinIcon,
  photoClusterIcon,
  advancePile,
  setPileFace,
  clearPhotoPinIcons,
  animatedProjection,
  PILE_CYCLE_MS,
  PILE_TURN,
  ROUTE_PANE,
  ROUTE_PANE_Z,
  ROUTE_DOT_PANE,
  ROUTE_DOT_PANE_Z,
  ROUTE_STYLE,
  FALLBACK_CENTER,
  FALLBACK_ZOOM,
  MAX_ZOOM,
  PHOTO_PIN_SIZE,
} from '@/services/leaflet'
import { createRouteCanvas } from '@/services/routeArrows'
import { markerBudget, dotBudget } from '@/services/deviceBudget'
import {
  CLUSTER_CELL,
  CLUSTER_CELL_MAX,
  DOT_CELL,
  DOT_CELL_MAX,
  DOT_STEP,
  clusterByCell,
  clusterWithinBudget,
} from '@/services/mapClusters'
import { playCardMorph } from '@/services/cardMorph'
import { motionReduced } from '@/services/motion'
import MapMediaCard from './MapMediaCard.vue'
import { hasOverlay } from '@/services/overlayStack'

const props = defineProps({
  /** Media that carry coordinates; anything without them is filtered out here. */
  media: { type: Array, default: () => [] },
  /** Ordered `[lat, lng]` pairs for the route line; empty hides it. */
  route: { type: Array, default: () => [] },
  /** Fallback date used when a pin does not carry its own timestamp. */
  date: { type: String, default: null },
  /** `map` shows the date with the time and offers "open day"; `day` offers "go to media". */
  mode: { type: String, default: 'map' },
  height: { type: String, default: '420px' },
  /**
   * The rounded, ruled frame the map wears on a page. Turned off when it fills
   * a window of its own, where a border would be drawing a box around the edge
   * of the screen.
   */
  framed: { type: Boolean, default: true },
  /**
   * Lets a bare wheel zoom, with no Ctrl held. Only for a map that fills the
   * window - see `createBaseMap`.
   */
  wheelZoom: { type: Boolean, default: false },
  /** Animates a change of `height`, so an expand or collapse is a movement. */
  animatedHeight: { type: Boolean, default: false },
  /**
   * A view to open on, `{ center, zoom }`, so an expanded map starts where the
   * inline one stood instead of re-fitting the points. Given, the map keeps the
   * view until the reader moves it. See docs/features/maps.md.
   */
  initialView: { type: Object, default: null },
  /**
   * A selection to open on, `{ id }`, so an expanded map shows the album the
   * inline one had open. Applied through `showMedia`, so it never zooms and
   * never fights the handed-over view. See docs/features/maps.md.
   */
  initialSelection: { type: Object, default: null },
})

const emit = defineEmits(['open', 'open-day', 'activate'])

const { t, locale } = useI18n()

const container = ref(null)
const cardRef = ref(null)
const showHint = ref(false)
// Leaflet objects are large and mutate constantly; keep them out of reactivity.
const map = shallowRef(null)
const markerLayer = shallowRef(null)
const routeCanvas = shallowRef(null)
/** This map's own pin-icon cache: a shared one hands one DOM node to both maps
    at once and takes it away with whichever of them unmounts first. */
const iconScope = {}

/*
  Pins are grouped here rather than by `leaflet.markercluster`, which mutates the
  `L` its own bundle holds - the same object the app imported only by luck of the
  dependency optimiser. Its two headline behaviours are also the ones this map
  does not want: a press that zooms, and a pile that fans out into a carousel.
  See docs/features/maps.md.
*/
/** The merge stops at the deepest zoom; until then the default cell applies. */
const PIN_UNCLUSTER_ZOOM = MAX_ZOOM
/** Pins are built a little outside the box, so one is ready before it scrolls in. */
const CULL_PAD = 120

/** The zoom `showMedia` frames a file at, when the reader asks for the map. */
const FOCUS_ZOOM = 14
/** How long to wait for a view move to settle before framing anyway. */
const FRAME_SETTLE_MS = 320

/** The pin's own box: the morph starts exactly here, and the close ends here. */
const PIN_W = PHOTO_PIN_SIZE
const PIN_TAIL = 7
const PIN_BORDER = 2
const PIN_H = PIN_W + PIN_TAIL
/** The pin's picture: its frame less the border it carries on every side. */
const PIN_PHOTO = PIN_W - PIN_BORDER * 2
/** The fade that hands the pin back at the end of a close. */
const CLOSE_FADE_MS = 170

/* The album over a pin, and the keyboard and swipe it owns while it stands. */
const selectedIndex = ref(null)
const cardOpen = ref(false)
const cardAnchor = ref(null)
const cardBounds = ref(null)
/** The measured pin-to-card boxes, held between `before-enter` and `enter`. */
let morphTo = null
/** True while the viewer in front was opened from this map's own card, so a
    close may put the album back. A flag in a view goes stale when the address
    is rewritten for the `?i=` pair. See docs/features/maps.md. */
let viewerFromCard = false

let hintTimer = null
function flashHint() {
  showHint.value = true
  clearTimeout(hintTimer)
  hintTimer = setTimeout(() => (showHint.value = false), 1500)
}

function locatedMedia() {
  return props.media.filter(
    (item) => Number.isFinite(item?.latitude) && Number.isFinite(item?.longitude),
  )
}

/*
  The pins in capture order, which is the order the album's arrows walk them -
  the same order the route line is drawn in.
*/
const points = computed(() =>
  [...locatedMedia()].sort((a, b) =>
    String(a.created ?? '').localeCompare(String(b.created ?? '')),
  ),
)

/** Why the frame last moved, so a press and a step can centre different things. */
let frameReason = 'open'
/** A ground the card is pinned to by name; only `showMedia` asks for one. */
const pinnedGround = ref(null)
/** The ground the frame last stood on, so a step inside one pile does not pan. */
let framedGround = null

/*
  The ground of every point index: the ground of the group it falls in - a pile's
  centre, or a single pin's own coordinate. The card hangs on it, so a step
  between two piles pans and a step inside one does not.
  See docs/features/maps.md.
*/
let groundByIndex = new Map()

function refreshGrounds() {
  groundByIndex = new Map()
  for (const group of groups) {
    const latlng = groupLatLng(group)
    for (const index of group) groundByIndex.set(index, latlng)
  }
}

/** The ground a file stands on: its own pin's, or the centre of its pile. */
function groundOf(index) {
  const found = groundByIndex.get(index)
  if (found) return found
  const item = points.value[index]
  return item ? [item.latitude, item.longitude] : null
}

/** The ground the card hangs over: the file's group, or one named by a caller. */
function cardGround() {
  return pinnedGround.value ?? groundOf(selectedIndex.value)
}

function sameGround(a, b) {
  return Boolean(a && b) && a[0] === b[0] && a[1] === b[1]
}

/* The album rides a zoom the way a marker does. Leaflet transitions every
   marker's own position; the card is positioned in container pixels outside
   the panes, so it would stand still until `zoomend` without this. The
   position is written straight to the element: a render per frame lags it. */
let cardZooming = false

function onZoomAnim(event) {
  if (motionReduced() || !cardOpen.value) return
  const element = cardRef.value?.element()
  const latlng = cardGround()
  if (!element || !latlng) return

  const { origin, at } = animatedProjection(map.value, latlng, event.zoom, event.center)
  const target = at.subtract(origin)
  if (!cardZooming) {
    cardZooming = true
    element.classList.add('is-zooming')
  }
  element.style.left = `${target.x}px`
  element.style.top = `${target.y}px`
}

/** Hands the card back to its own anchor once the movement has settled. */
function endCardZoom() {
  if (!cardZooming) return
  cardZooming = false
  cardRef.value?.element()?.classList.remove('is-zooming')
  updateCard()
}

/** Where the card hangs: its bottom edge at the ground, growing upward. */
function updateCard() {
  // The gesture owns the card's place while it runs: a write here would fight
  // it, and Vue would put the card back where the view still stood.
  if (cardZooming) return
  const instance = map.value
  const latlng = cardGround()
  if (!instance || !latlng) {
    cardAnchor.value = null
    return
  }
  const element = instance.getContainer()
  cardBounds.value = { width: element.clientWidth, height: element.clientHeight }
  cardAnchor.value = instance.latLngToContainerPoint(latlng)
}

/**
 * Opens the album on a file. The card hangs over the **ground of the group** the
 * file belongs to, so walking the files inside one pile never drags it to their
 * own coordinates. `reason` says why the frame will move, and `ground` pins the
 * card to a named point instead - which only `showMedia` asks for, because
 * there the reader asked for that file. See docs/features/maps.md.
 */
function select(index, { reason = 'open', ground = null } = {}) {
  if (index == null || index < 0 || index >= points.value.length) return
  frameReason = reason
  pinnedGround.value = ground
  selectedIndex.value = index
  cardOpen.value = true
  updateCard()
  paintSelection()
  // A step re-frames **with** its own slide, not after it: the preview arriving
  // somewhere and the camera following a beat later reads as two movements.
  // A step inside one pile still pans nothing - see `frameCard`.
  // See docs/features/maps.md.
  if (reason === 'step') scheduleFrame()
}

/*
  A frame after the caller's own change: the card has been laid out by then, so the
  pan is measured on its real box, and it lands with the slide rather than a beat
  after it. A burst of presses costs one move, and a repeat is dropped by the
  ground check in `frameCard`.
*/
function scheduleFrame() {
  nextTick(() => requestAnimationFrame(() => frameCard()))
}

/** Begins the close; the pin comes back only once the card has folded away. */
function clearSelection() {
  if (!cardOpen.value) return
  cardOpen.value = false
}

/** The marker whose group holds a point index, if it is drawn at all. */
function markerForIndex(index) {
  if (index == null) return null
  for (const marker of markerByKey.values()) {
    if (marker.__pointIndices?.includes(index)) return marker
  }
  return null
}

/** True when the file the card closed on sits in a pile of more than one. */
function closedOnPile() {
  const marker = markerForIndex(selectedIndex.value)
  return Boolean(marker?.__clusterItems && marker.__clusterItems.length > 1)
}

/*
  A close lands on the picture that flew in: the pile adopts the member the card
  closed on, and holds it for one cycle so the ticker cannot replace it at once.
  A selection arriving from outside adopts it too, but with no hold.
  See docs/features/maps.md.
*/
function adoptLandedMember({ hold = true } = {}) {
  const marker = markerForIndex(selectedIndex.value)
  const items = marker?.__clusterItems
  if (!items || items.length < 2) return
  const cursor = marker.__pointIndices.indexOf(selectedIndex.value)
  if (cursor < 0) return
  setPileFace(marker.getElement?.()?.firstElementChild, items, cursor)
  marker.__clusterCursor = cursor
  if (hold) marker.__pileHoldUntil = performance.now() + PILE_CYCLE_MS
}

function onCardAfterLeave() {
  selectedIndex.value = null
  cardAnchor.value = null
  pinnedGround.value = null
  framedGround = null
  morphTo = null
  paintSelection()
}

/** Drops the card with no animation, for when the whole data set changes. */
function resetCard() {
  cardOpen.value = false
  selectedIndex.value = null
  cardAnchor.value = null
  pinnedGround.value = null
  framedGround = null
  morphTo = null
}

/**
 * A step is the card's own turn, so the keyboard and a swipe take the very guard
 * the arrows do - one turn at a time, never a backlog.
 * See docs/features/media-viewer.md.
 */
function stepSelection(delta) {
  const card = cardRef.value
  if (card?.step) {
    card.step(delta)
    return
  }
  const next = (selectedIndex.value ?? 0) + delta
  if (next < 0 || next >= points.value.length) return
  select(next, { reason: 'step' })
}

/**
 * Puts the album where it should be, in **one** move and with the zoom kept.
 * `panBy` moves the map centre by its offset, so a point moves by the negative
 * of it: to bring a reference to `target` the offset is `reference - target`.
 * The reference is always the card's own centre. See docs/features/maps.md.
 */
function frameCard(animate = true) {
  const instance = map.value
  const element = cardRef.value?.element()
  const ground = cardGround()
  if (!instance || !ground || !element || !cardOpen.value) return

  const box = instance.getContainer()
  const width = box.clientWidth
  const height = box.clientHeight
  cardBounds.value = { width, height }

  const anchor = instance.latLngToContainerPoint(ground)
  cardAnchor.value = anchor

  // A step **inside one pile** is no move at all: the ground on show has not
  // changed, so the map stays exactly where it stands.
  if (frameReason === 'step' && framedGround && sameGround(ground, framedGround)) return
  framedGround = ground

  // One rule, on a press and on a step alike: the card's own centre is brought
  // to the middle of the box. It grows upward from the point, so its centre is
  // half its height above the ground. See docs/features/maps.md.
  const cardHeight = element.offsetHeight
  const dx = anchor.x - width / 2
  const dy = anchor.y - cardHeight / 2 - height / 2

  // Below a pixel there is nothing worth moving for.
  if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return

  instance.panBy([dx, dy], { animate })
}

/**
 * Opens the album on a file from outside the map - the viewer's own close and
 * its "show on the map" action. `zoom` is the one difference: the action frames
 * the file, a close only syncs the album. A file this map does not hold closes
 * the album, so a stale card goes with it. See docs/features/maps.md.
 */
function showMedia(id, { zoom = false } = {}) {
  const index = points.value.findIndex((item) => item.id === id)
  if (index < 0 || !map.value) {
    clearSelection()
    return false
  }

  // A card already standing is not re-mounted, so its own unfold hooks will not
  // re-frame it: the view move below has to ask for the frame itself.
  const wasOpen = cardOpen.value
  const point = points.value[index]

  if (!zoom) {
    select(index, { reason: 'open' })
    if (!wasOpen) adoptLandedMember({ hold: false })
    return true
  }

  // The one caller that zooms, to `FOCUS_ZOOM`; the album then hides the pile
  // the file sits under, so nothing stands between the reader and the file.
  map.value.setView(
    [point.latitude, point.longitude],
    Math.max(map.value.getZoom(), FOCUS_ZOOM),
    { animate: true },
  )
  // The one caller that pins the card to the file itself, because the reader
  // asked for that file. See docs/features/maps.md.
  select(index, { reason: 'open', ground: [point.latitude, point.longitude] })
  // The pile behind the album adopts the file the album is on, so the mark and
  // the preview agree - with no hold, which belongs to a close.
  if (!wasOpen) adoptLandedMember({ hold: false })

  if (wasOpen) {
    // The frame is measured on the settled view and grouping, so it waits for
    // the movement - with a fallback for a view already at its target, which
    // fires no `moveend` at all.
    let framed = false
    const frame = () => {
      if (framed) return
      framed = true
      scheduleFrame()
    }
    map.value.once('moveend', frame)
    window.setTimeout(frame, FRAME_SETTLE_MS)
  }

  return true
}

/** The card's picture opening the viewer: the map remembers that its own card
    opened one, so a close may put the album back. See docs/features/maps.md. */
function onCardOpen(id) {
  viewerFromCard = true
  emit('open', id)
}

/**
 * The viewer has closed on a file. Only a viewer this map's own card opened
 * may move it - a picture opened from a grid tile or a note asked the map for
 * nothing - and then the album lands on the file that closed, or closes when
 * the map does not hold it. See docs/features/maps.md.
 */
function syncViewerClose(id) {
  const fromCard = viewerFromCard
  viewerFromCard = false
  if (!fromCard) return false
  return showMedia(id ?? null)
}

/** Drops the record with no restore, for a viewer that left with no close event. */
function forgetViewerClose() {
  viewerFromCard = false
}

/** The view on show, so an expanded map can open on it rather than re-fit. */
function getView() {
  const instance = map.value
  if (!instance) return null
  return { center: instance.getCenter(), zoom: instance.getZoom() }
}

/** What the album is open on, `{ id }`, so an expanded map can adopt it. */
function getSelection() {
  const index = selectedIndex.value
  if (index == null) return null
  const item = points.value[index]
  return item ? { id: item.id } : null
}

/**
 * Puts the live map on a view handed back from the other one - an expand being
 * undone. No animation and no re-fit: the reader has just looked at it.
 */
function applyView(view) {
  if (!view || !map.value) return
  map.value.setView(view.center, view.zoom, { animate: false })
  updateCard()
}

defineExpose({ showMedia, syncViewerClose, forgetViewerClose, getView, getSelection, applyView })

/*
  Listened for in the **capture** phase, so the day page's own arrow keys - which
  page the whole day - never also answer a step inside the album. `hasOverlay()`
  stands aside for a dialog or the viewer, which own the keyboard themselves.
*/
function onKeydown(event) {
  if (!cardOpen.value || hasOverlay()) return

  if (event.key === 'ArrowLeft') stepSelection(-1)
  else if (event.key === 'ArrowRight') stepSelection(1)
  else if (event.key === 'Escape') clearSelection()
  else return

  event.preventDefault()
  event.stopImmediatePropagation()
}

/* The card's own swipe. The card answers no presses, so a touch over it is the
   map's by default; this reads the gesture from its geometry and claims only
   the horizontal one - the same axis lock the day page's own gestures use. */
const SWIPE_LOCK = 16
const SWIPE_DOMINANCE = 1.5
const SWIPE_COMMIT = 40

let swipe = null

function cardRect() {
  return cardRef.value?.$el?.getBoundingClientRect() ?? null
}

function insideCard(x, y) {
  const rect = cardRect()
  if (!rect) return false
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom
}

/** The card's picture, which is the tile the viewer flies from. */
function insidePhoto(x, y) {
  const rect = cardRef.value?.photoRect()
  if (!rect) return false
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom
}

/** The map's own drag, stood down while a gesture that began on the card has
    it, so the album's swipe is never half a pan. See docs/features/maps.md. */
let dragSuspended = false

function suspendDrag() {
  if (dragSuspended || !map.value) return
  dragSuspended = true
  map.value.dragging.disable()
}

function resumeDrag() {
  if (!dragSuspended) return
  dragSuspended = false
  map.value?.dragging.enable()
}

function onTouchStart(event) {
  swipe = null
  if (!cardOpen.value || hasOverlay()) return
  if (event.touches?.length !== 1) return
  const touch = event.touches[0]
  if (!insideCard(touch.clientX, touch.clientY)) return
  // The gesture is decided here, by where it began: Leaflet's own drag handler
  // has already seen this same `touchstart`, and stopping the event later
  // cannot undo the pan it has begun. See docs/features/maps.md.
  suspendDrag()
  swipe = { x: touch.clientX, y: touch.clientY, axis: null }
}

function onTouchMove(event) {
  if (!swipe) return
  const touch = event.touches?.[0]
  if (!touch) return

  const dx = touch.clientX - swipe.x
  const dy = touch.clientY - swipe.y
  if (!swipe.axis) {
    // The first decisive move decides, so a step never turns into a pan halfway.
    if (Math.abs(dx) < SWIPE_LOCK) return
    swipe.axis = Math.abs(dx) > Math.abs(dy) * SWIPE_DOMINANCE ? 'x' : 'y'
  }
  if (swipe.axis !== 'x') return

  if (event.cancelable) event.preventDefault()
  event.stopPropagation()
}

function onTouchEnd(event) {
  const gesture = swipe
  swipe = null
  // The map's own drag comes back with the last finger, whatever the gesture was.
  if (!event.touches?.length) resumeDrag()
  if (!gesture || gesture.axis !== 'x') return

  const touch = event.changedTouches?.[0]
  if (!touch) return
  const dx = touch.clientX - gesture.x
  if (Math.abs(dx) < SWIPE_COMMIT) return

  event.stopPropagation()
  // A swipe is a step, not a press on the picture it started over: the tap the
  // browser may invent from it must not also open the album full screen.
  suppressClickUntil = performance.now() + 350
  stepSelection(dx < 0 ? 1 : -1)
}

function onTouchCancel() {
  swipe = null
  resumeDrag()
}

/** The pin's box, which is where the unfold starts and the close ends. */
function pinBox() {
  return { width: PIN_W, height: PIN_H, photoHeight: PIN_PHOTO }
}

/** The card's own box, measured once it is in the DOM. */
function cardBox(element) {
  const photo = cardRef.value?.photoElement() ?? null
  return {
    width: element.offsetWidth,
    height: element.offsetHeight,
    photoHeight: photo?.offsetHeight ?? PIN_PHOTO,
  }
}

/*
  The unfold. `enter` runs after the element is in the DOM and **before the first
  paint**, so measuring there gives the card's real box and the animation's first
  keyframe is what gets painted - the card is never seen at full size first.
*/
function onCardBeforeEnter(element) {
  // The footer is held back until the box has opened far enough to hold it.
  if (!motionReduced()) element.classList.add('is-closed')
}

function onCardEnter(element, done) {
  if (motionReduced()) {
    element.classList.remove('is-closed')
    done()
    return
  }

  /*
    Measure the **open** box: the end of the morph is the card laid out, not the
    pin it is still wearing. `is-closed` comes straight back in the same frame,
    so the first painted frame is still the pin, and the transition is stood
    down while the reading is taken so it is not mistaken for a movement.
  */
  element.classList.add('is-measuring')
  element.classList.remove('is-closed')
  morphTo = cardBox(element)
  element.classList.add('is-closed')
  element.classList.remove('is-measuring')

  const photo = cardRef.value?.photoElement() ?? null
  requestAnimationFrame(() => element.classList.remove('is-closed'))

  playCardMorph({
    frame: element,
    photo,
    from: pinBox(),
    to: morphTo,
  }).then(() => {
    // The card is at its own size now, which is what the frame is measured on -
    // and the size the shield over the marks it covers is worked out from.
    scheduleFrame()
    shieldUnderCard()
    done()
  })
}

function onCardLeave(element, done) {
  // The pile adopts the picture that flew in **before** the pin returns, so the
  // pin the reader is handed back wears the face the card was showing.
  adoptLandedMember()

  if (motionReduced()) {
    done()
    return
  }

  const photo = cardRef.value?.photoElement() ?? null
  element.classList.add('is-closed')

  playCardMorph({
    frame: element,
    photo,
    reverse: true,
    from: pinBox(),
    to: morphTo ?? cardBox(element),
  }).then(() => endClose(element, done))
}

/**
 * The last of a close: the pin comes back **under** the card and the card fades
 * away over it. Worth only where the card showed something the pin will not - a
 * turned pile's miniature giving way to the pin's own picture. Everywhere else
 * the fold's last frame is already the pin. See docs/features/maps.md.
 */
function endClose(element, done) {
  const turnedPile = PILE_TURN && closedOnPile()
  selectedIndex.value = null
  cardAnchor.value = null
  paintSelection()

  // Nothing to fade anywhere else: the fold has just landed on the pin itself.
  if (!turnedPile) {
    done()
    return
  }

  element
    .animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: CLOSE_FADE_MS,
      easing: 'ease-out',
      fill: 'forwards',
    })
    .finished.catch(() => {})
    .then(done)
}

/**
 * The distinct grounds of every pile, for the route canvas. The pile's mark
 * stands on the centroid while the chevron row is stamped along the files' own
 * coordinates, so the row begins and ends in mid-air without them - which is
 * what the dots are for. A lone pin gets none. See docs/features/maps.md.
 */
function pileGroundList() {
  const list = []
  for (const group of groups) {
    if (group.length < 2) continue

    // Distinct grounds only: two files shot from one place are one point, and a
    // pile every member of which shares one coordinate stands on the mark's own
    // point already, where a dot would be covered and say nothing.
    const seen = new Set()
    const unique = []
    for (const index of group) {
      const item = points.value[index]
      if (!item) continue
      const key = `${item.latitude},${item.longitude}`
      if (seen.has(key)) continue
      seen.add(key)
      unique.push([item.latitude, item.longitude])
    }
    if (unique.length > 1) list.push(...unique)
  }
  return list
}

/**
 * The dots the route canvas paints: a pile's own distinct grounds, clustered by
 * distance in projected pixels and capped at `dotBudget()`. The cap counts the
 * clusters **the box draws**, exactly as the pins count the box's groups, so a
 * dense stretch off screen cannot coarsen the one in front of the reader. Over
 * the budget one dot stands on each cluster's centroid; the canvas keeps every
 * cluster, so a pan still draws them.
 */
function computeDots() {
  const instance = map.value
  const grounds = pileGroundList()
  if (grounds.length <= dotCap || !instance) return grounds

  const entries = grounds.map((latlng, index) => ({
    index,
    point: instance.latLngToContainerPoint(latlng),
  }))

  const centreOf = (cluster) => {
    let x = 0
    let y = 0
    for (const index of cluster) {
      x += entries[index].point.x
      y += entries[index].point.y
    }
    return { x: x / cluster.length, y: y / cluster.length }
  }

  const box = instance.getContainer()
  const width = box.clientWidth
  const height = box.clientHeight
  const onScreen = (cluster) => {
    const at = centreOf(cluster)
    return (
      at.x >= -CULL_PAD &&
      at.x <= width + CULL_PAD &&
      at.y >= -CULL_PAD &&
      at.y <= height + CULL_PAD
    )
  }

  const { groups: clusters } = clusterWithinBudget(entries, {
    budget: dotCap,
    count: (list) => list.reduce((total, cluster) => total + (onScreen(cluster) ? 1 : 0), 0),
    startCell: DOT_CELL,
    step: DOT_STEP,
    maxCell: DOT_CELL_MAX,
  })

  return clusters.map((cluster) => {
    const at = centreOf(cluster)
    return instance.containerPointToLatLng(L.point(at.x, at.y))
  })
}

/** Draws the route in the style on show, onto the single canvas. */
function renderRoute() {
  routeCanvas.value?.draw(props.route, ROUTE_STYLE, dotGrounds)
}

/** True when a group's ground is in the box, padded, so a mark is ready early. */
function inBox(instance, latlng, width, height) {
  const at = instance.latLngToContainerPoint(latlng)
  return (
    at.x >= -CULL_PAD && at.x <= width + CULL_PAD && at.y >= -CULL_PAD && at.y <= height + CULL_PAD
  )
}

/** How many of a candidate grouping's groups the box would draw. */
function visibleCount(list, box) {
  const instance = map.value
  const width = box.clientWidth
  const height = box.clientHeight
  let count = 0
  for (const group of list) {
    if (inBox(instance, groupLatLng(group), width, height)) count += 1
  }
  return count
}

/**
 * The groups for the zoom on show, at the smallest cell that keeps the box inside
 * the budget. The deepest zoom is the reader's own instruction to pull two pins
 * apart, so no budget may widen the cell there; only files sharing a pixel stay
 * together. See docs/features/maps.md.
 */
function computeGroups(zoom, box) {
  if (!points.value.length) return []
  if (zoom >= PIN_UNCLUSTER_ZOOM) {
    cellNow = 1
    return clusterByCell(projected, 1)
  }

  // The budget counts what the box draws and never the whole trip: a country of
  // marks nobody can see must not coarsen the street in front of the reader.
  const { groups: result, cell } = clusterWithinBudget(projected, {
    budget: markerCap,
    count: (list) => visibleCount(list, box),
  })
  cellNow = cell
  return result
}

/** The point a group answers with: the file itself, or the middle of the pile. */
function groupLatLng(group) {
  if (group.length === 1) {
    const item = points.value[group[0]]
    return [item.latitude, item.longitude]
  }
  let lat = 0
  let lng = 0
  for (const index of group) {
    const item = points.value[index]
    lat += item.latitude
    lng += item.longitude
  }
  return [lat / group.length, lng / group.length]
}

function groupKey(group) {
  if (group.length === 1) return `s${group[0]}`
  return `c${[...group].sort((a, b) => a - b).join('-')}`
}

function groupItems(group) {
  return group.map((index) => points.value[index])
}

function makeMarker(group, latlng) {
  // The earliest file of a pile is the one its press opens, so the arrows that
  // follow walk the same chronology a single pin does. It never zooms.
  const earliest = Math.min(...group)

  if (group.length === 1) {
    const item = points.value[earliest]
    const marker = L.marker(latlng, {
      // A day map is read as a sequence of hours, so there a lone pin says the
      // file's own clock; the trip map says nothing. See docs/features/maps.md.
      icon: photoPinIcon(item, {
        withTime: props.mode === 'day',
        locale: locale.value,
        scope: iconScope,
      }),
      title: item.title ?? '',
      // A marker's click bubbles to the map by default, which would put the
      // album away the instant it opened.
      bubblingMouseEvents: false,
    })
    marker.__pointIndices = group
    marker.on('click', () => select(earliest, { reason: 'open' }))
    return marker
  }

  const items = groupItems(group)
  const marker = L.marker(latlng, {
    icon: photoClusterIcon(items, {
      withTime: props.mode === 'day',
      locale: locale.value,
    }),
    bubblingMouseEvents: false,
  })
  marker.__pointIndices = group
  marker.__clusterItems = items
  // The member the pile's face is on, so opening it starts on the picture that
  // is in the frame. See docs/features/maps.md.
  marker.__clusterCursor = 0
  marker.on('click', () => {
    suppressClickUntil = performance.now() + 350
    select(group[marker.__clusterCursor] ?? earliest, { reason: 'open' })
  })
  return marker
}

let projected = []
let groups = []
const markerByKey = new Map()
let markerCap = 1000
/** The dots' own budget: the dot canvas is the one unbounded thing on the map. */
let dotCap = 1000
/** The grounds the dot canvas paints, cut where the pin grouping is. */
let dotGrounds = []
/** The cell the groups on show were cut with; a settle may only widen it. */
let cellNow = CLUSTER_CELL
/** What the box drew on the last `syncMarkers`, which the budget is measured on. */
let drawnNow = 0

/*
  Recomputes the projection and the groups; only a zoom or new data can change
  them. Points carry their own index - the same one `points` and the album use -
  so a group is a list of those indices and nothing has to be looked up by value.
*/
function refreshGroups() {
  const instance = map.value
  if (!instance) return
  projected = points.value.map((item, index) => ({
    index,
    point: instance.latLngToLayerPoint([item.latitude, item.longitude]),
  }))
  groups = computeGroups(instance.getZoom(), instance.getContainer())
  refreshGrounds()
  // The dots are cut where the pins are - a zoom or new data, never a pan.
  dotGrounds = computeDots()
}

/** Draws the groups that fall in (or near) the box, and takes the rest out. */
function syncMarkers() {
  const instance = map.value
  if (!instance) return

  const box = instance.getContainer()
  const width = box.clientWidth
  const height = box.clientHeight

  const wanted = new Map()
  for (const group of groups) {
    const latlng = groupLatLng(group)
    if (!inBox(instance, latlng, width, height)) continue
    wanted.set(groupKey(group), { group, latlng })
  }
  drawnNow = wanted.size

  for (const [key, marker] of markerByKey) {
    if (wanted.has(key)) continue
    markerLayer.value.removeLayer(marker)
    markerByKey.delete(key)
  }

  for (const [key, info] of wanted) {
    const existing = markerByKey.get(key)
    if (existing) {
      existing.__pointIndices = info.group
      existing.__clusterItems = groupItems(info.group)
      continue
    }
    const marker = makeMarker(info.group, info.latlng)
    markerByKey.set(key, marker)
    marker.addTo(markerLayer.value)
  }

  paintSelection()
}

/*
  The pin the album belongs to is **not drawn** while the card stands: the pin
  becomes the card, so leaving it under one would be two marks for one file.
  It comes back the moment the card has folded away.
*/
function paintSelection() {
  for (const marker of markerByKey.values()) {
    const element = marker.getElement?.()
    if (!element?.firstElementChild) continue
    if (!element.firstElementChild.classList.contains('trip-photo-pin')) continue

    const active = marker.__pointIndices?.includes(selectedIndex.value) ?? false
    element.style.display = active ? 'none' : ''
    element.firstElementChild.classList.toggle('trip-photo-pin-active', active)
  }

  shieldUnderCard()
}

/** True when two viewport rectangles share any part of their box. */
function overlaps(a, b) {
  return a.right > b.left && a.left < b.right && a.bottom > b.top && a.top < b.bottom
}

/*
  The markers a standing card covers. The card takes no presses of its own, so a
  press on its picture falls through it - and a marker under there would answer
  with its own album, a different pin than the one the reader pressed. The card is
  the mark while it stands, so those markers take no presses; the rest keep theirs.
*/
function shieldUnderCard() {
  const rect = cardRect()
  for (const marker of markerByKey.values()) {
    const element = marker.getElement?.()
    if (!element) continue
    const covered = Boolean(rect) && overlaps(element.getBoundingClientRect(), rect)
    element.style.pointerEvents = covered ? 'none' : ''
  }
}

/*
  The pile ticker: one timer for the whole map, not one per pile. **Every visible
  pile turns on the same tick**, so the map changes as a whole rather than a pile
  at a time. It exists only in turn mode; the quiet default holds one member on
  screen. A hidden tab and reduced motion stop it. See docs/features/maps.md.
*/
let clusterTimer = null

/** Turns one pile, and publishes the member now on its face. */
function turnPile(marker) {
  const items = marker.__clusterItems
  if (!items || items.length < 2) return
  // A pile a close just landed on holds that picture for one whole cycle.
  if (marker.__pileHoldUntil && performance.now() < marker.__pileHoldUntil) return
  const cursor = advancePile(marker.getElement?.()?.firstElementChild, items)
  if (typeof cursor === 'number') marker.__clusterCursor = cursor
}

function startClusterTicker() {
  stopClusterTicker()
  if (!PILE_TURN || motionReduced()) return
  clusterTimer = window.setInterval(() => {
    if (document.hidden) return
    for (const marker of markerByKey.values()) turnPile(marker)
  }, PILE_CYCLE_MS)
}

function stopClusterTicker() {
  if (clusterTimer != null) window.clearInterval(clusterTimer)
  clusterTimer = null
}

function renderMarkers() {
  if (!map.value) return

  refreshGroups()
  syncMarkers()
  routeCanvas.value?.resize()
  renderRoute()
  fitToContent()
}

/**
 * A pan changes no distance, but it does change **what the box draws**: a drag
 * into a denser part of the trip may need a wider cell. A settle only ever widens
 * it - the next zoom is where the grouping is cut again - so nothing happens
 * while the cell on show still holds the budget. See docs/features/maps.md.
 */
function regroupForBox() {
  const instance = map.value
  if (!instance || !groups.length) return false
  if (instance.getZoom() >= PIN_UNCLUSTER_ZOOM) return false
  if (drawnNow <= markerCap || cellNow >= CLUSTER_CELL_MAX) return false

  groups = computeGroups(instance.getZoom(), instance.getContainer())
  refreshGrounds()
  return true
}

/** The frame a regroup waits on, so a burst of settles costs one recompute. */
let groupFrame = 0

function scheduleRegroup() {
  if (groupFrame) return
  groupFrame = requestAnimationFrame(() => {
    groupFrame = 0
    if (regroupForBox()) syncMarkers()
  })
}

/*
  Framing the points, kept apart from drawing them because it has to run again -
  `invalidateSize` says nothing about the framing. **The refit belongs to the
  first layout only**: a later resize keeps the centre it has, instead of
  throwing the view away and re-fitting the points, which read as a jump to
  another scale on a resize that only changed the height.
  See docs/features/maps.md.
*/
let framed = false
/** A cluster press also reaches the map's own click, a moment later. */
let suppressClickUntil = 0

function fitToContent() {
  if (!map.value) return
  // An expanded map was handed a view to keep; re-fitting would throw it away.
  if (pinnedView) return

  const located = locatedMedia()
  const bounds = L.latLngBounds([
    ...located.map((item) => [item.latitude, item.longitude]),
    ...props.route,
  ])

  // `animate: false` keeps the framing a plain move, with nothing to settle.
  if (bounds.isValid()) {
    map.value.fitBounds(bounds, { padding: [40, 40], maxZoom: 14, animate: false })
  } else {
    map.value.setView(FALLBACK_CENTER, FALLBACK_ZOOM, { animate: false })
  }
  // A box that had no size when this ran has not been framed at all, so the
  // first laid-out resize still gets to do it.
  framed = map.value.getContainer().clientWidth > 0
}

let resizeObserver = null
/** True while the view came from `initialView`, so nothing re-fits over it. */
let pinnedView = false
/** The frame an arrow redraw is waiting on, so a pan draws once per frame. */
let arrowFrame = 0

onMounted(() => {
  markerCap = markerBudget()
  dotCap = dotBudget()

  const instance = markRaw(
    createBaseMap(container.value, { onScrollHint: flashHint, wheelZoom: props.wheelZoom }),
  )
  map.value = instance

  // An expanded map opens where the inline one stood, and keeps that view until
  // the reader moves it. See docs/features/maps.md.
  if (props.initialView) {
    pinnedView = true
    instance.setView(props.initialView.center, props.initialView.zoom, { animate: false })
  }

  // The chevrons ride above the line and below every pin; the grounds of a pile's
  // members sit one pane above the chevrons and still below every pin.
  const pane = instance.createPane(ROUTE_PANE)
  pane.style.zIndex = String(ROUTE_PANE_Z)
  pane.style.pointerEvents = 'none'

  const dotPane = instance.createPane(ROUTE_DOT_PANE)
  dotPane.style.zIndex = String(ROUTE_DOT_PANE_Z)
  dotPane.style.pointerEvents = 'none'

  routeCanvas.value = createRouteCanvas(instance)
  markerLayer.value = markRaw(L.layerGroup().addTo(instance))

  // A zoom changes both: the chevrons are spaced on screen, and the pins are
  // grouped by what lands on top of what.
  instance.on('zoomend', () => {
    refreshGroups()
    syncMarkers()
    routeCanvas.value?.resize()
    renderRoute()
  })

  /*
    A pan brings **new ground** into the box, which has never been drawn; the
    route is redrawn once per frame while it moves, and once more when it
    settles. Clipping to the box keeps that to a handful of chevrons.
  */
  instance.on('move', () => {
    if (arrowFrame) return
    arrowFrame = requestAnimationFrame(() => {
      arrowFrame = 0
      renderRoute()
    })
  })

  instance.on('moveend', () => {
    // The grouping is unchanged by a pan, but the visible set is not, and the
    // framing pan is no reason to leave the new ground bare.
    endCardZoom()
    syncMarkers()
    updateCard()
    renderRoute()
    scheduleRegroup()
  })

  // The card answers no presses of its own, so every press lands here: on the
  // picture, on the card beside it, or on the map. Only the last closes it.
  instance.on('click', (event) => {
    if (performance.now() < suppressClickUntil) return
    const original = event.originalEvent
    if (!original) return

    if (cardOpen.value && insideCard(original.clientX, original.clientY)) {
      // The picture is the way onto the album, as a tile is in the grid.
      if (insidePhoto(original.clientX, original.clientY)) cardRef.value?.openFull()
      return
    }

    clearSelection()
  })
  // The album travels with the pin it belongs to, and rides a zoom the way a
  // marker does. See docs/features/maps.md.
  instance.on('move zoom', updateCard)
  instance.on('zoomanim', onZoomAnim)

  renderMarkers()
  startClusterTicker()

  // The selection travels with the view: an expanded map opens the same album,
  // through the same path as the viewer's close, so it never zooms.
  if (props.initialSelection?.id != null) showMedia(props.initialSelection.id)

  // The map is often laid out inside a container that resizes after mount
  // (sidebar, tab switch); without this it renders as a grey box - and without
  // the first refit, one at the wrong scale. A later resize keeps the centre.
  resizeObserver = new ResizeObserver(() => {
    // Leaflet's own default: it pans by the change of centre, so the ground that
    // was in the middle lands on the new middle. `pan: false` would anchor the
    // content to the box's top-left and a taller box would slide the view.
    instance.invalidateSize()
    if (!framed) fitToContent()
    syncMarkers()
    scheduleRegroup()
    routeCanvas.value?.resize()
    renderRoute()
    updateCard()
  })
  resizeObserver.observe(container.value)

  document.addEventListener('keydown', onKeydown, true)
})

/* The card's swipe listeners exist only while a card does. */
watch(cardOpen, (open) => {
  const options = { capture: true }
  if (!open) {
    document.removeEventListener('touchstart', onTouchStart, options)
    document.removeEventListener('touchmove', onTouchMove, options)
    document.removeEventListener('touchend', onTouchEnd, options)
    document.removeEventListener('touchcancel', onTouchCancel, options)
    swipe = null
    resumeDrag()
    return
  }
  document.addEventListener('touchstart', onTouchStart, { ...options, passive: true })
  document.addEventListener('touchmove', onTouchMove, { ...options, passive: false })
  document.addEventListener('touchend', onTouchEnd, { ...options, passive: true })
  document.addEventListener('touchcancel', onTouchCancel, options)
})

watch(
  () => [props.media, props.route],
  () => {
    resetCard()
    clearPhotoPinIcons(iconScope)
    renderMarkers()
  },
  { deep: false },
)

/*
  A clock is in the reader's own language, and a pin keeps its icon between
  rebuilds - so a change of locale drops the cached marks and draws them again.
  The view is the reader's and stays; only the marks are remade.
*/
watch(locale, () => {
  clearPhotoPinIcons(iconScope)
  for (const marker of markerByKey.values()) markerLayer.value?.removeLayer(marker)
  markerByKey.clear()
  refreshGroups()
  syncMarkers()
})

onBeforeUnmount(() => {
  clearTimeout(hintTimer)
  if (arrowFrame) cancelAnimationFrame(arrowFrame)
  if (groupFrame) cancelAnimationFrame(groupFrame)
  stopClusterTicker()
  document.removeEventListener('keydown', onKeydown, true)
  const options = { capture: true }
  document.removeEventListener('touchstart', onTouchStart, options)
  document.removeEventListener('touchmove', onTouchMove, options)
  document.removeEventListener('touchend', onTouchEnd, options)
  document.removeEventListener('touchcancel', onTouchCancel, options)
  resizeObserver?.disconnect()
  routeCanvas.value?.remove()
  clearPhotoPinIcons(iconScope)
  markerByKey.clear()
  map.value?.remove()
  map.value = null
})
</script>

<template>
  <!--
    `isolate`: Leaflet stacks its panes from 200 up to 800, and without a
    stacking context of their own those numbers compete with the whole page -
    which is how the map came to sit over the header and swallow the menus
    dropping out of it. Isolating pins every one of them inside this box.

    While an album is open the box is lifted over what follows it on the page, so
    a card taller than a short day map is not painted under the calendar.
  -->
  <div class="relative isolate" :class="cardOpen ? 'z-20' : ''">
    <!--
      Leaflet clips its own box, and only its own: the album lives outside it, so
      a card taller than a short day map is free to overhang it. `h-full` carries
      a window-filling height down to the tiles.
    -->
    <div class="h-full overflow-hidden" :class="framed ? 'rounded-lg ring-1 ring-edge' : ''">
      <div
        ref="container"
        :style="{ height }"
        class="w-full"
        :class="animatedHeight ? 'transition-[height] duration-300 ease-out' : ''"
      />
    </div>

    <!--
      A control a page floats over the map (the trip page's expand mark). After
      the map box and before the album, so one z-index stands over Leaflet's
      panes and stays under the card. See docs/features/maps.md.
    -->
    <slot name="controls" />

    <!-- The album over the selected pin, unfolding out of that pin's own box. -->
    <Transition
      name="map-card"
      @before-enter="onCardBeforeEnter"
      @enter="onCardEnter"
      @leave="onCardLeave"
      @after-leave="onCardAfterLeave"
    >
      <MapMediaCard
        v-if="cardOpen"
        ref="cardRef"
        :medias="points"
        :index="selectedIndex"
        :mode="mode"
        :anchor="cardAnchor"
        :bounds="cardBounds"
        @update:index="select($event, { reason: 'step' })"
        @settled="scheduleFrame"
        @close="clearSelection"
        @open="onCardOpen"
        @open-day="emit('open-day', { date: $event.date ?? date, id: $event.id })"
        @activate="emit('activate', $event)"
      />
    </Transition>

    <!-- Wheel-without-ctrl hint, the convention embedded maps use. -->
    <Transition
      enter-from-class="opacity-0"
      enter-active-class="transition duration-150"
      leave-to-class="opacity-0"
      leave-active-class="transition duration-300"
    >
      <div
        v-if="showHint"
        class="pointer-events-none absolute inset-0 z-[500] flex items-center justify-center bg-black/40"
      >
        <p class="rounded-md bg-ink/80 px-4 py-2 text-sm text-paper">{{ t('map.zoomHint') }}</p>
      </div>
    </Transition>
  </div>
</template>

<style>
/* Leaflet's own chrome, toned down to match the surrounding paper palette. */
.leaflet-container {
  font: inherit;
  background: var(--color-paper);
}

/* The route canvas: one element in the route pane, aligned to the box. */
.trip-route-canvas {
  position: absolute;
  left: 0;
  top: 0;
  pointer-events: none;
}
</style>
