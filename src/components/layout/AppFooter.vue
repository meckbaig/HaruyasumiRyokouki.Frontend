<script setup>
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const authorName = import.meta.env.VITE_AUTHOR_NAME || 'meckbaig'
const authorGithub = import.meta.env.VITE_AUTHOR_GITHUB || ''
</script>

<template>
  <footer class="mt-12 border-t border-edge">
    <div
      class="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-4 text-sm text-ink-soft sm:flex-row sm:items-center sm:justify-between"
    >
      <p class="max-w-prose">{{ t('footer.aboutText') }}</p>

      <p class="shrink-0">
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
    </div>
  </footer>
</template>
