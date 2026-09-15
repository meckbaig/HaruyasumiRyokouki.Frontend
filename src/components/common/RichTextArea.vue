<script setup>
import { computed, ref, nextTick, watch, onMounted } from 'vue'
import { parseRichText } from '@/services/richText'

/**
 * A textarea that paints its own markup highlighted behind the text, the way a
 * code editor does - so a reference is not lost among a paragraph. It can also
 * mark a run of characters and hang an action under it in a bubble.
 * See docs/features/rich-text-and-links.md.
 */
const props = defineProps({
  modelValue: { type: String, default: '' },
  rows: { type: Number, default: 8 },
  disabled: { type: Boolean, default: false },
  id: { type: String, default: undefined },
  /** `[start, end]` of the run to mark, in characters; null for none. */
  markRange: { type: Array, default: null },
})

const emit = defineEmits(['update:modelValue', 'input'])

const root = ref(null)
const textarea = ref(null)
const overlay = ref(null)
/** Where the bubble hangs: under the marked run, in the field's own coordinates. */
const markStyle = ref(null)

/**
 * The source split into plain runs and markup runs. Rendering `raw` here keeps
 * exactly what is in the field, so the two layers line up character for
 * character. When a run is marked, a token is cut at the run's edges so the
 * highlight and the mark both survive.
 */
const pieces = computed(() => {
  const range = props.markRange
  const out = []
  let offset = 0

  for (const token of parseRichText(props.modelValue)) {
    const start = offset
    const end = offset + token.raw.length
    offset = end
    const isToken = token.type !== 'text'

    if (!range) {
      out.push({ text: token.raw, token: isToken, mark: false })
      continue
    }

    const markStart = Math.max(range[0], start)
    const markEnd = Math.min(range[1], end)
    if (markStart >= markEnd) {
      out.push({ text: token.raw, token: isToken, mark: false })
      continue
    }

    const a = markStart - start
    const b = markEnd - start
    if (a > 0) out.push({ text: token.raw.slice(0, a), token: isToken, mark: false })
    out.push({ text: token.raw.slice(a, b), token: isToken, mark: true })
    if (b < token.raw.length) out.push({ text: token.raw.slice(b), token: isToken, mark: false })
  }
  return out
})

/** A trailing newline needs a sentinel, or its empty line has no height. */
const trailing = computed(() => (props.modelValue.endsWith('\n') ? ' ' : ''))

function syncScroll() {
  if (overlay.value && textarea.value) {
    overlay.value.scrollTop = textarea.value.scrollTop
    overlay.value.scrollLeft = textarea.value.scrollLeft
  }
  measureMark()
}

/** The marked run's box, turned into a spot under it inside the field. */
function measureMark() {
  const element = root.value
  if (!element || !props.markRange) {
    markStyle.value = null
    return
  }

  const mark = element.querySelector('[data-mark]')
  if (!mark) {
    markStyle.value = null
    return
  }

  const box = mark.getBoundingClientRect()
  const frame = element.getBoundingClientRect()
  markStyle.value = {
    left: `${Math.round(box.left - frame.left)}px`,
    top: `${Math.round(box.bottom - frame.top + 6)}px`,
  }
}

function onInput(event) {
  emit('update:modelValue', event.target.value)
  emit('input', event)
}

/**
 * Opens the field at the height the note needs, plus two lines of room. Only
 * ever grows: `rows` remains the floor, and typing does not resize the field
 * under the reader.
 */
function fitToContent() {
  const element = textarea.value
  if (!element) return

  element.style.height = 'auto'
  const natural = element.offsetHeight
  const lineHeight = parseFloat(getComputedStyle(element).lineHeight) || 21

  element.style.height = '1px'
  // With the box this short, `scrollHeight` is the whole text plus its padding.
  const content = element.scrollHeight

  element.style.height = `${Math.max(natural, content + 2 * lineHeight + 2)}px`
  syncScroll()
}

watch(
  () => props.modelValue,
  () => {
    nextTick(syncScroll)
    // A hydrated or switched language changes the text under an idle field.
    if (document.activeElement !== textarea.value) nextTick(fitToContent)
  },
)

// The mark moves whenever the text or the run does, so the bubble follows it.
watch(
  [() => props.markRange, () => props.modelValue],
  () => nextTick(measureMark),
  { flush: 'post' },
)

onMounted(() => {
  fitToContent()
  measureMark()
})

defineExpose({ element: textarea })
</script>

<template>
  <div ref="root" class="rich-editor">
    <pre ref="overlay" class="rich-editor-layer" aria-hidden="true"
      ><span
        v-for="(piece, index) in pieces"
        :key="index"
        :class="[piece.token ? 'rich-editor-token' : '', piece.mark ? 'rich-editor-mark' : '']"
        :data-mark="piece.mark ? '' : undefined"
        >{{ piece.text }}</span
      >{{ trailing }}</pre
    >
    <textarea
      ref="textarea"
      :id="id"
      :rows="rows"
      :disabled="disabled"
      class="rich-editor-input"
      spellcheck="false"
      :value="modelValue"
      @input="onInput"
      @scroll="syncScroll"
    />

    <!-- Hung under the marked run, in the field's own coordinates. -->
    <Transition name="rich-bubble">
      <div v-if="$slots['mark-action'] && markStyle" class="rich-editor-bubble" :style="markStyle">
        <slot name="mark-action" />
      </div>
    </Transition>
  </div>
</template>
