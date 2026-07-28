<script setup>
import { ref, computed, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import { useThemeStore } from '@/stores/theme'

const { t } = useI18n()
const theme = useThemeStore()

// A dropdown rather than a cycling button: with a "system" option the old
// single button showed what looked like the same theme twice, so the current
// choice was never clear. The menu names every option and ticks the active one.
const ICONS = { system: '◐', light: '☀', dark: '☾', black: '◍' }

const open = ref(false)
const root = ref(null)

const currentIcon = computed(() => ICONS[theme.preference])

function choose(next) {
  theme.set(next)
  open.value = false
}

function onDocClick(event) {
  if (root.value && !root.value.contains(event.target)) open.value = false
}

function toggle() {
  open.value = !open.value
  if (open.value) document.addEventListener('click', onDocClick)
  else document.removeEventListener('click', onDocClick)
}

onBeforeUnmount(() => document.removeEventListener('click', onDocClick))
</script>

<template>
  <div ref="root" class="relative">
    <button
      type="button"
      class="flex items-center gap-1 rounded px-1.5 py-1 text-sm text-ink-soft transition hover:bg-edge/60 hover:text-ink"
      :aria-label="`${t('theme.label')}: ${t('theme.' + theme.preference)}`"
      :aria-expanded="open"
      @click.stop="toggle"
    >
      <span aria-hidden="true">{{ currentIcon }}</span>
      <svg
        class="h-3 w-3 text-ink-faint"
        viewBox="0 0 12 12"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
        aria-hidden="true"
      >
        <path d="M3 4.5 6 7.5 9 4.5" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </button>

    <Transition
      enter-from-class="-translate-y-1 opacity-0"
      enter-active-class="transition duration-150"
      leave-to-class="-translate-y-1 opacity-0"
      leave-active-class="transition duration-150"
    >
      <ul
        v-if="open"
        class="absolute right-0 z-40 mt-1 w-44 overflow-hidden rounded-md border border-edge bg-paper-raised py-1 shadow-lg"
        role="menu"
      >
        <li v-for="option in theme.THEME_OPTIONS" :key="option">
          <button
            type="button"
            role="menuitemradio"
            :aria-checked="theme.preference === option"
            class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition hover:bg-edge/50"
            :class="theme.preference === option ? 'text-ink' : 'text-ink-soft'"
            @click="choose(option)"
          >
            <span class="w-4 text-center" aria-hidden="true">{{ ICONS[option] }}</span>
            <span class="flex-1">{{ t(`theme.${option}`) }}</span>
            <svg
              v-if="theme.preference === option"
              class="h-3.5 w-3.5 text-accent"
              viewBox="0 0 14 14"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              aria-hidden="true"
            >
              <path d="m3 7.5 2.5 2.5 5.5-6" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </button>
        </li>
      </ul>
    </Transition>
  </div>
</template>
