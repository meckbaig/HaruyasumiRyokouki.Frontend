<script setup>
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import MediaEditDialog from './MediaEditDialog.vue'
import BulkTagDialog from './BulkTagDialog.vue'
import { useEditorStore } from '@/stores/editor'
import { useUiStore } from '@/stores/ui'
import { deleteMedia } from '@/api/media'

const { t } = useI18n()
const editor = useEditorStore()
const ui = useUiStore()

const deleting = ref(false)
const editOpen = ref(false)
const tagOpen = ref(false)

/*
  Deleting the whole selection, asked for from the edit dialog's own delete
  button — the same button, and the same place, as deleting one file.

  Asked for through the site's own dialog rather than `window.confirm`, because
  this is the one irreversible action here and the question has to be able to say
  how many files it is about to take.

  One request per file — the API deletes by id — run in sequence so a failure
  halfway leaves a clear account of what did go, and so the pages hear about
  exactly those.
*/
async function removeSelection(list) {
  const ids = (list ?? editor.items).map((media) => media?.id).filter((id) => id != null)
  if (deleting.value || !ids.length) return

  const agreed = await ui.confirm({
    title: t('admin.deleteTitle'),
    message: t('admin.deleteConfirmMany', { count: ids.length }, ids.length),
    confirmLabel: t('common.delete'),
  })
  if (!agreed) return

  deleting.value = true
  const gone = []
  try {
    for (const id of ids) {
      await deleteMedia(id)
      gone.push(id)
    }
    ui.notify(t('admin.deletedMany', { count: gone.length }, gone.length), 'success')
  } catch (error) {
    ui.notify(error?.detail || error?.title || t('errors.generic'), 'error')
  } finally {
    deleting.value = false
    editOpen.value = false
    editor.reportDeleted(gone)
    editor.clear()
  }
}

/**
 * The toolbar floats above every page, so the page underneath never hears about
 * a bulk save. The record goes through the store instead — a queue of unfiled
 * media has to know that the files it is showing have just been approved.
 */
function onSaved(result) {
  editor.reportSaved(result)
  editor.clear()
}

/** Tagging changes nothing about whether a file is still waiting to be filed. */
function onTagged() {
  editor.clear()
}
</script>

<template>
  <!--
    Rendered once at app level so the selection survives navigation between the
    day page, search results and the pending panel.
  -->
  <Transition
    enter-from-class="translate-y-4 opacity-0"
    enter-active-class="transition duration-200"
    leave-to-class="translate-y-4 opacity-0"
    leave-active-class="transition duration-200"
  >
    <div
      v-if="editor.selectionMode && editor.count > 0"
      class="fixed inset-x-0 bottom-16 z-40 flex justify-center px-4"
    >
      <!--
        Wraps between its parts rather than off the side of a phone. Three
        controls and a count do not fit across 360 pixels in any language, and
        the rounding is squared off a little so that a second row still reads as
        one bar rather than as a pill that has burst.
      -->
      <div
        class="flex max-w-full flex-wrap items-center justify-center gap-x-3 gap-y-2 rounded-3xl border border-edge bg-paper-raised px-4 py-2 shadow-lg"
      >
        <span class="whitespace-nowrap text-sm text-ink">
          {{ t('common.selected', { count: editor.count }) }}
        </span>

        <!--
          Two operations, not one with a switch. Editing *replaces* what the
          selection carries; tagging adds to it and leaves the rest alone. Which
          is meant is a decision, and it is made here rather than inside a form.

          Deleting is not a third: it lives on the edit card, where deleting one
          file has always lived, so the bar is not the place that offers to
          destroy a selection in one press.
        -->
        <button type="button" class="btn-ghost !px-3 !py-1.5" @click="tagOpen = true">
          {{ t('bulkTag.action') }}
        </button>

        <button type="button" class="btn-primary !px-3 !py-1.5" @click="editOpen = true">
          {{ t('common.edit') }}
        </button>

        <!-- The longest label of the three, and the one that needs a label
             least: a cross beside a count of what is selected says it on its
             own. -->
        <button
          type="button"
          class="rounded-full p-1.5 text-ink-faint transition hover:text-ink"
          :title="t('common.clearSelection')"
          :aria-label="t('common.clearSelection')"
          @click="editor.clear()"
        >
          <svg
            class="h-4 w-4"
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            aria-hidden="true"
          >
            <path d="m6 6 8 8M14 6l-8 8" stroke-linecap="round" />
          </svg>
        </button>
      </div>
    </div>
  </Transition>

  <!-- The bulk editor is the same dialog as the single one, given the whole set. -->
  <MediaEditDialog
    :open="editOpen"
    :items="editor.items"
    deletable
    @close="editOpen = false"
    @saved="onSaved"
    @delete="removeSelection"
  />

  <BulkTagDialog
    :open="tagOpen"
    :items="editor.items"
    @close="tagOpen = false"
    @applied="onTagged"
  />
</template>
