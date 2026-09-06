<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import ModalDialog from './ModalDialog.vue'
import { useUiStore } from '@/stores/ui'

/*
  The site's own answer to `window.confirm`, mounted once at app level and driven
  from the store. **Refusing is the default in every direction**; only the one
  button says yes. See docs/features/ui-shell.md.
*/
const { t } = useI18n()
const ui = useUiStore()

const question = computed(() => ui.question)
</script>

<template>
  <ModalDialog
    :open="Boolean(question)"
    stacked
    :title="question?.title ?? ''"
    @close="ui.settle(false)"
    @dismiss="ui.settle(false)"
  >
    <p class="whitespace-pre-line text-sm text-ink-soft">{{ question?.message }}</p>

    <template #footer>
      <button type="button" class="btn-ghost" @click="ui.settle(false)">
        {{ question?.cancelLabel ?? t('common.cancel') }}
      </button>
      <button
        type="button"
        :class="question?.tone === 'danger' ? 'btn-danger' : 'btn-primary'"
        @click="ui.settle(true)"
      >
        {{ question?.confirmLabel ?? t('common.confirm') }}
      </button>
    </template>
  </ModalDialog>
</template>
