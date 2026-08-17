<script setup>
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import MediaEditDialog from './MediaEditDialog.vue'
import BulkTagDialog from './BulkTagDialog.vue'
import { useEditorStore } from '@/stores/editor'

const { t } = useI18n()
const editor = useEditorStore()

const editOpen = ref(false)
const tagOpen = ref(false)

function onSaved() {
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
        -->
        <button type="button" class="btn-ghost !px-3 !py-1.5" @click="tagOpen = true">
          {{ t('bulkTag.action') }}
        </button>

        <button type="button" class="btn-primary !px-3 !py-1.5" @click="editOpen = true">
          {{ t('common.edit') }}
        </button>

        <!-- The longest label of the four, and the one that needs a label least:
             a cross beside a count of what is selected says it on its own. -->
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
    @close="editOpen = false"
    @saved="onSaved"
  />

  <BulkTagDialog
    :open="tagOpen"
    :items="editor.items"
    @close="tagOpen = false"
    @applied="onSaved"
  />
</template>
