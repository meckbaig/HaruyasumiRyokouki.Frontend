<script setup>
import { computed, ref, nextTick, watch, onMounted } from 'vue'
import { parseRichText, markupSpans } from '@/services/richText'

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

const emit = defineEmits(['update:modelValue', 'input', 'caret'])

const root = ref(null)
const textarea = ref(null)
const overlay = ref(null)
/** Where the bubble hangs: under the marked run, in the field's own coordinates. */
const markStyle = ref(null)

/** The runs a token is painted as: its tags, and the label between them. */
function atomsFor(token) {
  const spans = markupSpans(token)
  if (!spans.length) return [{ from: 0, to: token.raw.length, markup: false }]

  const atoms = []
  let cursor = 0
  for (const [from, to] of spans) {
    if (from > cursor) atoms.push({ from: cursor, to: from, markup: false })
    atoms.push({ from, to, markup: true })
    cursor = to
  }
  if (cursor < token.raw.length) {
    atoms.push({ from: cursor, to: token.raw.length, markup: false })
  }
  return atoms
}

/**
 * The source as the runs the layer paints. Rendering `raw` keeps exactly what
 * is in the field, so the two layers agree character for character; only the
 * tags are markup, so a caption reads as ordinary text. A run under the mark
 * is cut at its edges so the highlight and the mark both survive.
 */
const pieces = computed(() => {
  const range = props.markRange
  const out = []
  let base = 0

  for (const token of parseRichText(props.modelValue)) {
    const raw = token.raw
    for (const atom of atomsFor(token)) {
      const text = raw.slice(atom.from, atom.to)
      const start = base + atom.from
      const end = base + atom.to

      if (!range) {
        out.push({ text, token: atom.markup, mark: false })
        continue
      }

      const markStart = Math.max(range[0], start)
      const markEnd = Math.min(range[1], end)
      if (markStart >= markEnd) {
        out.push({ text, token: atom.markup, mark: false })
        continue
      }

      const a = markStart - start
      const b = markEnd - start
      if (a > 0) out.push({ text: text.slice(0, a), token: atom.markup, mark: false })
      out.push({ text: text.slice(a, b), token: atom.markup, mark: true })
      if (b < text.length) out.push({ text: text.slice(b), token: atom.markup, mark: false })
    }
    base += raw.length
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

/**
 * Tells the caller where the caret stands, so it can act on the run under it.
 * Held when the field is left: a press on a button moves the focus first, and a
 * caret dropped on blur would take that button away before its click lands.
 */
function emitCaret() {
  emit('caret', textarea.value?.selectionStart ?? 0)
}

function onInput(event) {
  emit('update:modelValue', event.target.value)
  emit('input', event)
  emitCaret()
  // A line typed past the box opens it rather than hiding under the scroll.
  fitToContent()
}

/**
 * Grows the field to the height its text needs, plus two lines of room. It
 * **only ever grows**: `rows` is the floor, a height dragged by hand is kept,
 * and a keystroke that overflows opens the box instead of hiding the line.
 * See docs/features/rich-text-and-links.md.
 */
function fitToContent() {
  const element = textarea.value
  if (!element) return

  // What the box already stands at, so a hand-dragged one is never shrunk back
  // to the text.
  const standing = element.offsetHeight

  element.style.height = 'auto'
  const natural = element.offsetHeight
  const lineHeight = parseFloat(getComputedStyle(element).lineHeight) || 21

  element.style.height = '1px'
  // With the box this short, `scrollHeight` is the whole text plus its padding.
  const content = element.scrollHeight

  const needed = Math.max(natural, content + 2 * lineHeight + 2, standing)
  element.style.height = `${needed}px`
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
      @keyup="emitCaret"
      @click="emitCaret"
      @mouseup="emitCaret"
      @select="emitCaret"
      @focus="emitCaret"
    />

    <!-- Hung under the marked run, in the field's own coordinates. -->
    <Transition name="rich-bubble">
      <div v-if="$slots['mark-action'] && markStyle" class="rich-editor-bubble" :style="markStyle">
        <slot name="mark-action" />
      </div>
    </Transition>
  </div>
</template>
