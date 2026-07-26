<script setup>
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import MediaEditDialog from './MediaEditDialog.vue'
import { useEditorStore } from '@/stores/editor'

const { t } = useI18n()
const editor = useEditorStore()

const editOpen = ref(false)

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
      <div
        class="flex items-center gap-3 rounded-full border border-edge bg-paper-raised px-4 py-2 shadow-lg"
      >
        <span class="text-sm text-ink">{{ t('common.selected', { count: editor.count }) }}</span>

        <button type="button" class="btn-primary !px-3 !py-1.5" @click="editOpen = true">
          {{ t('common.edit') }}
        </button>

        <button
          type="button"
          class="text-sm text-ink-faint transition hover:text-ink"
          @click="editor.clear()"
        >
          {{ t('common.clearSelection') }}
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
</template>
