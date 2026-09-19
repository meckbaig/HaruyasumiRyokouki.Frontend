<script setup>
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import MediaThumb from './MediaThumb.vue'
import { mediaDate } from '@/services/mediaAssets'
import { formatShortDate, formatShortTime } from '@/services/dates'
import { isVideo } from '@/services/mediaType'
import { markOpenedFrom } from '@/services/openedFrom'
import { GHOST_CLICK_MS } from '@/services/ghostClick'
import { isPrivate, togglePrivate } from '@/services/privacy'
import { toggleFavorite } from '@/services/favorites'
import { useEditorStore } from '@/stores/editor'
import { useUiStore } from '@/stores/ui'

const props = defineProps({
  media: { type: Object, required: true },
  /** Dimmed until pointed at: the rest of a day, behind what search matched. */
  dimmed: { type: Boolean, default: false },
  editable: { type: Boolean, default: false },
  /** Dimmed for a moment so the singled-out files stand out of the wall. */
  faded: { type: Boolean, default: false },
  /**
   * Stamps the day the file was taken onto the tile. For the pending queue,
   * where files arrive from all over the trip with nothing else to place them
   * by - everywhere else the day is the page they are already on.
   */
  showDate: { type: Boolean, default: false },
  /** Stamps the clock **on approach**, where the page already establishes the
   *  date. See docs/features/media-grid-and-selection.md. */
  showTime: { type: Boolean, default: false },
  /** Pencil and star on show without a cursor. Required on the queue, wrong on a
   *  day. See docs/features/media-grid-and-selection.md. */
  touchControls: { type: Boolean, default: false },
  /**
   * A read-only wall: the controls arrive half-strength on approach (a marked
   * star stays on show and dims on hover) with a hint saying why, and a press on
   * one is the tile's own, so it opens the picture.
   * See docs/features/media-grid-and-selection.md.
   */
  readonly: { type: Boolean, default: false },
})

const emit = defineEmits(['open', 'edit', 'context'])

const { t } = useI18n()
const editor = useEditorStore()
const ui = useUiStore()

const root = ref(null)
/*
  See `touchControls`: the same class, quietened where nothing hovers. A
  read-only control arrives the same way but half-strength, so it reads as not
  offered rather than refused. See docs/features/media-grid-and-selection.md.
*/
const reveal = computed(() =>
  props.readonly
    ? 'hover-reveal hover-reveal-dim'
    : props.touchControls
      ? 'hover-reveal'
      : 'hover-reveal hover-reveal-quiet',
)
const video = computed(() => isVideo(props.media))
const hidden = computed(() => isPrivate(props.media))
/* The stamp in the corner, in two halves: the date stays, the time joins it on
   approach. **One badge, not two** - they land in the same corner. */
const stampDate = computed(() =>
  props.showDate ? formatShortDate(mediaDate(props.media), ui.locale) : '',
)
const stampTime = computed(() =>
  props.showTime ? formatShortTime(props.media?.created, ui.locale) : '',
)
const selected = computed(() => editor.isSelected(props.media.id))
const label = computed(() => props.media.title || props.media.fileName || t('media.untitled'))

const outlineClass = computed(() => {
  // The editor's selection ring. A link's block is one stroked path drawn by
  // MediaGrid instead: a ring cannot be glued across tiles, a stroke can.
  // See docs/features/media-grid-and-selection.md.
  if (selected.value) return 'ring-2 ring-accent ring-offset-2 ring-offset-paper'
  return 'ring-1 ring-edge'
})

/* The front-page mark. A marked file keeps its star on show, unlike the pencil -
   the mark is the answer to "what have I picked out?". */
const favorite = computed(() => props.media.favorite === true)
/** A read-only wall keeps the star as it is, and dims it as the **tile** is
 *  pointed at, so the mark reads unchanged while the press is not offered. */
const starClass = computed(() =>
  favorite.value
    ? `text-star opacity-100 ${props.readonly ? 'group-hover:opacity-50' : ''}`
    : `text-ink ${reveal.value}`,
)
const marking = ref(false)
const hiding = ref(false)

/**
 * A request in flight is not a reason to disable the button: a disabled control
 * takes the "not allowed" cursor, and a mark that answers a click with a barred
 * circle reads as a refusal rather than as work already under way. Repeat clicks
 * are simply ignored, and `aria-busy` says so to anyone being read to.
 */
async function mark() {
  if (passThrough()) return
  if (marking.value) return
  marking.value = true
  try {
    await toggleFavorite(props.media)
  } catch (error) {
    ui.notify(error?.detail || error?.title || t('errors.generic'), 'error')
  } finally {
    marking.value = false
  }
}

/** Hiding, on the tile rather than behind the edit form.
 *  See docs/features/media-grid-and-selection.md. */
async function hide() {
  if (passThrough()) return
  if (hiding.value) return
  hiding.value = true
  try {
    await togglePrivate(props.media)
  } catch (error) {
    ui.notify(error?.detail || error?.title || t('errors.generic'), 'error')
  } finally {
    hiding.value = false
  }
}

/*
  A read-only wall offers no edit: a press on a control is the tile's own press,
  so it opens the picture exactly as a press anywhere else on the tile does.
  See docs/features/media-grid-and-selection.md.
*/
function passThrough() {
  if (!props.readonly) return false
  activate()
  return true
}

/** The pencil's own event, so a read-only wall can route it through `passThrough`. */
function edit() {
  if (passThrough()) return
  emit('edit', props.media)
}

/** The browser's menu is **replaced**, not merely suppressed - it already was,
 *  since a long press here means "select". See docs/features/media-grid-and-selection.md. */
function onContextMenu(event) {
  emit('context', { media: props.media, x: event.clientX, y: event.clientY })
}

/*
  A tap is read from the touch, not waited for as a click - a browser invents the
  click only if it decides the touch belonged to the page, and after a quick
  swipe it decides otherwise. A mouse still comes through `click`.
  See docs/features/media-grid-and-selection.md.
*/
const TAP_SLOP = 10

let tap = null
/** When a tap was answered, so the click it may invent is recognised as its own. */
let answeredAt = 0

function onTouchStart(event) {
  const touch = event.changedTouches[0]
  tap = touch ? { x: touch.clientX, y: touch.clientY, selecting: editor.selectionMode } : null
}

function onTouchEnd(event) {
  const start = tap
  tap = null

  const touch = event.changedTouches[0]
  if (!start || !touch) return
  if (Math.hypot(touch.clientX - start.x, touch.clientY - start.y) > TAP_SLOP) return

  // A press held long enough to open selection mode is a long press, and the
  // grid has already answered it by selecting this very tile.
  if (!start.selecting && editor.selectionMode) return

  // Answered here, so the invented click must not land as well: it is aimed at
  // where the finger was, and the viewer is open over that spot by then.
  if (event.cancelable) event.preventDefault()
  answeredAt = performance.now()
  activate()
}

function onTouchCancel() {
  tap = null
}

function onClick() {
  // Timed rather than flagged: `preventDefault` above usually stops the invented
  // click from being made at all, and a flag waiting to be cleared by it would
  // sit there and swallow a real one from a mouse.
  if (performance.now() - answeredAt < GHOST_CLICK_MS) return
  activate()
}

/**
 * Plain activation only. The press-and-drag paint gesture and the long-press
 * that enters selection mode both live in MediaGrid, which owns the pointer
 * events across the whole grid; this decides open-vs-toggle once a press has
 * been settled as a plain one.
 */
function activate() {
  if (props.editable && editor.selectionMode) {
    editor.toggle(props.media)
    return
  }
  // Says which tile this is, so the viewer flies out of *this* one rather than
  // out of whichever copy of the file the document happens to hold first.
  markOpenedFrom(root.value)
  emit('open', props.media)
}
</script>

<template>
  <div
    ref="root"
    class="group tile-motion relative"
    :class="[dimmed ? 'dim-tile' : '', faded ? 'emphasis-dim' : '']"
    :data-media-id="media.id"
  >
    <!-- `touch-pan-y`, not `touch-none`: the browser must keep handling vertical
         scrolling, or a finger landing on a tile pins the page. The paint
         gesture only needs the long press and the horizontal axis. -->
    <button
      type="button"
      class="block w-full touch-pan-y select-none overflow-hidden rounded-md bg-edge/40 transition"
      :class="outlineClass"
      :aria-label="label"
      :aria-pressed="editor.selectionMode ? selected : undefined"
      @click="onClick"
      @touchstart.passive="onTouchStart"
      @touchend="onTouchEnd"
      @touchcancel="onTouchCancel"
      @contextmenu.prevent="onContextMenu"
    >
      <!-- Fixed square keeps the grid from reflowing while previews arrive. -->
      <div class="relative aspect-square">
        <MediaThumb :media="media" :alt="label" />

        <!-- Bottom right, clear of the video badge on the left. A page that
             asked only for the time asked for it on approach, and gets the same
             quiet treatment as the pencil beside it: printed on every tile of a
             wall meant for reading, it would be noise. -->
        <span
          v-if="stampDate || stampTime"
          class="pointer-events-none absolute bottom-1.5 right-1.5 rounded bg-ink/70 px-1.5 py-0.5 text-[10px] font-medium text-paper"
          :class="stampDate ? '' : 'hover-reveal hover-reveal-quiet'"
        >
          {{ stampDate }}
          <!-- Only alongside a date does the time need revealing on its own; a
               tile showing the time and nothing else reveals the whole badge. -->
          <span v-if="stampTime" :class="stampDate ? 'hidden group-hover:inline' : ''">
            {{ stampTime }}
          </span>
        </span>

        <!-- One row in one corner: a file can be both a video and hidden. The
             hidden mark comes first and carries a word.
             See docs/features/media-grid-and-selection.md. -->
        <span
          v-if="video || hidden"
          class="pointer-events-none absolute bottom-1.5 left-1.5 flex items-center gap-1"
        >
          <span
            v-if="hidden"
            class="flex items-center gap-1 rounded bg-accent px-1.5 py-0.5 text-[10px] font-medium text-paper"
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
          </span>

          <span
            v-if="video"
            class="flex items-center gap-1 rounded bg-ink/70 px-1.5 py-0.5 text-[10px] font-medium text-paper"
          >
            <svg class="h-3 w-3" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
              <path d="M3.5 2.5v7l6-3.5z" />
            </svg>
            {{ t('media.video') }}
          </span>
        </span>

        <span
          v-if="selected"
          class="pointer-events-none absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-paper"
          aria-hidden="true"
        >
          <svg
            class="h-3 w-3"
            viewBox="0 0 12 12"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="m2.5 6.5 2.5 2.5 4.5-5" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </span>
      </div>
    </button>

    <!--
      Star on the left, pencil on the right. A marked file shows its star at all
      times; an unmarked one offers it the way the pencil is offered.
    -->
    <button
      v-if="editable && !editor.selectionMode"
      type="button"
      class="absolute left-1.5 top-1.5 rounded-md bg-paper/90 p-1.5 shadow-sm transition"
      :class="starClass"
      :title="readonly ? t('media.readonlyHint') : undefined"
      :aria-busy="marking"
      :aria-pressed="favorite"
      :aria-label="favorite ? t('media.unfavorite') : t('media.favorite')"
      @click.stop="mark"
    >
      <svg
        class="h-3.5 w-3.5"
        viewBox="0 0 16 16"
        :fill="favorite ? 'currentColor' : 'none'"
        stroke="currentColor"
        stroke-width="1.4"
        aria-hidden="true"
      >
        <path
          d="M8 1.8l1.9 3.9 4.3.6-3.1 3 .7 4.3L8 11.6l-3.8 2 .7-4.3-3.1-3 4.3-.6z"
          stroke-linejoin="round"
        />
      </svg>
    </button>

    <!-- Beside the star but **not** on the same terms: the badge already reports
         the state, so this appears on approach like the pencil.
         See docs/features/media-grid-and-selection.md. -->
    <button
      v-if="editable && !editor.selectionMode"
      type="button"
      class="absolute left-9 top-1.5 rounded-md bg-paper/90 p-1.5 shadow-sm transition"
      :class="[hidden ? 'text-accent' : 'text-ink', reveal]"
      :title="readonly ? t('media.readonlyHint') : undefined"
      :aria-busy="hiding"
      :aria-pressed="hidden"
      :aria-label="hidden ? t('media.unhide') : t('media.hide')"
      @click.stop="hide"
    >
      <svg
        class="h-3.5 w-3.5"
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
        <path v-if="hidden" d="M3 13 13 3" stroke-linecap="round" />
      </svg>
    </button>

    <!-- Pencil stays hidden until hover or keyboard focus, per the brief. -->
    <button
      v-if="editable && !editor.selectionMode"
      type="button"
      class="absolute right-1.5 top-1.5 rounded-md bg-paper/90 p-1.5 text-ink shadow-sm transition"
      :class="reveal"
      :title="readonly ? t('media.readonlyHint') : undefined"
      :aria-label="t('common.edit')"
      @click.stop="edit"
    >
      <svg
        class="h-3.5 w-3.5"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        stroke-width="1.6"
        aria-hidden="true"
      >
        <path d="M11 2.5 13.5 5 5.5 13H3v-2.5z" stroke-linejoin="round" />
      </svg>
    </button>
  </div>
</template>
