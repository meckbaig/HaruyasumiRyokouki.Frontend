<script setup>
import { ref, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'

const props = defineProps({
  /** Larger treatment for the landing page. */
  size: { type: String, default: 'normal' },
  autofocus: { type: Boolean, default: false },
})

const emit = defineEmits(['submitted'])

const { t } = useI18n()
const router = useRouter()
const route = useRoute()

const text = ref(String(route.query.text ?? ''))

// Keep the field in step with the URL — the query is the source of truth, and it
// changes on back/forward and when a tag chip navigates here.
watch(
  () => route.query.text,
  (next) => {
    text.value = String(next ?? '')
  },
)

function submit() {
  const trimmed = text.value.trim()
  if (!trimmed) return
  router.push({ name: 'search', query: { text: trimmed } })
  emit('submitted')
}

function clear() {
  text.value = ''
}
</script>

<template>
  <form
    role="search"
    class="flex w-full items-center gap-2 rounded-full border border-edge bg-paper-raised px-4 transition focus-within:border-ink-faint"
    :class="props.size === 'large' ? 'py-3' : 'py-1.5'"
    @submit.prevent="submit"
  >
    <svg
      class="h-4 w-4 shrink-0 text-ink-faint"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
      aria-hidden="true"
    >
      <circle cx="9" cy="9" r="5.5" />
      <path d="m13.5 13.5 3 3" stroke-linecap="round" />
    </svg>

    <input
      v-model="text"
      type="search"
      :placeholder="t('search.placeholder')"
      :aria-label="t('search.submit')"
      :autofocus="props.autofocus"
      class="min-w-0 flex-1 bg-transparent text-ink outline-none placeholder:text-ink-faint"
      :class="props.size === 'large' ? 'text-lg' : 'text-sm'"
    />

    <button
      v-if="text"
      type="button"
      class="shrink-0 rounded p-1 text-ink-faint transition hover:text-ink"
      :aria-label="t('search.clear')"
      @click="clear"
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
  </form>
</template>
