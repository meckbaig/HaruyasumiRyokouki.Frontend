<script setup>
import { computed, ref, onBeforeUnmount } from 'vue'
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
let closeTimer = null

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

function openHover(part, event) {
  cancelClose()
  hover.value = { part, rect: event.currentTarget.getBoundingClientRect() }
}

function scheduleClose() {
  cancelClose()
  closeTimer = window.setTimeout(() => {
    hover.value = null
    closeTimer = null
  }, CLOSE_DELAY)
}

function cancelClose() {
  if (closeTimer) {
    clearTimeout(closeTimer)
    closeTimer = null
  }
}

function closeHover() {
  cancelClose()
  hover.value = null
}

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

onBeforeUnmount(cancelClose)
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
        @mouseenter="openHover(part, $event)"
        @mouseleave="scheduleClose"
        @focus="openHover(part, $event)"
        @blur="scheduleClose"
        @click.stop="activate(part)"
      >
        {{ labelFor(part) }}
      </button>
      <template v-else>{{ part.text }}</template>
    </template>

    <Teleport to="body">
      <MediaHoverCard
        v-if="hover"
        :media="hover.part.media"
        :label="labelFor(hover.part)"
        :anchor-rect="hover.rect"
        @enter="cancelClose"
        @leave="scheduleClose"
        @close="closeHover"
        @open="open(hover.part)"
      />
    </Teleport>
  </span>
</template>
