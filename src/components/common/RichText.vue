<script setup>
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import MediaHoverCard from './MediaHoverCard.vue'
import { useHoverIntent } from '@/composables/useHoverIntent'
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
  The occurrence of each id, since one file may be referenced several times in
  the same text and the anchor has to name which of them was followed.
*/
const parts = computed(() => {
  const seen = new Map()
  return parseRichText(props.text).map((token, key) => {
    if (token.type !== 'media') return { ...token, key }
    const index = seen.get(token.id) ?? 0
    seen.set(token.id, index + 1)
    // Every id the reference names; one that is not on this page stays a null
    // rather than shortening the list, so the card can say so.
    const medias = token.ids.map((id) => byId.value.get(id) ?? null)
    return { ...token, key, index, medias, media: medias.find(Boolean) ?? null }
  })
})

function labelFor(part) {
  return part.label || part.media?.title || part.media?.fileName || t('richText.mediaMissing')
}

/** What the card is opened for: the reference, and where its own chip sits. */
function payloadFor(part, event) {
  return { part, rect: event.currentTarget.getBoundingClientRect() }
}

/*
  A hover belongs to a mouse alone. A touch reports an enter and a focus too,
  and answering either would put the card under the finger before its click
  arrives - which then lands on the card's own picture.
  See docs/features/rich-text-and-links.md.
*/
function onEnter(part, event) {
  if (event.pointerType !== 'mouse') return
  intent.hoverIn(payloadFor(part, event))
}

/** The hand left the text; from here its trajectory decides. */
function onLeave(event) {
  if (event.pointerType !== 'mouse') return
  intent.hoverOut(event)
}

function onFocus(part, event) {
  if (pointerIsTouch) return
  intent.openNow(payloadFor(part, event))
}

/** A card opened by a focus goes when the focus does. */
function onBlur() {
  if (pointerIsTouch) return
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

/** `mediaId` is the file the reader is looking at in the card, if there is one. */
function open(part, mediaId) {
  emit('media-open', reference(part, mediaId))
  intent.close()
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
    intent.close()
    return
  }
  intent.openNow({ ...payloadFor(part, event), byTouch: true })
}
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
      <!-- A chip wraps with the words around it, so it is an inline span wearing a
           button's role: a real `<button>` cannot break a line. -->
      <span
        v-else-if="part.type === 'media'"
        class="rich-media"
        :class="part.media ? '' : 'rich-media-missing'"
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
      <template v-else>{{ part.text }}</template>
    </template>

    <Teleport to="body">
      <!-- Keyed by the reference, so another one arriving while this leaves gives the
           transition two cards to play: a fade out where it stood, a fade in where the
           hand has gone. The leaving card answers no pointer, so it cannot swallow it. -->
      <Transition name="hover-card">
        <MediaHoverCard
          v-if="hover"
          :key="hover.part.key"
          :ref="setCardRoot"
          :medias="hover.part.medias"
          :label="labelFor(hover.part)"
          :anchor-rect="hover.rect"
          :touch="hover.byTouch"
          @enter="onCardEnter"
          @leave="onCardLeave"
          @activate="activate(hover.part)"
          @close="intent.close()"
          @open="open(hover.part, $event)"
        />
      </Transition>
    </Teleport>
  </span>
</template>
