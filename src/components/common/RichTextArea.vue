<script setup>
import { computed, ref, nextTick, watch, onMounted } from 'vue'
import { parseRichText } from '@/services/richText'

/**
 * A textarea that paints its own markup highlighted behind the text, the way a
 * code editor does - so a reference is not lost among a paragraph.
 * See docs/features/rich-text-and-links.md.
 */
const props = defineProps({
  modelValue: { type: String, default: '' },
  rows: { type: Number, default: 8 },
  disabled: { type: Boolean, default: false },
  id: { type: String, default: undefined },
})

const emit = defineEmits(['update:modelValue', 'input'])

const textarea = ref(null)
const overlay = ref(null)

/**
 * The source split into plain runs and markup runs. Rendering `raw` here keeps
 * exactly what is in the field, so the two layers line up character for
 * character.
 */
const tokens = computed(() => parseRichText(props.modelValue))

/** A trailing newline needs a sentinel, or its empty line has no height. */
const trailing = computed(() => (props.modelValue.endsWith('\n') ? ' ' : ''))

function syncScroll() {
  if (!overlay.value || !textarea.value) return
  overlay.value.scrollTop = textarea.value.scrollTop
  overlay.value.scrollLeft = textarea.value.scrollLeft
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

onMounted(fitToContent)

defineExpose({ element: textarea })
</script>

<template>
  <div class="rich-editor">
    <pre ref="overlay" class="rich-editor-layer" aria-hidden="true"
      ><span
        v-for="(token, index) in tokens"
        :key="index"
        :class="token.type === 'text' ? '' : 'rich-editor-token'"
        >{{ token.raw }}</span
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
  </div>
</template>
