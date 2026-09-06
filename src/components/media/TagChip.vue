<script setup>
import { computed } from 'vue'
import { useUiStore } from '@/stores/ui'
import { tagLabel } from '@/services/tags'

const props = defineProps({
  /** `TagPublicDto` from a media file, or a full `TagDto` from the dictionary. */
  tag: { type: Object, required: true },
})

const ui = useUiStore()
const label = computed(() => tagLabel(props.tag, ui.locale))
</script>

<template>
  <!-- The link is built on the **slug**, never the caption, and points at a
       search - a tag has no page of its own. See docs/features/tags.md. -->
  <RouterLink
    :to="{ name: 'search', query: { tag: tag.slug } }"
    class="inline-flex items-center rounded-full border border-white/30 px-2.5 pt-0.5 pb-1 text-xs text-ink-soft transition hover:border-ink-faint hover:text-ink"
  >
    #{{ label }}
  </RouterLink>
</template>
