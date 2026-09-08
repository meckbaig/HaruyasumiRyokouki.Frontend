<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import TagEditDialog from './TagEditDialog.vue'
import { useTagsStore } from '@/stores/tags'
import { useUiStore } from '@/stores/ui'
import { tagLabel } from '@/services/tags'

/**
 * One editable line of chips. Tags are atomic and the gaps between them are real
 * text, so the caret reaches any gap and a tag can be swapped in place. See
 * docs/features/tags.md.
 */
const INVISIBLE = /[\u200B\u200C\u200D]/g

const props = defineProps({
  /** Slugs of the tags on the file(s) being edited. */
  modelValue: { type: Array, default: () => [] },
  disabled: { type: Boolean, default: false },
  /**
   * One tag at a time. The tag-collecting screen asks about exactly one tag, and
   * the alternative to reusing this field there is a second autocomplete over
   * the same dictionary with the same matching rules - two of them to keep in
   * step, for the sake of one line of behaviour.
   */
  single: { type: Boolean, default: false },
  /**
   * Marks the field as where a dialog's focus should land. The dialog does the
   * focusing - see ModalDialog - because two of them racing for it is how the
   * caret ends up somewhere neither meant.
   */
  autofocus: { type: Boolean, default: false },
})

const emit = defineEmits(['update:modelValue'])

const { t } = useI18n()
const tags = useTagsStore()
const ui = useUiStore()

let skipKeyup = false

const fieldEl = ref(null)
const focused = ref(false)
const text = ref('')
const open = ref(false)
const cursor = ref(-1)
const creating = ref(false)

/**
 * Editable text per gap. With `n` chips there are `n + 1` gaps: before the first
 * chip, between each pair, and after the last. This array is the source the DOM
 * is rebuilt from; while typing, the browser owns the text nodes and `gaps` is
 * kept in step on every input without re-rendering.
 */
const gaps = ref([''])
const activeGap = ref(0)
/** Caret destination for the next rebuild; null means "put it somewhere sensible". */
const caret = ref(null)
const focusAfterRender = ref(false)

/*
  Chosen from a dictionary, never spelled out - the only way a new tag comes into
  existence is deliberately, through the form below. The whole dictionary is in
  memory, so filtering is a plain array scan. See docs/features/tags.md.
*/
const selected = computed(() =>
  props.modelValue.map((slug) => tags.getBySlug(slug)).filter(Boolean),
)

/**
 * Slugs with no tag behind them. Only worth saying once the dictionary is in:
 * until then every slug is unresolved, and announcing that would be reporting
 * the loading as a fault.
 */
const unknownCount = computed(() =>
  tags.loaded ? props.modelValue.length - selected.value.length : 0,
)

const matches = computed(() => {
  if (!text.value.trim()) return []
  const results = tags.search(text.value, ui.locale, { exclude: props.modelValue }).slice(0, 8)
  return results
})

const autoSelected = computed(() => {
  if (!text.value.trim()) return -1
  if (matches.value.length > 0) return 0
  // No matches - offer creation as the first option
  return canCreate.value ? 0 : -1
})

/** Coining is offered whenever something is typed, not only when nothing matched:
    "temple" matching "temple grounds" does not mean "temple" exists. */
const canCreate = computed(() => Boolean(text.value.trim()))
const rowCount = computed(() => matches.value.length + (canCreate.value ? 1 : 0))

onMounted(() => {
  tags.load().catch(() => {})
  renderField()
})

function syncGaps(chipCount) {
  const target = chipCount + 1
  if (gaps.value.length === target) return
  const next = gaps.value.slice(0, target)
  while (next.length < target) next.push('')
  gaps.value = next
}

function buildChip(slug, index) {
  const tag = tags.getBySlug(slug)
  const label = tag ? tagLabel(tag, ui.locale) : slug

  const chip = document.createElement('span')
  chip.className =
    'inline-flex cursor-default select-none items-center gap-1 rounded-full bg-edge/60 py-0.5 pl-2.5 pr-1 text-xs text-ink'
  chip.dataset.slug = slug
  chip.setAttribute('contenteditable', 'false')
  chip.setAttribute('tabindex', '-1')

  const caption = document.createElement('span')
  caption.textContent = `#${label}`

  const button = document.createElement('button')
  button.type = 'button'
  button.className =
    'inline-flex items-center justify-center rounded-full p-0.5 text-ink-faint transition hover:text-accent'
  button.setAttribute('aria-label', t('tags.remove', { tag: label }))
  button.disabled = props.disabled
  button.innerHTML =
    '<svg class="h-3 w-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m3 3 6 6M9 3l-6 6" stroke-linecap="round" /></svg>'
  button.addEventListener('click', (event) => {
    event.preventDefault()
    event.stopPropagation()
    removeAt(index)
  })

  chip.append(caption, button)
  return chip
}

function placeCaretInNode(node, offset) {
  const length = (node?.nodeValue ?? '').length
  const at = Math.max(0, Math.min(offset, length))
  const range = document.createRange()
  range.setStart(node, at)
  range.collapse(true)
  const selection = window.getSelection()
  selection.removeAllRanges()
  selection.addRange(range)
}

function placeCaret(gap, offset) {
  const el = fieldEl.value
  if (!el) return
  const textNodes = Array.from(el.childNodes).filter((node) => node.nodeType === Node.TEXT_NODE)
  const node = textNodes[gap]
  if (!node) return
  placeCaretInNode(node, offset)
}

function renderField() {
  const el = fieldEl.value
  if (!el) return

  const chipCount = props.modelValue.length
  syncGaps(chipCount)

  const target =
    caret.value ?? { gap: chipCount, offset: gaps.value[chipCount] ? gaps.value[chipCount].length : 0 }
  const shouldFocus = focusAfterRender.value || focused.value
  caret.value = null
  focusAfterRender.value = false

  el.textContent = ''
  const fragment = document.createDocumentFragment()
  for (let i = 0; i <= chipCount; i++) {
    fragment.appendChild(document.createTextNode(gaps.value[i] || ''))
    if (i < chipCount) fragment.appendChild(buildChip(props.modelValue[i], i))
  }
  el.appendChild(fragment)

  // Placing a caret in an editable line focuses it, so a rebuild that only
  // reflects new data (the dictionary arriving) must not do it unprompted.
  if (shouldFocus) {
    placeCaret(target.gap, target.offset)
    el.focus()
  }
}

function saveCaret() {
  const info = cleanCaretInfo()
  if (!info) return
  caret.value = { gap: info.gap, offset: info.offset }
}

/** How many chips lie before a node in the editable line. */
function countChipsBefore(node) {
  const el = fieldEl.value
  if (!el) return -1
  let current = node
  while (current && current.parentNode !== el) current = current.parentNode
  if (!current) return -1

  const children = Array.from(el.childNodes)
  const index = children.indexOf(current)
  if (index === -1) return -1

  let chips = 0
  for (let i = 0; i < index; i++) {
    const child = children[i]
    if (child.nodeType === Node.ELEMENT_NODE && child.dataset?.slug) chips++
  }
  return chips
}

function readCaret() {
  const el = fieldEl.value
  const selection = window.getSelection()
  if (!el || !selection || !selection.rangeCount) return null

  const range = selection.getRangeAt(0)
  if (!el.contains(range.startContainer)) return null

  const node = range.startContainer
  const offset = range.startOffset

  if (node === el) {
    const children = Array.from(el.childNodes).slice(0, offset)
    const gap = children.filter(
      (child) => child.nodeType === Node.ELEMENT_NODE && child.dataset?.slug,
    ).length
    return { gap, node: null, offset: 0 }
  }

  if (node.nodeType === Node.ELEMENT_NODE && node.dataset?.slug) {
    const chipsBefore = countChipsBefore(node)
    if (chipsBefore === -1) return null
    // Clicking on the body of a chip may park the caret on either side of it.
    return { gap: chipsBefore + (offset >= node.childNodes.length ? 1 : 0), node: null, offset: 0 }
  }

  const gap = countChipsBefore(node)
  if (gap === -1) return null
  return { gap, node: node.nodeType === Node.TEXT_NODE ? node : null, offset }
}

/** `readCaret`, with the zero-width placeholders folded out of the offset. */
function cleanCaretInfo() {
  const info = readCaret()
  if (!info || info.gap < 0) return null

  if (!info.node) {
    return { gap: info.gap, node: null, raw: '', text: gaps.value[info.gap] ?? '', offset: 0 }
  }

  const raw = info.node.nodeValue || ''
  const prefix = raw.slice(0, info.offset)
  const removed = (prefix.match(INVISIBLE) || []).length
  const clean = raw.replace(INVISIBLE, '')
  const offset = Math.min(Math.max(0, info.offset - removed), clean.length)
  return { gap: info.gap, node: info.node, raw, text: clean, offset }
}

/** Strips placeholder zero-width characters the browser's caret walked over. */
function sanitizeNode(info) {
  if (!info.node) return ''
  const clean = (info.node.nodeValue || '').replace(INVISIBLE, '')
  if (info.node.nodeValue !== clean) {
    info.node.nodeValue = clean
    placeCaretInNode(info.node, info.offset)
  }
  return clean
}

function materialiseCaret() {
  const info = readCaret()
  if (!info || info.node) return
  // A click in an empty gap can leave the selection on the container rather than
  // in the gap's text node; park it there so typing lands in the right place.
  placeCaret(info.gap, gaps.value[info.gap]?.length ?? 0)
}

function onFieldClick() {
  materialiseCaret()
  refreshActiveGap()
}

function refreshActiveGap() {
  const info = cleanCaretInfo()
  if (!info) return

  const previousGap = activeGap.value
  activeGap.value = info.gap
  text.value = info.text

  if (info.text) {
    if (!open.value || info.gap !== previousGap) {
      open.value = true
      cursor.value = autoSelected.value
    }
  } else {
    open.value = false
    cursor.value = -1
  }
}

function onDraftChanged(gap, value) {
  activeGap.value = gap
  text.value = value
  if (value) {
    open.value = true
    cursor.value = autoSelected.value
  } else {
    open.value = false
    cursor.value = -1
  }
}

function onInput(event) {
  const info = cleanCaretInfo()
  if (!info) return

  // During IME composition leave the DOM node alone, or rewriting it breaks the
  // composition; the final input event after the composition ends normalises it.
  const value = event?.isComposing
    ? (info.node?.nodeValue ?? '').replace(INVISIBLE, '')
    : sanitizeNode(info)

  gaps.value[info.gap] = value
  onDraftChanged(info.gap, value)
}

function onKeydown(event) {
  skipKeyup = false

  if (event.key === 'ArrowDown') {
    if (open.value && rowCount.value) {
      event.preventDefault()
      move(1)
      skipKeyup = true
    }
    return
  }
  if (event.key === 'ArrowUp') {
    if (open.value && rowCount.value) {
      event.preventDefault()
      move(-1)
      skipKeyup = true
    }
    return
  }
  if (event.key === 'Enter') {
    event.preventDefault()
    skipKeyup = true
    onEnter()
    return
  }
  if (event.key === 'Escape') {
    event.preventDefault()
    skipKeyup = true
    open.value = false
    cursor.value = -1
    return
  }
  if (event.key === 'Backspace') onBackspace(event)
}

function onKeyup() {
  if (skipKeyup) {
    skipKeyup = false
    return
  }
  refreshActiveGap()
}

function onFocus() {
  focused.value = true
  const info = cleanCaretInfo()
  if (!info) return
  activeGap.value = info.gap
  const value = gaps.value[info.gap] ?? ''
  if (value) {
    open.value = true
    cursor.value = autoSelected.value
  }
}

function onBlur() {
  focused.value = false
  open.value = false
  cursor.value = -1
}

/**
 * Backspace with the caret at the start of a gap pulls the chip on the left back
 * into text - the end-of-field convention, now available at every gap.
 */
function onBackspace(event) {
  const info = cleanCaretInfo()
  if (!info || info.gap === 0 || info.offset !== 0) return
  event.preventDefault()
  skipKeyup = true
  convertChipToText(info.gap - 1)
}

function convertChipToText(k) {
  const current = props.modelValue
  if (k < 0 || k >= current.length) return

  const slug = current[k]
  const tag = tags.getBySlug(slug)
  const label = tag ? tagLabel(tag, ui.locale) : slug

  const before = gaps.value[k] ?? ''
  const after = gaps.value[k + 1] ?? ''
  const merged = before + label + after

  gaps.value = [...gaps.value.slice(0, k), merged, ...gaps.value.slice(k + 2)]
  caret.value = { gap: k, offset: before.length + label.length }
  focusAfterRender.value = true
  text.value = merged
  activeGap.value = k
  // The chip is now text: open the picker at once so it can be re-committed with
  // Enter, or swapped for another match.
  open.value = true
  cursor.value = autoSelected.value
  emit(
    'update:modelValue',
    current.filter((_, index) => index !== k),
  )
}

function insertAt(gap, slug) {
  const current = props.modelValue
  const at = Math.max(0, Math.min(gap, current.length))

  const next = props.single
    ? [slug]
    : [...current.slice(0, at), slug, ...current.slice(at)]

  const nextGaps = props.single
    ? ['', '']
    : (() => {
        const copy = [...gaps.value]
        // The query typed in the gap is consumed by the chip; an empty gap opens
        // on its other side for whatever comes next.
        copy.splice(at, 1, '', '')
        return copy
      })()

  gaps.value = nextGaps
  caret.value = props.single ? { gap: 1, offset: 0 } : { gap: at + 1, offset: 0 }
  focusAfterRender.value = true
  text.value = ''
  cursor.value = -1
  open.value = false
  emit('update:modelValue', next)
}

function add(tag) {
  if (!tag?.slug || props.modelValue.includes(tag.slug)) return
  insertAt(activeGap.value, tag.slug)
}

function removeAt(k) {
  const current = props.modelValue
  if (k < 0 || k >= current.length) return

  const merged = (gaps.value[k] ?? '') + (gaps.value[k + 1] ?? '')
  gaps.value = [...gaps.value.slice(0, k), merged, ...gaps.value.slice(k + 2)]
  caret.value = { gap: k, offset: merged.length }
  focusAfterRender.value = true
  emit(
    'update:modelValue',
    current.filter((_, index) => index !== k),
  )
}

function move(step) {
  const total = rowCount.value
  if (!total) return
  open.value = true
  const next = cursor.value + step
  cursor.value = next >= total ? -1 : next < -1 ? total - 1 : next
}

function onEnter() {
  const tag = matches.value[cursor.value]
  if (tag) add(tag)
  else if (canCreate.value) startCreating()
}

/**
 * Straight into the two-step form, with the typed word as the seed. The dialog
 * asks the backend for a proposal itself and shows its loading state, so the
 * picker does not sit there doing nothing while the model thinks.
 */
function startCreating() {
  if (!canCreate.value) return
  open.value = false
  creating.value = true
}

/** A newly coined tag joins the dictionary and this file in one move. */
function onCreated(tag) {
  if (tag) add(tag)
  text.value = ''
}

/** The form offered an existing near-duplicate and it was taken instead. */
function onPickExisting(tag) {
  add(tag)
  text.value = ''
}

watch(
  () => props.modelValue.slice(),
  () => {
    if (!fieldEl.value) return
    renderField()
  },
)

watch(
  () => tags.loaded,
  () => {
    if (!fieldEl.value) return
    saveCaret()
    renderField()
  },
)

watch(
  () => ui.locale,
  () => {
    if (!fieldEl.value) return
    saveCaret()
    renderField()
  },
)

// The cross is built with `disabled` frozen at build time; without this it would
// stay blocked after a load that began while the field was already on screen.
watch(
  () => props.disabled,
  () => {
    if (!fieldEl.value) return
    saveCaret()
    renderField()
  },
)
</script>

<template>
  <!-- Lifted into the positioned layer so the list drops *over* what follows it
       in the dialog - the map below is the thing it kept landing behind. -->
  <div class="relative z-30">
    <span class="field-label">{{ t('editor.tags') }}</span>

    <div
      class="relative min-w-32 rounded-md border border-edge bg-paper-raised px-2 py-2 transition focus-within:border-ink-faint"
    >
      <span
        v-if="!props.modelValue.length && !text && !focused"
        class="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-sm text-ink-faint"
      >
        {{ t('tags.pickPlaceholder') }}
      </span>

      <div
        ref="fieldEl"
        role="combobox"
        aria-autocomplete="list"
        :aria-expanded="open"
        :aria-disabled="disabled"
        :contenteditable="disabled ? 'false' : 'true'"
        :data-autofocus="autofocus ? '' : undefined"
        class="min-h-[1rem] w-full text-sm text-ink outline-none flex flex-wrap content-start gap-x-0.75 gap-1"
        @input="onInput"
        @keydown="onKeydown"
        @keyup="onKeyup"
        @click="onFieldClick"
        @focus="onFocus"
        @blur="onBlur"
      ></div>

      <!-- `mousedown.prevent`: a press inside the list must not blur the field
           first, or the list would be gone before the click landed. -->
      <div
        v-if="open && rowCount"
        role="listbox"
        class="absolute left-0 right-0 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded-md border border-edge bg-paper-raised py-1 shadow-lg"
        @mousedown.prevent
      >
        <button
          v-for="(tag, index) in matches"
          :key="tag.slug"
          type="button"
          role="option"
          :aria-selected="cursor === index"
          class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition"
          :class="[
            (cursor === index || (index === 0 && autoSelected.value === 0)) ? 'bg-edge/60 text-ink' : 'text-ink-soft hover:bg-edge/40',
          ]"
          @click="add(tag)"
          @mousemove="cursor = index"
        >
          <span class="min-w-0 flex-1 truncate">#{{ tagLabel(tag, ui.locale) }}</span>
          <span class="shrink-0 text-xs text-ink-faint">{{ tag.usageCount }}</span>
        </button>

        <button
          v-if="canCreate"
          type="button"
          role="option"
          :aria-selected="cursor === matches.length"
          class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition"
          :class="[
            matches.length ? 'mt-1 border-t border-edge pt-2' : '',
            (cursor === matches.length || (matches.length === 1 && autoSelected.value === 0)) ? 'bg-edge/60 text-ink' : 'text-ink-soft hover:bg-edge/40',
          ]"
          @click="startCreating"
          @mousemove="cursor = matches.length"
        >
          {{ t('tags.createNamed', { tag: text.trim() }) }}
        </button>
      </div>
    </div>

    <p class="field-hint">{{ t('tags.pickHint') }}</p>
    <p v-if="unknownCount > 0" class="field-hint">
      {{ t('tags.unknownIds', { count: unknownCount }) }}
    </p>

    <TagEditDialog
      :open="creating"
      :seed="text.trim()"
      stacked
      @close="creating = false"
      @saved="onCreated"
      @pick="onPickExisting"
    />
  </div>
</template>
