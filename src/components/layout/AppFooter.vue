<script setup>
import { useI18n } from 'vue-i18n'
import { copyHomeUrl } from '@/services/share'
import { useUiStore } from '@/stores/ui'
import { useAuthStore } from '@/stores/auth'
import { useMotionStore } from '@/stores/motion'
import * as release from '@/services/release'

const { t } = useI18n()
const ui = useUiStore()
const auth = useAuthStore()
const motion = useMotionStore()

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
      <div class="max-w-prose">
        <p>{{ t('footer.aboutText') }}</p>

        <!--
          Editor-only: the site respects the OS "reduce motion" setting, and this
          opts back into animation for someone who turned it off system-wide but
          wants it here. Not worth putting in front of visitors.
        -->
        <label
          v-if="auth.isEditor"
          class="mt-2 flex cursor-pointer items-center gap-2 text-xs text-ink-faint"
        >
          <input
            type="checkbox"
            class="peer sr-only"
            :checked="motion.preference === 'always'"
            @change="motion.toggle()"
          />
          <span
            class="relative h-4 w-7 rounded-full bg-edge transition peer-checked:bg-accent peer-checked:[&>span]:translate-x-3"
            aria-hidden="true"
          >
            <span class="absolute left-0.5 top-0.5 h-3 w-3 rounded-full bg-paper-raised transition" />
          </span>
          {{ t('footer.forceMotion') }}
        </label>
      </div>

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

        <!-- The build stamp answers what a version number cannot: whether what
             is deployed is what was last built. Kept to the tooltip, since it
             only matters when something looks stale. -->
        <p class="mt-1 text-xs text-ink-faint" :title="`build ${release.build}`">
          {{ release.label }}
        </p>
      </div>
    </div>
  </footer>
</template>
