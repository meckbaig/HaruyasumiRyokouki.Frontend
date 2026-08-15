<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { fetchTagSuggestions } from '@/api/tags'
import { useSearchStore } from '@/stores/search'
import { useTagsStore } from '@/stores/tags'
import { useUiStore } from '@/stores/ui'
import { tagLabel } from '@/services/tags'

const props = defineProps({
  /** Larger treatment for the landing page. */
  size: { type: String, default: 'normal' },
  autofocus: { type: Boolean, default: false },
})

const emit = defineEmits(['submitted'])

const { t } = useI18n()
const router = useRouter()
const route = useRoute()
const search = useSearchStore()
const tags = useTagsStore()
const ui = useUiStore()

const text = ref(String(route.query.text ?? ''))
const field = ref(null)

/*
  Tag suggestions.

  This is what makes the vocabulary usable by someone who has never seen it. No
  operators, no syntax, no prefix to learn: the visitor types, and the tags that
  answer to what they typed drop down underneath — matched on their aliases as
  well as their captions, so "noodles" offers "ramen" though the word "noodles"
  appears on nothing. Picking one searches by its id; pressing Enter searches for
  the words themselves. Both are always available, and neither has to be
  discovered.

  Debounced rather than fired per keystroke, because this one *is* a request:
  the dictionary behind it is the editor's, and a visitor has no copy of it.
*/
const DEBOUNCE_MS = 200
const TAKE = 8

const suggestions = ref([])
const listOpen = ref(false)
/** Row under the keyboard, from 0; `suggestions.length` is the free-search row. */
const cursor = ref(-1)

let debounceTimer = null
let controller = null

/** The tag this page is filtering by, drawn as a chip inside the field. */
const routeTagSlug = computed(() => String(route.query.tag ?? '').trim())

/*
  Taking the chip off is about the field, not about the page.

  It used to navigate — and the only honest place to navigate to, with nothing
  typed and nothing to search for, was home. Which threw away the results the
  reader was looking at in order to answer a gesture that only meant "I want to
  type something else". So the chip goes, the caret lands in the field, and what
  is on screen stays there until something replaces it.
*/
const chipDismissed = ref(false)
const activeTagSlug = computed(() => (chipDismissed.value ? '' : routeTagSlug.value))
const activeTagName = computed(() => {
  if (!activeTagSlug.value) return ''
  return (
    search.tagName ||
    tagLabel(tags.getBySlug(activeTagSlug.value), ui.locale) ||
    activeTagSlug.value
  )
})

/** The free-search row, always last and always offered. */
const freeText = computed(() => text.value.trim().replace(/^#+\s*/, ''))
const rowCount = computed(() => suggestions.value.length + (freeText.value ? 1 : 0))

function closeList() {
  listOpen.value = false
  cursor.value = -1
}

function stopFetch() {
  clearTimeout(debounceTimer)
  debounceTimer = null
  controller?.abort()
  controller = null
}

async function loadSuggestions(input) {
  controller?.abort()
  const own = new AbortController()
  controller = own

  try {
    const items = await fetchTagSuggestions(input, TAKE, own.signal)
    if (controller !== own) return
    suggestions.value = items
    // The list is only worth opening over something; an empty answer still
    // leaves the free-search row, which is the point of keeping it open.
    listOpen.value = true
    cursor.value = -1
  } catch (error) {
    if (error?.name === 'AbortError') return
    // Suggestions are a convenience. A failure means the visitor types and
    // presses Enter, which is what they would have done anyway.
    suggestions.value = []
  } finally {
    if (controller === own) controller = null
  }
}

watch(text, (next) => {
  stopFetch()
  const input = next.trim().replace(/^#+\s*/, '')
  if (!input) {
    suggestions.value = []
    closeList()
    return
  }
  debounceTimer = setTimeout(() => loadSuggestions(input), DEBOUNCE_MS)
})

/**
 * The `autofocus` attribute only counts on a page load, so a field that appears
 * later — the mobile search panel opens on a tap — is left unfocused and the
 * keyboard never comes up. Asking for focus once the element is in the document
 * does what the attribute promises.
 */
onMounted(async () => {
  if (!props.autofocus) return
  await nextTick()
  field.value?.focus()
})

onBeforeUnmount(stopFetch)

// Keep the field in step with the URL — the query is the source of truth, and it
// changes on back/forward and when a tag chip navigates here.
watch(
  () => route.query.text,
  (next) => {
    text.value = String(next ?? '')
    closeList()
  },
)

// Landing on a tag search empties the words: the chip is now what the bar says.
watch(routeTagSlug, (slug) => {
  chipDismissed.value = false
  if (slug) text.value = ''
  closeList()
})

function goToTag(tag) {
  stopFetch()
  closeList()
  text.value = ''
  // Named before the results arrive, so the chip reads properly from the first
  // frame instead of appearing as a bare slug and correcting itself.
  search.rememberTag(tag.slug, tag.value, ui.locale)
  router.push({ name: 'search', query: { tag: tag.slug } })
  emit('submitted')
}

/**
 * Free search over the words as typed, with a leading `#` taken off.
 *
 * Somebody who has seen a chip written `#ramen` will sooner or later type the
 * hash themselves, expecting it to mean something. It does not — tags are picked
 * from the list, never spelled — and searching for a hash that appears in no
 * note would answer nothing at all. Dropping it searches for what they meant.
 */
function submit() {
  const wanted = freeText.value
  if (!wanted) return
  stopFetch()
  closeList()
  router.push({ name: 'search', query: { text: wanted } })
  emit('submitted')
}

function onEnter() {
  const tag = suggestions.value[cursor.value]
  if (listOpen.value && tag) goToTag(tag)
  else submit()
}

function move(step) {
  if (!listOpen.value) {
    if (suggestions.value.length) listOpen.value = true
    else return
  }
  const total = rowCount.value
  if (!total) return
  // Wraps through -1, which is "nothing chosen" — Enter there means free search,
  // and it has to stay reachable by keyboard like everything else.
  const next = cursor.value + step
  cursor.value = next >= total ? -1 : next < -1 ? total - 1 : next
}

function clear() {
  text.value = ''
  suggestions.value = []
  closeList()
}

/** Takes the chip off and hands the field over, ready to be typed into. */
async function clearTag() {
  chipDismissed.value = true
  await nextTick()
  field.value?.focus()
}
</script>

<template>
  <div class="relative w-full">
    <form
      role="search"
      class="flex w-full items-center gap-2 rounded-full border border-edge bg-paper-raised px-2.5 transition focus-within:border-ink-faint"
      :class="props.size === 'large' ? 'py-3' : 'py-1.5'"
      @submit.prevent="onEnter"
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

      <!-- The tag being filtered by, standing in the field rather than in it:
           it is not text that was typed and it cannot be edited a letter at a
           time — it is either the tag or it is gone. -->
      <span
        v-if="activeTagSlug"
        class="flex shrink-0 items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium text-ink"
      >
        #{{ activeTagName }}
        <button
          type="button"
          class="text-ink-faint transition hover:text-ink"
          :aria-label="t('search.clearTag')"
          @click="clearTag"
        >
          <svg
            class="h-3 w-3"
            viewBox="0 0 12 12"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            aria-hidden="true"
          >
            <path d="m3 3 6 6M9 3l-6 6" stroke-linecap="round" />
          </svg>
        </button>
      </span>

      <input
        ref="field"
        v-model="text"
        type="search"
        role="combobox"
        aria-autocomplete="list"
        :aria-expanded="listOpen"
        aria-controls="tag-suggestions"
        :placeholder="t('search.placeholder')"
        :aria-label="t('search.submit')"
        :autofocus="props.autofocus"
        class="min-w-0 flex-1 bg-transparent text-ink outline-none placeholder:text-ink-faint
        [appearance:textfield] [&::-webkit-search-cancel-button]:appearance-none"
        :class="props.size === 'large' ? 'text-lg' : 'text-sm'"
        @focus="suggestions.length && (listOpen = true)"
        @blur="closeList"
        @keydown.down.prevent="move(1)"
        @keydown.up.prevent="move(-1)"
        @keydown.esc.prevent="closeList"
      />

      <button
        v-if="text"
        type="button"
        class="shrink-0 rounded p-0 text-ink-faint transition hover:text-ink"
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

    <!--
      `mousedown.prevent` on the whole panel, and nothing else would do: a press
      inside it would otherwise blur the field, the blur would close the list,
      and the click would land on a row that is no longer there. Preventing the
      default keeps the focus where it is until the click has been delivered.
    -->
    <Transition
      enter-from-class="-translate-y-1 opacity-0"
      enter-active-class="transition duration-150"
      leave-to-class="-translate-y-1 opacity-0"
      leave-active-class="transition duration-100"
    >
      <div
        v-if="listOpen && rowCount"
        id="tag-suggestions"
        role="listbox"
        class="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-xl border border-edge bg-paper-raised py-1 shadow-lg"
        @mousedown.prevent
      >
        <button
          v-for="(tag, index) in suggestions"
          :key="tag.slug"
          type="button"
          role="option"
          :aria-selected="cursor === index"
          class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition"
          :class="cursor === index ? 'bg-edge/60 text-ink' : 'text-ink-soft hover:bg-edge/40'"
          @click="goToTag(tag)"
          @mousemove="cursor = index"
        >
          <svg
            class="h-3.5 w-3.5 shrink-0 text-ink-faint"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            stroke-width="1.4"
            aria-hidden="true"
          >
            <path d="M8.6 1.6H14V7l-6.4 6.4a1.4 1.4 0 0 1-2 0l-3.4-3.4a1.4 1.4 0 0 1 0-2z" />
            <circle cx="11" cy="5" r="1.1" fill="currentColor" stroke="none" />
          </svg>
          <span class="min-w-0 flex-1 truncate">{{ tag.value }}</span>
          <span class="shrink-0 text-xs text-ink-faint">{{ tag.usageCount }}</span>
        </button>

        <!-- Always last, always available: whatever the tags say, the words
             themselves remain something that can be searched for. -->
        <button
          v-if="freeText"
          type="button"
          role="option"
          :aria-selected="cursor === suggestions.length"
          class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition"
          :class="[
            suggestions.length ? 'mt-1 border-t border-edge pt-2.5' : '',
            cursor === suggestions.length
              ? 'bg-edge/60 text-ink'
              : 'text-ink-soft hover:bg-edge/40',
          ]"
          @click="submit"
          @mousemove="cursor = suggestions.length"
        >
          <svg
            class="h-3.5 w-3.5 shrink-0 text-ink-faint"
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            aria-hidden="true"
          >
            <circle cx="9" cy="9" r="5.5" />
            <path d="m13.5 13.5 3 3" stroke-linecap="round" />
          </svg>
          <span class="min-w-0 flex-1 truncate">
            {{ t('search.everywhere', { query: freeText }) }}
          </span>
        </button>
      </div>
    </Transition>
  </div>
</template>
