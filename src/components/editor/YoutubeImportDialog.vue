<script setup>
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import ModalDialog from '@/components/common/ModalDialog.vue'
import { importYoutubeMedia } from '@/api/media'
import { useUiStore } from '@/stores/ui'

const props = defineProps({
  open: { type: Boolean, default: false },
})

const emit = defineEmits(['close', 'imported'])

const { t } = useI18n()
const ui = useUiStore()

const url = ref('')
const busy = ref(false)
const error = ref(null)

/* A fresh open never inherits the last attempt's link or failure. */
watch(
  () => props.open,
  (isOpen) => {
    if (!isOpen) return
    url.value = ''
    error.value = null
    busy.value = false
  },
  { immediate: true },
)

/**
 * Hands the link to the server, which stores it as an external file (marked with
 * `source`) and answers with a `MediaFileEditDto`. That model is already
 * complete, so the caller opens the media editor on it directly.
 * See docs/features/day-editor-and-pending.md.
 */
async function submit() {
  const link = url.value.trim()
  if (!link || busy.value) return

  busy.value = true
  error.value = null
  try {
    const media = await importYoutubeMedia(link)
    if (!media) {
      error.value = { title: t('errors.generic') }
      return
    }
    ui.notify(t('admin.importYoutubeAdded'), 'success')
    emit('imported', media)
    emit('close')
  } catch (caught) {
    error.value = caught
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <ModalDialog
    :open="open"
    :title="t('admin.importYoutubeTitle')"
    @close="emit('close')"
    @dismiss="emit('close')"
  >
    <form class="space-y-4" @submit.prevent="submit">
      <div>
        <label class="field-label" for="youtube-url">{{ t('admin.youtubeUrl') }}</label>
        <!-- A plain text field with `inputmode="url"`: the browser's own URL
             validation would block submit with a bubble this app cannot translate. -->
        <input
          id="youtube-url"
          v-model="url"
          data-autofocus
          type="text"
          inputmode="url"
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
          class="field-input"
          placeholder="https://www.youtube.com/watch?v=..."
          :disabled="busy"
        />
        <p class="field-hint">{{ t('admin.youtubeUrlHint') }}</p>
      </div>

      <p v-if="error" role="alert" class="text-sm text-accent">
        {{ error.detail || error.title || t('errors.generic') }}
      </p>
    </form>

    <template #footer>
      <button type="button" class="btn-ghost" :disabled="busy" @click="emit('close')">
        {{ t('common.cancel') }}
      </button>
      <button type="button" class="btn-primary" :disabled="busy || !url.trim()" @click="submit">
        {{ busy ? t('admin.importYoutubeBusy') : t('admin.importYoutubeAction') }}
      </button>
    </template>
  </ModalDialog>
</template>
