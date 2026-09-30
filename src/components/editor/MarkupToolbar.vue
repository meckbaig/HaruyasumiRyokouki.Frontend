<script setup>
import { useI18n } from 'vue-i18n'

/*
  The controls a markup field wears: take an embed off, insert a media reference,
  insert a named link. Shared by the note and the description so the two fields
  cannot drift apart. See docs/features/rich-text-and-links.md.
*/
defineProps({
  /** A caret stands in a reference: the trash is offered. */
  canRemove: { type: Boolean, default: false },
  /** A pick is running: the media button is lit. */
  picking: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
})

defineEmits(['remove', 'media', 'link'])

const { t } = useI18n()
</script>

<template>
  <div class="flex gap-1">
    <!-- The leftmost control, and only while the caret stands in an embed:
         it takes the tags off and keeps the text inside. -->
    <Transition name="soft">
      <button
        v-if="canRemove"
        type="button"
        class="btn-ghost !px-2 !py-1 !text-xs"
        :title="t('richText.removeEmbed')"
        :aria-label="t('richText.removeEmbed')"
        :disabled="disabled"
        @click="$emit('remove')"
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
            d="M4 6h12M8.5 6V4.2h3V6M6.4 6l.7 9.3h5.8L13.6 6"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </button>
    </Transition>
    <button
      type="button"
      class="btn-ghost !px-2 !py-1 !text-xs"
      :class="picking ? 'border-accent text-accent' : ''"
      :title="t('richText.insertMediaHint')"
      :disabled="disabled"
      @click="$emit('media')"
    >
      {{ t('richText.insertMedia') }}
    </button>
    <button
      type="button"
      class="btn-ghost !px-2 !py-1 !text-xs"
      :title="t('richText.insertLinkHint')"
      :disabled="disabled"
      @click="$emit('link')"
    >
      {{ t('richText.insertLink') }}
    </button>
  </div>
</template>
