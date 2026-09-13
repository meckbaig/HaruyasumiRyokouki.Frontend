<script setup>
import { computed, ref, watch, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import MediaHoverCard from './MediaHoverCard.vue'
import { parseRichText, linkLabel } from '@/services/richText'

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
})

/** Both events carry `{ mediaId, index }` - the occurrence, not just the file. */
const emit = defineEmits(['media-activate', 'media-open'])

const { t } = useI18n()

/** Time to carry the pointer from the text across to the card. */
const CLOSE_DELAY = 250

const hover = ref(null)
/** The card's own root, so a press outside it can be told from one on it. */
const cardRoot = ref(null)
let closeTimer = null
/** True while a card shown by a tap listens for a press anywhere to put it away. */
let dismissOn = false
/**
 * The pointer behind the last press. A tap focuses a reference as well as
 * clicking it, and a tap is not a hover - so the card waits for the click
 * rather than appearing under the finger.
 * See docs/features/rich-text-and-links.md.
 */
let pointerIsTouch = false

const byId = computed(() => new Map(props.media.map((item) => [item.id, item])))

/*
  The occurrence of each id, since one file may be referenced several times in
  the same text and the anchor has to name which of them was followed.
*/
const parts = computed(() => {
  const seen = new Map()
  return parseRichText(props.text).map((token, key) => {
    if (token.type !== 'media') return { ...token, key }
    const index = seen.get(token.id) ?? 0
    seen.set(token.id, index + 1)
    return { ...token, key, index, media: byId.value.get(token.id) ?? null }
  })
})

function labelFor(part) {
  return part.label || part.media?.title || part.media?.fileName || t('richText.mediaMissing')
}

function cancelClose() {
  if (closeTimer) {
    clearTimeout(closeTimer)
    closeTimer = null
  }
}

function scheduleClose() {
  cancelClose()
  closeTimer = window.setTimeout(() => {
    hover.value = null
    closeTimer = null
  }, CLOSE_DELAY)
}

function closeHover() {
  cancelClose()
  hover.value = null
}

/** `byTouch` marks a card shown by a tap, which no pointer is hovering to keep. */
function openCard(part, rect, byTouch = false) {
  cancelClose()
  hover.value = { part, rect, byTouch }
}

/*
  A hover belongs to a mouse alone. A touch reports an enter and a focus too,
  and answering either would put the card under the finger before its click
  arrives - which then lands on the card's own picture.
  See docs/features/rich-text-and-links.md.
*/
function onEnter(part, event) {
  if (event.pointerType !== 'mouse') return
  openCard(part, event.currentTarget.getBoundingClientRect())
}

function onLeave(event) {
  if (event.pointerType !== 'mouse') return
  scheduleClose()
}

function onFocus(part, event) {
  if (pointerIsTouch) return
  openCard(part, event.currentTarget.getBoundingClientRect())
}

function onBlur() {
  if (pointerIsTouch) return
  scheduleClose()
}

function onChipPointerDown(event) {
  pointerIsTouch = event.pointerType !== 'mouse'
}

/** The pointer is a mouse's; a card shown by a tap dismisses by hand instead. */
function onCardEnter() {
  if (hover.value?.byTouch) return
  cancelClose()
}

function onCardLeave() {
  if (hover.value?.byTouch) return
  scheduleClose()
}

/*
  A press anywhere puts a tapped card away, and the cross does the same. A press
  on a reference never reaches here - the reference stops it, since a tap on one
  is that reference's own toggle.
  See docs/features/rich-text-and-links.md.
*/
function onDocumentPointerDown(event) {
  if (cardRoot.value?.$el?.contains(event.target)) return
  closeHover()
}

function setDismissOn(next) {
  if (next === dismissOn) return
  dismissOn = next
  if (next) document.addEventListener('pointerdown', onDocumentPointerDown)
  else document.removeEventListener('pointerdown', onDocumentPointerDown)
}

watch(hover, (value) => setDismissOn(Boolean(value?.byTouch)))

/** The reference, named by file and by which mention of it was followed. */
function reference(part) {
  return { mediaId: part.id, index: part.index }
}

function activate(part) {
  emit('media-activate', reference(part))
  // The reader is moving to the tile; the card has said what it had to say.
  closeHover()
}

function open(part) {
  emit('media-open', reference(part))
  closeHover()
}

/*
  A mouse click follows the reference to its tile. A tap has no hover to show
  the card, so it shows the card instead; a second tap on the same reference
  puts it away. See docs/features/rich-text-and-links.md.
*/
function onClick(part, event) {
  if (!pointerIsTouch) {
    activate(part)
    return
  }
  if (hover.value?.part.key === part.key) {
    closeHover()
    return
  }
  openCard(part, event.currentTarget.getBoundingClientRect(), true)
}

onBeforeUnmount(() => {
  cancelClose()
  setDismissOn(false)
})
</script>

<template>
  <span class="rich-text">
    <template v-for="part in parts" :key="part.key">
      <a
        v-if="part.type === 'link'"
        :href="part.href"
        target="_blank"
        rel="noopener noreferrer"
        class="rich-link"
        @click.stop
        >{{ part.label || linkLabel(part.href) }}</a
      >
      <button
        v-else-if="part.type === 'media'"
        type="button"
        class="rich-media"
        :class="part.media ? '' : 'rich-media-missing'"
        :data-text-anchor="anchorable ? `${part.id}:${part.index}` : undefined"
        @pointerdown.stop="onChipPointerDown"
        @pointerenter="onEnter(part, $event)"
        @pointerleave="onLeave"
        @focus="onFocus(part, $event)"
        @blur="onBlur"
        @click.stop="onClick(part, $event)"
      >
        {{ labelFor(part) }}
      </button>
      <template v-else>{{ part.text }}</template>
    </template>

    <Teleport to="body">
      <Transition name="hover-card">
        <MediaHoverCard
          v-if="hover"
          ref="cardRoot"
          :media="hover.part.media"
          :label="labelFor(hover.part)"
          :anchor-rect="hover.rect"
          :touch="hover.byTouch"
          @enter="onCardEnter"
          @leave="onCardLeave"
          @activate="activate(hover.part)"
          @close="closeHover"
          @open="open(hover.part)"
        />
      </Transition>
    </Teleport>
  </span>
</template>
