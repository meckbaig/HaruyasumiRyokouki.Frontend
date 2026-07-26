<script setup>
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { copyCurrentUrl } from '@/services/share'

const { t } = useI18n()

// Feedback shows right above the button rather than as a page-corner toast, so
// it is obvious which action it belongs to.
const feedback = ref(null)
let hideTimer = null

async function share() {
  const copied = await copyCurrentUrl()
  feedback.value = {
    ok: copied,
    text: copied ? t('common.shareCopied') : t('common.shareFailed'),
  }
  clearTimeout(hideTimer)
  hideTimer = setTimeout(() => (feedback.value = null), 2000)
}
</script>

<template>
  <div class="relative">
    <Transition
      enter-from-class="translate-y-1 opacity-0"
      enter-active-class="transition duration-150"
      leave-to-class="translate-y-1 opacity-0"
      leave-active-class="transition duration-150"
    >
      <span
        v-if="feedback"
        role="status"
        class="absolute bottom-full left-1/2 mb-2 -translate-x-1/2 whitespace-nowrap rounded-md px-2.5 py-1 text-xs shadow-sm"
        :class="feedback.ok ? 'bg-ink text-paper' : 'bg-accent-soft text-ink'"
      >
        {{ feedback.text }}
      </span>
    </Transition>

    <button
      type="button"
      class="inline-flex items-center gap-2 rounded-md border border-edge px-3 py-1.5 text-sm text-ink-soft transition hover:border-ink-faint hover:text-ink"
      @click="share"
    >
      <svg
        class="h-4 w-4"
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        stroke-width="1.6"
        aria-hidden="true"
      >
        <path d="M7.5 11.5 12.5 8.5M7.5 8.5l5 3" stroke-linecap="round" />
        <circle cx="5.5" cy="10" r="2.2" />
        <circle cx="14.5" cy="6.5" r="2.2" />
        <circle cx="14.5" cy="13.5" r="2.2" />
      </svg>
      {{ t('common.share') }}
    </button>
  </div>
</template>
