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
  <!--
    The link is built on the slug, never on the caption.

    A caption can be rewritten, and it is different in each of the three
    languages — a link carrying it would break on the first rename and would send
    a Japanese reader to a search for a Russian word. The slug is one name for
    the tag across every locale, and unlike the numeric id it is readable in the
    address bar, which is where these links are read.

    Tags have no page of their own: a set of photographs sharing a tag *is* a
    search, and giving it a second route would be two names for one thing.
  -->
  <RouterLink
    :to="{ name: 'search', query: { tag: tag.slug } }"
    class="inline-flex items-center rounded-full border border-white/30 px-2.5 pt-0.5 pb-1 text-xs text-ink-soft transition hover:border-ink-faint hover:text-ink"
  >
    #{{ label }}
  </RouterLink>
</template>
