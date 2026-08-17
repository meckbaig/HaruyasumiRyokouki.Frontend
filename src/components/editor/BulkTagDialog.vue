<script setup>
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import ModalDialog from '@/components/common/ModalDialog.vue'
import TagPicker from './TagPicker.vue'
import { addTagToMedia } from '@/api/tags'
import { useTagsStore } from '@/stores/tags'
import { useUiStore } from '@/stores/ui'
import { addTagLocally } from '@/services/mediaEdits'

const props = defineProps({
  open: { type: Boolean, default: false },
  /** The selected files. Only their ids are used. */
  items: { type: Array, default: () => [] },
})

const emit = defineEmits(['close', 'applied'])

const { t } = useI18n()
const tags = useTagsStore()
const ui = useUiStore()

/*
  Adding tags to a selection, as opposed to editing it.

  The bulk editor next to this one *replaces* — it is the right tool for saying
  what a set of files should be, and the wrong one for saying "these are all of
  the festival too". `POST /tags/{id}/media` adds and leaves everything else
  alone, which is what filing by subject needs: the files being touched have
  other tags, and those are none of this operation's business.

  So the two buttons are genuinely two operations rather than one with a switch,
  and this one is deliberately the narrower of them.
*/
const slugs = ref([])
const applying = ref(false)
/** `{ done, total }` while the tags go over one request at a time. */
const progress = ref(null)

const ids = computed(() => props.items.map((media) => media?.id).filter((id) => id != null))
const canApply = computed(() => !applying.value && slugs.value.length > 0 && ids.value.length > 0)

// Each opening starts from nothing: what was handed out last time says nothing
// about what this selection needs.
watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      slugs.value = []
      progress.value = null
    }
  },
)

async function apply() {
  if (!canApply.value) return

  applying.value = true
  progress.value = { done: 0, total: slugs.value.length }
  let done = 0

  try {
    // One tag per request, in sequence: the progress stays honest, and a failure
    // halfway leaves a clear account of what did land.
    for (const slug of slugs.value) {
      const tag = tags.getBySlug(slug)
      if (!tag?.id) continue
      await addTagToMedia(tag.id, ids.value)
      // The selection *is* what the page is showing, so the tag goes onto those
      // objects and appears wherever they are drawn — no refetch, no reload.
      for (const media of props.items) addTagLocally(media, tag, ui.locale)
      // Usage counts order every tag list on the site; kept true here rather
      // than waiting for the dictionary to be fetched again.
      tags.upsert({ ...tag, usageCount: (tag.usageCount ?? 0) + ids.value.length })
      done += 1
      progress.value = { done, total: slugs.value.length }
    }

    ui.notify(t('bulkTag.applied', { count: ids.value.length }, ids.value.length), 'success')
    emit('applied')
    emit('close')
  } catch (error) {
    ui.notify(error?.detail || error?.title || t('errors.generic'), 'error')
  } finally {
    applying.value = false
    progress.value = null
  }
}
</script>

<template>
  <ModalDialog
    :open="open"
    :title="t('bulkTag.title', { count: items.length })"
    @close="emit('close')"
  >
    <div class="space-y-4">
      <p class="rounded-md bg-edge/40 px-3 py-2 text-xs text-ink-soft">
        {{ t('bulkTag.hint') }}
      </p>

      <TagPicker v-model="slugs" :disabled="applying" autofocus />
    </div>

    <template #footer>
      <span v-if="progress" class="mr-auto text-xs text-ink-faint">
        {{ t('similar.progress', { done: progress.done, total: progress.total }) }}
      </span>
      <button type="button" class="btn-ghost" @click="emit('close')">
        {{ t('common.cancel') }}
      </button>
      <button type="button" class="btn-primary" :disabled="!canApply" @click="apply">
        {{ applying ? t('common.saving') : t('bulkTag.apply') }}
      </button>
    </template>
  </ModalDialog>
</template>
