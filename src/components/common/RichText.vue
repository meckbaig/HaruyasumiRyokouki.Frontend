<script setup>
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import MediaHoverCard from './MediaHoverCard.vue'
import { useHoverIntent } from '@/composables/useHoverIntent'
import { parseRichText, linkLabel, splitParagraphs } from '@/services/richText'
import { faviconUrl } from '@/services/favicons'
import { toParts } from '@/services/highlight'

/**
 * Renders the small markup day notes and media descriptions carry: links, and
 * media referenced by id with a hover card. Built from tokens rather than an
 * HTML string, so nothing in a note can inject markup.
 * See docs/features/rich-text-and-links.md.
 */
const props = defineProps({
  text: { type: String, default: '' },
  /** The files the text may refer to, by id. */
  media: { type: Array, default: () => [] },
  /**
   * Stamps each reference with a place of its own, so the page can find it again
   * and decide whether it is worth remembering as a way back. On for the day
   * note, off inside the viewer, where there is nowhere to return to.
   */
  anchorable: { type: Boolean, default: false },
  /**
   * Whether the page can show a file on the day's map. The card is also drawn
   * inside the viewer's description, where that action is not offered.
   * See docs/features/rich-text-and-links.md.
   */
  canShowOnMap: { type: Boolean, default: false },
  /**
   * Whether a blank line between two parts of the text is drawn as a gap of its
   * own - half a line rather than a whole one. On for the day note, where the
   * parts read as paragraphs, off inside the viewer's description.
   * See docs/features/rich-text-and-links.md.
   */
  halfBlankLines: { type: Boolean, default: false },
  /**
   * Match ranges in `text`'s own coordinates, drawn as marks inside the plain
   * runs. Search results pass their query's ranges; the other callers pass none.
   * See docs/features/rich-text-and-links.md.
   */
  ranges: { type: Array, default: () => [] },
  /**
   * Whether pointing at a reference shows the hover card. Off where the text is
   * shown away from the page that owns its files - a search result, a map card -
   * where a reference is a plain link and a miss is not marked.
   * See docs/features/rich-text-and-links.md.
   */
  preview: { type: Boolean, default: true },
  /**
   * Whether the card stays up while its own picture is open full screen, so the
   * picture can fly back into it. On for the day note, whose card stands beside
   * the line; off inside the viewer, which the card is already inside.
   * See docs/features/rich-text-and-links.md.
   */
  keepCardOnOpen: { type: Boolean, default: false },
  /**
   * Whether the viewer is open right now. Only read with `keepCardOnOpen`: while
   * it is, the card is held; when it closes the card becomes one shown by hand.
   * See docs/features/rich-text-and-links.md.
   */
  viewerOpen: { type: Boolean, default: false },
})

/** Each event carries `{ mediaId, index }` - the occurrence, not just the file. */
const emit = defineEmits(['media-activate', 'media-open', 'media-map'])

const { t } = useI18n()

const hover = ref(null)
/**
 * The card as it stands, measured to know where the hand could be going. A swap keeps two
 * of them on the page for the length of the fade - one leaving, one arriving - and a plain
 * ref would be dropped to null when the leaving one goes, taking the card the trajectory
 * is aiming at with it. So the newest wins, and a null is ignored.
 */
const cardRoot = ref(null)

function setCardRoot(instance) {
  if (instance) cardRoot.value = instance
}

/*
  When the card opens and closes - the hand's own trajectory, a keyboard focus, a tap
  on a touch screen - is the composable's business: this component only says what the
  card shows. See docs/features/rich-text-and-links.md.
*/
const intent = useHoverIntent({
  card: cardRoot,
  onOpen: (next) => {
    hover.value = next
  },
  onClose: () => {
    hover.value = null
  },
})

/**
 * The pointer behind the last press. A tap focuses a reference as well as
 * clicking it, and a tap is not a hover - so the card waits for the click
 * rather than appearing under the finger.
 * See docs/features/rich-text-and-links.md.
 */
let pointerIsTouch = false

const byId = computed(() => new Map(props.media.map((item) => [item.id, item])))

/*
  A plain run split by the match ranges that fall inside it, so a search result
  keeps its highlighting inside rich text. Null when there is nothing to mark.
*/
function textPieces(start, text) {
  if (!props.ranges.length || !text) return null
  const local = []
  for (const [from, to] of props.ranges) {
    if (to <= start || from >= start + text.length) continue
    local.push([Math.max(0, from - start), Math.min(text.length, to - start)])
  }
  return local.length ? toParts(text, local) : null
}

/*
  The occurrence of each id, since one file may be referenced several times in
  the same text and the anchor has to name which of them was followed. A token's
  own offset is tracked so a plain run can be split by the match ranges.
*/
const parts = computed(() => {
  const seen = new Map()
  let offset = 0
  return parseRichText(props.text).map((token, key) => {
    const start = offset
    offset += token.raw.length
    if (token.type === 'link') return { ...token, key, favicon: faviconUrl(token.href) }
    if (token.type !== 'media') return { ...token, key, pieces: textPieces(start, token.text) }
    const index = seen.get(token.id) ?? 0
    seen.set(token.id, index + 1)
    // Every id the reference names; one that is not on this page stays a null
    // rather than shortening the list, so the card can say so.
    const medias = token.ids.map((id) => byId.value.get(id) ?? null)
    return { ...token, key, index, medias, media: medias.find(Boolean) ?? null }
  })
})

/*
  The parts, grouped into the blocks a blank line divides. The keys are remade
  here, since one token may be split across two blocks.
  See docs/features/rich-text-and-links.md.
*/
const paragraphs = computed(() => {
  // Without splitting the parts keep their own keys and their marks.
  if (!props.halfBlankLines) return [parts.value]
  // A split run loses its offset, so its marks are dropped. The day note, the
  // one caller, passes no ranges anyway.
  let key = 0
  return splitParagraphs(parts.value).map((group) =>
    group.map((part) => ({ ...part, key: key++, pieces: null })),
  )
})

function labelFor(part) {
  return part.label || part.media?.title || part.media?.fileName || t('richText.mediaMissing')
}

/**
 * The rectangle the card is placed against: the **line fragment** the hand is
 * over, not the whole chip. A chip that wraps spans both margins, so its union
 * box would put the card past the whole block.
 * See docs/features/rich-text-and-links.md.
 */
function payloadFor(part, event) {
  return { part, rect: fragmentRect(event.currentTarget, event) }
}

/** The chip's box, narrowed to the line the pointer is on when its label wraps. */
function fragmentRect(el, event) {
  const rects = el.getClientRects()
  if (rects.length <= 1 || event.clientX == null) return el.getBoundingClientRect()
  const { clientX: x, clientY: y } = event
  let best = rects[0]
  let bestGap = Infinity
  for (const rect of rects) {
    const inside = y >= rect.top && y <= rect.bottom && x >= rect.left && x <= rect.right
    if (inside) return rect
    // Not on a fragment: keep the one nearest the hand's line.
    const gap = Math.max(0, rect.top - y, y - rect.bottom)
    if (gap < bestGap) {
      bestGap = gap
      best = rect
    }
  }
  return best
}

/** A site with no icon leaves no gap: the mark is dropped, the label stays. */
function onIconError(event) {
  event.currentTarget.hidden = true
}

/*
  A hover belongs to a mouse alone. A touch reports an enter and a focus too,
  and answering either would put the card under the finger before its click
  arrives - which then lands on the card's own picture.
  See docs/features/rich-text-and-links.md.
*/
function onEnter(part, event) {
  if (!props.preview) return
  if (event.pointerType !== 'mouse') return
  intent.hoverIn(payloadFor(part, event))
}

/** The hand left the text; from here its trajectory decides. */
function onLeave(event) {
  if (event.pointerType !== 'mouse') return
  intent.hoverOut(event)
}

function onFocus(part, event) {
  if (!props.preview) return
  if (pointerIsTouch) return
  intent.openNow(payloadFor(part, event))
}

/*
  A card opened by a focus goes when the focus does, but a press on the card's
  controls moves the focus there first: that blur must not take the card away
  before the press lands, or the leaving card (`pointer-events: none`) eats the
  click. See docs/features/rich-text-and-links.md.
*/
function onBlur(event) {
  if (pointerIsTouch) return
  const card = cardRoot.value?.$el ?? cardRoot.value
  if (card?.contains?.(event?.relatedTarget)) return
  intent.close()
}

function onChipPointerDown(event) {
  pointerIsTouch = event.pointerType !== 'mouse'
}

function onCardEnter() {
  intent.cardIn()
}

function onCardLeave(event) {
  intent.cardOut(event)
}

/**
 * The reference: every file it names, and which mention of it was followed.
 * `mediaId` stays the single file the reference is anchored by - the one the
 * address carries and the one the text is returned to.
 */
function reference(part, mediaId) {
  return { mediaId: mediaId ?? part.ids[0], ids: part.ids, index: part.index }
}

function activate(part) {
  emit('media-activate', reference(part))
  // The reader is moving to the tile; the card has said what it had to say.
  intent.close()
}

/** The day's map, for the file the reader is looking at in the card. */
function showOnMap(part, mediaId) {
  emit('media-map', reference(part, mediaId))
  intent.close()
}

/** `mediaId` is the file the reader is looking at in the card, if there is one. */
function open(part, mediaId) {
  emit('media-open', reference(part, mediaId))
  // The card stays while the viewer it opened is up, so the picture has a mark
  // to fly back into; otherwise it has said what it had to say.
  if (props.keepCardOnOpen) intent.hold()
  else intent.close()
}

/*
  The viewer the card opened has closed: the card becomes one shown by hand,
  dismissed by a press outside it or by its cross. A viewer opened from
  elsewhere never held it, so release is a no-op.
  See docs/features/rich-text-and-links.md.
*/
watch(
  () => props.viewerOpen,
  (isOpen) => {
    if (props.keepCardOnOpen && !isOpen) intent.release()
  },
)

/*
  A mouse click follows the reference to its tile. A tap has no hover to show
  the card, so it shows the card instead; a second tap on the same reference
  puts it away. See docs/features/rich-text-and-links.md.
*/
function onClick(part, event) {
  // With no card to show, a press always follows the reference.
  if (!props.preview) {
    activate(part)
    return
  }
  if (!pointerIsTouch) {
    activate(part)
    return
  }
  if (hover.value?.part.key === part.key) {
    intent.close()
    return
  }
  intent.openNow({ ...payloadFor(part, event), byTouch: true })
}
</script>

<template>
  <span class="rich-text">
    <!-- Each block is a paragraph when the page asks for them to be drawn
         apart; a single block otherwise, exactly as before. -->
    <template v-for="(group, groupIndex) in paragraphs" :key="groupIndex">
      <span :class="halfBlankLines ? 'rich-paragraph' : null">
        <template v-for="part in group" :key="part.key">
          <!-- The icon and the label are written with no space between them:
               the note renders under `pre-wrap`, so a literal newline would
               become a line break. The gap is the icon's own margin. -->
          <a
            v-if="part.type === 'link'"
            :href="part.href"
            target="_blank"
            rel="noopener noreferrer"
            class="rich-link"
            @click.stop
            ><img
              v-if="part.favicon"
              class="rich-favicon"
              :src="part.favicon"
              alt=""
              loading="lazy"
              decoding="async"
              referrerpolicy="no-referrer"
              @error="onIconError"
            />{{ part.label || linkLabel(part.href) }}</a
          >
          <!-- A chip wraps with the words around it, so it is an inline span wearing a
               button's role: a real `<button>` cannot break a line. -->
          <span
            v-else-if="part.type === 'media'"
            class="rich-media"
            :class="part.media || !preview ? '' : 'rich-media-missing'"
            role="button"
            tabindex="0"
            :data-text-anchor="anchorable ? `${part.id}:${part.index}` : undefined"
            @pointerdown.stop="onChipPointerDown"
            @pointerenter="onEnter(part, $event)"
            @pointerleave="onLeave($event)"
            @focus="onFocus(part, $event)"
            @blur="onBlur"
            @keydown.enter.prevent="activate(part)"
            @keydown.space.prevent="activate(part)"
            @click.stop="onClick(part, $event)"
          >
            {{ labelFor(part) }}
          </span>
          <template v-else-if="part.pieces">
            <template v-for="(piece, pieceIndex) in part.pieces" :key="pieceIndex">
              <mark v-if="piece.match" class="rounded-sm bg-accent-soft px-0.5 text-ink">{{
                piece.text
              }}</mark>
              <template v-else>{{ piece.text }}</template>
            </template>
          </template>
          <template v-else>{{ part.text }}</template>
        </template>
      </span>
    </template>

    <Teleport v-if="preview" to="body">
      <!-- Keyed by the reference, so another one arriving while this leaves gives the
           transition two cards to play: a fade out where it stood, a fade in where the
           hand has gone. The leaving card answers no pointer, so it cannot swallow it. -->
      <Transition name="hover-card">
        <MediaHoverCard
          v-if="hover"
          :key="hover.part.key"
          :ref="setCardRoot"
          :class="{ 'media-hover-card-held': keepCardOnOpen }"
          :medias="hover.part.medias"
          :label="labelFor(hover.part)"
          :anchor-rect="hover.rect"
          :touch="hover.byTouch"
          :can-show-on-map="canShowOnMap"
          @enter="onCardEnter"
          @leave="onCardLeave"
          @activate="activate(hover.part)"
          @close="intent.close()"
          @open="open(hover.part, $event)"
          @map="showOnMap(hover.part, $event)"
        />
      </Transition>
    </Teleport>
  </span>
</template>
