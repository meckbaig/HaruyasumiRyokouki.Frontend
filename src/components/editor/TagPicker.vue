<script setup>
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import TagEditDialog from './TagEditDialog.vue'
import { useTagsStore } from '@/stores/tags'
import { useUiStore } from '@/stores/ui'
import { tagLabel } from '@/services/tags'

const props = defineProps({
  /** Slugs of the tags on the file(s) being edited. */
  modelValue: { type: Array, default: () => [] },
  disabled: { type: Boolean, default: false },
  /**
   * One tag at a time. The tag-collecting screen asks about exactly one tag, and
   * the alternative to reusing this field there is a second autocomplete over
   * the same dictionary with the same matching rules — two of them to keep in
   * step, for the sake of one line of behaviour.
   */
  single: { type: Boolean, default: false },
  /**
   * Marks the field as where a dialog's focus should land. The dialog does the
   * focusing — see ModalDialog — because two of them racing for it is how the
   * caret ends up somewhere neither meant.
   */
  autofocus: { type: Boolean, default: false },
})

const emit = defineEmits(['update:modelValue'])

const { t } = useI18n()
const tags = useTagsStore()
const ui = useUiStore()

const text = ref('')
const open = ref(false)
const cursor = ref(-1)
const creating = ref(false)

/*
  Chosen from a dictionary, never spelled out.

  Tags used to be words typed into a box, one list per language, and every
  spelling mistake and every near-synonym coined a new one. Now a tag is an
  entity with an id: it is picked, and the only way a new one comes into
  existence is deliberately, through the form below.

  The whole dictionary is in memory, so the filtering is a plain array scan on
  every keystroke — no debounce, no request to outrun. It matches captions and
  aliases in all three languages at once, so an editor typing "temple" in a
  Russian interface still finds the tag they know by its English name.
*/
onMounted(() => tags.load().catch(() => {}))

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
  return tags.search(text.value, ui.locale, { exclude: props.modelValue }).slice(0, 8)
})

/** Coining is offered whenever something is typed, not only when nothing matched:
    "temple" matching "temple grounds" does not mean "temple" exists. */
const canCreate = computed(() => Boolean(text.value.trim()))
const rowCount = computed(() => matches.value.length + (canCreate.value ? 1 : 0))

function add(tag) {
  if (!tag?.slug || props.modelValue.includes(tag.slug)) return
  emit('update:modelValue', props.single ? [tag.slug] : [...props.modelValue, tag.slug])
  text.value = ''
  cursor.value = -1
  open.value = false
}

function remove(slug) {
  emit(
    'update:modelValue',
    props.modelValue.filter((entry) => entry !== slug),
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

/**
 * Backspace on an empty field takes the last tag off.
 *
 * The convention every field of chips keeps, and the reason is that the chips
 * are behind the caret: a key that deletes backwards should delete what is
 * behind it, whether or not that thing happens to be a letter.
 */
function onBackspace() {
  if (text.value) return
  const last = props.modelValue[props.modelValue.length - 1]
  if (last) remove(last)
}
</script>

<template>
  <!-- Lifted into the positioned layer so the list drops *over* what follows it
       in the dialog — the map below is the thing it kept landing behind. -->
  <div class="relative z-30">
    <span class="field-label">{{ t('editor.tags') }}</span>

    <div
      class="flex flex-wrap items-center gap-1.5 rounded-md border border-edge bg-paper-raised px-2 py-2 transition focus-within:border-ink-faint"
    >
      <span
        v-for="tag in selected"
        :key="tag.slug"
        class="flex items-center gap-1 rounded-full bg-edge/60 py-0.5 pl-2.5 pr-1 text-xs text-ink"
      >
        #{{ tagLabel(tag, ui.locale) }}
        <button
          type="button"
          class="rounded-full p-0.5 text-ink-faint transition hover:text-accent"
          :aria-label="t('tags.remove', { tag: tagLabel(tag, ui.locale) })"
          :disabled="disabled"
          @click="remove(tag.slug)"
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

      <div class="relative min-w-32 flex-1">
        <input
          v-model="text"
          type="text"
          role="combobox"
          aria-autocomplete="list"
          :aria-expanded="open"
          :disabled="disabled"
          :data-autofocus="autofocus ? '' : undefined"
          :placeholder="selected.length ? '' : t('tags.pickPlaceholder')"
          class="w-full bg-transparent text-sm text-ink outline-none placeholder:text-ink-faint"
          @input="open = true"
          @focus="open = true"
          @blur="open = false"
          @keydown.down.prevent="move(1)"
          @keydown.up.prevent="move(-1)"
          @keydown.enter.prevent="onEnter"
          @keydown.esc.prevent="open = false"
          @keydown.delete="onBackspace"
        />

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
            :class="cursor === index ? 'bg-edge/60 text-ink' : 'text-ink-soft hover:bg-edge/40'"
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
              cursor === matches.length ? 'bg-edge/60 text-ink' : 'text-ink-soft hover:bg-edge/40',
            ]"
            @click="startCreating"
            @mousemove="cursor = matches.length"
          >
            {{ t('tags.createNamed', { tag: text.trim() }) }}
          </button>
        </div>
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
