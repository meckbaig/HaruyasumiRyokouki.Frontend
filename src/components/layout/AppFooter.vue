<script setup>
import { useI18n } from 'vue-i18n'
import { copyHomeUrl } from '@/services/share'
import { useUiStore } from '@/stores/ui'

const { t } = useI18n()
const ui = useUiStore()

const authorName = import.meta.env.VITE_AUTHOR_NAME || 'meckbaig'
const authorGithub = import.meta.env.VITE_AUTHOR_GITHUB || ''

// Shares the home page (with the active ?lang), so the whole site is shareable
// from anywhere, not just a day via its header button. Feedback via a toast.
async function shareSite() {
  const copied = await copyHomeUrl()
  ui.notify(copied ? t('common.shareCopied') : t('common.shareFailed'), copied ? 'info' : 'error')
}
</script>

<template>
  <footer class="mt-12 border-t border-edge">
    <div
      class="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-4 text-sm text-ink-soft sm:flex-row sm:items-center sm:justify-between"
    >
      <p class="max-w-prose">{{ t('footer.aboutText') }}</p>

      <div class="shrink-0 sm:text-left">
        <p>
          {{ t('footer.developer') }}:
          <a
            v-if="authorGithub"
            :href="authorGithub"
            target="_blank"
            rel="noopener noreferrer"
            class="text-ink underline decoration-edge underline-offset-4 transition hover:decoration-ink-faint"
          >
            {{ authorName }}
          </a>
          <span v-else class="text-ink">{{ authorName }}</span>
        </p>
        <button
          type="button"
          class="mt-1 text-xs text-ink-faint underline decoration-edge underline-offset-4 transition hover:text-ink hover:decoration-ink-faint"
          @click="shareSite"
        >
          {{ t('common.share') }}
        </button>
      </div>
    </div>
  </footer>
</template>
