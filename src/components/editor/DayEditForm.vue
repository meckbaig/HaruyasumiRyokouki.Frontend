<script setup>
import { ref, reactive, computed, watch, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import LanguageTabs from './LanguageTabs.vue'
import MediaLightbox from '@/components/media/MediaLightbox.vue'
import MediaThumb from '@/components/media/MediaThumb.vue'
import { markOpenedFrom } from '@/services/openedFrom'
import { saveDay, fetchDayEdit } from '@/api/days'
import { useUiStore } from '@/stores/ui'
import { useDaysStore } from '@/stores/days'
import { SUPPORTED_LOCALES } from '@/i18n'
import { cascadeDelay } from '@/services/cascade'
import { useDelayed } from '@/composables/useDelayed'
import { readDraft, writeDraft, clearDraft, sameNotes } from '@/services/dayDrafts'

const props = defineProps({
  /** DayDto (read model) or DayEditDto (pending list) - both are accepted. */
  day: { type: Object, required: true },
  date: { type: String, required: true },
  /**
   * The strip of the day's photos above the note.
   *
   * It is here so the day can be written while looking at it, which the pending
   * queue needs - nothing else on that screen shows what the day held. On the day
   * page the same grid is already a few centimetres below the form, and a second
   * copy of it says nothing the first did not.
   */
  showThumbs: { type: Boolean, default: true },
})

const emit = defineEmits(['saved', 'cancel'])

const { t } = useI18n()
const ui = useUiStore()
const days = useDaysStore()

// One note per language, plus the id of each existing translation row so the
// backend can update it in place rather than matching by language.
const form = reactive({})
/** The notes as the server last gave them, for telling a draft from a copy. */
const baseline = reactive({})
const rowIds = reactive({})
/** A draft was found and put back; says so until it is saved or thrown away. */
const restored = ref(false)
const activeLang = ref(ui.locale)
const isReady = ref(false)
const autoTranslate = ref(false)
const translated = ref(false)
const saving = ref(false)
const loading = ref(false)
const error = ref(null)
const thumbs = ref([])
/**
 * The strip is here so the day can be written while looking at it, and a
 * sixty-pixel square is not looking at it. Opening one full screen is what makes
 * the difference between naming a day and describing it.
 */
const lightboxIndex = ref(null)

function openThumb(event, index) {
  markOpenedFrom(event.currentTarget)
  lightboxIndex.value = index
}

// Said out loud only if the wait actually lasts - see composables/useDelayed.
const showLoading = useDelayed(() => loading.value)

const active = computed(() => form[activeLang.value] ?? { note: '' })
const canSave = computed(() => !loading.value && !saving.value)

/** An entity is already a full edit model when it carries a translations array. */
function isEditModel(day) {
  return Array.isArray(day?.translations)
}

/** Fills the per-language notes from the entity. */
function hydrate(day) {
  const rows = Array.isArray(day?.translations) ? day.translations : null
  for (const locale of SUPPORTED_LOCALES) {
    let source = null
    if (rows) source = rows.find((row) => row?.languageCode === locale)
    else if ((day?.languageCode ?? ui.locale) === locale) source = day

    form[locale] = { note: source?.note ?? '' }
    rowIds[locale] = source?.id ?? null
  }
  rememberBaseline()
}

/** Takes the notes as they now stand to be the state the server is in. */
function rememberBaseline() {
  for (const locale of SUPPORTED_LOCALES) baseline[locale] = form[locale]?.note ?? ''
}

/** The notes as they now stand, in the shape a draft is stored in. */
function currentNotes() {
  const notes = {}
  for (const locale of SUPPORTED_LOCALES) notes[locale] = form[locale]?.note ?? ''
  return notes
}

const dirty = computed(() => !sameNotes(currentNotes(), baseline, SUPPORTED_LOCALES))

/*
  The draft, kept on this machine.

  Written every ten seconds and only while the form says something the server
  does not - so a day opened and closed untouched leaves nothing behind, and one
  edited and abandoned is waiting when the editor comes back to it. Reverting the
  text by hand takes the draft with it: at that point there is nothing to
  recover.

  Also written on the way out, both kinds: navigating to another day unmounts
  this form, and closing the tab does not unmount anything at all.
*/
const DRAFT_EVERY_MS = 10_000
let draftTimer = null

function syncDraft() {
  if (dirty.value) writeDraft(props.date, currentNotes())
  else clearDraft(props.date)
}

/** Puts back a draft, if the one stored says anything the server does not. */
function restoreDraft() {
  restored.value = false
  const draft = readDraft(props.date)
  if (!draft) return
  if (sameNotes(draft.notes, baseline, SUPPORTED_LOCALES)) {
    // It has since been saved by other means; nothing to put back.
    clearDraft(props.date)
    return
  }

  for (const locale of SUPPORTED_LOCALES) {
    form[locale] = { note: draft.notes[locale] ?? '' }
  }
  restored.value = true
}

/** Throws the draft away and puts the server's own text back on screen. */
function discardDraft() {
  for (const locale of SUPPORTED_LOCALES) {
    form[locale] = { note: baseline[locale] ?? '' }
  }
  clearDraft(props.date)
  restored.value = false
}

function onUnload() {
  syncDraft()
}

window.addEventListener('beforeunload', onUnload)
draftTimer = setInterval(syncDraft, DRAFT_EVERY_MS)

onBeforeUnmount(() => {
  clearInterval(draftTimer)
  window.removeEventListener('beforeunload', onUnload)
  syncDraft()
})

/**
 * The public day is flattened to one language, so editing from a public page
 * fetches the full edit model (all notes + their row ids). The pending list
 * already provides it, so no request is made there. Save is blocked until this
 * resolves, so an existing note is never overwritten without its row id.
 */
async function loadFullModel() {
  if (isEditModel(props.day)) return
  loading.value = true
  try {
    const full = await fetchDayEdit(props.date)
    if (full) hydrate(full)
  } catch (caught) {
    error.value = caught
  } finally {
    loading.value = false
  }
}

/**
 * Thumbnails of the day, so the note can be written while looking at what the
 * day actually held. The edit model has no media, so the full day is pulled
 * from the cache to get the file names.
 */
async function loadThumbs() {
  thumbs.value = []
  if (!props.showThumbs) return

  thumbs.value = props.day?.media ?? []
  if (thumbs.value.length) return
  try {
    const full = await days.loadDay(props.date)
    thumbs.value = full?.media ?? []
  } catch {
    thumbs.value = []
  }
}

watch(
  () => props.day,
  async (day) => {
    hydrate(day)
    activeLang.value = ui.locale
    isReady.value = Boolean(day?.isReady)
    autoTranslate.value = false
    translated.value = false
    error.value = null
    loadThumbs()
    // Awaited: for a public day the rows arrive from the server and overwrite
    // the form, so a draft put back before that would be wiped by its own fetch.
    await loadFullModel()
    restoreDraft()
  },
  { immediate: true },
)

function buildTranslations() {
  const rows = []
  for (const locale of SUPPORTED_LOCALES) {
    const note = form[locale]?.note ?? ''
    if (!note.trim()) continue
    const row = { languageCode: locale, note }
    if (rowIds[locale]) row.id = rowIds[locale]
    rows.push(row)
  }
  return rows
}

function applyTranslated(day) {
  if (!day) return false
  hydrate(day)
  translated.value = true
  return true
}

async function save() {
  saving.value = true
  error.value = null
  try {
    const response = await saveDay(
      props.date,
      {
        date: props.date,
        // `isReady` is what removes the day from the pending list, so it is an
        // explicit decision by the editor rather than a side effect of saving.
        isReady: isReady.value,
        translations: buildTranslations(),
      },
      { autoTranslate: autoTranslate.value },
    )

    if (autoTranslate.value && applyTranslated(response?.day)) {
      ui.notify(t('editor.translationReview'), 'info')
      autoTranslate.value = false
      return
    }

    ui.notify(t('admin.saved'), 'success')
    /*
      Saved is exactly when a draft stops being worth keeping - and the baseline
      has to move with it. Without that the form still counts as unsaved against
      the text the server held a moment ago, and the flush on the way out would
      write back the very draft this line just removed.
    */
    rememberBaseline()
    clearDraft(props.date)
    restored.value = false
    emit('saved', { date: props.date, isReady: isReady.value })
  } catch (caught) {
    error.value = caught
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <!--
    The fields arrive one under another rather than as a block, and go the same
    way - the stagger is `.cascade-item`, the fold around them is `.reveal` on
    whoever mounts this form. The delays are written by hand rather than counted
    off the loop, so a notice that only sometimes appears cannot shift the
    others' place in the order; the two that do appear mid-editing carry none at
    all, since a message about what just happened must not be held back.
  -->
  <form class="space-y-4" @submit.prevent="save">
    <div v-if="thumbs.length" class="cascade-item" :style="cascadeDelay(0)">
      <span class="field-label">{{ t('editor.dayThumbs') }}</span>
      <div class="flex flex-wrap gap-1.5">
        <!-- `data-media-id`: what the viewer looks for when it flies a picture
             back to where it was opened from. Without it there was nowhere to
             fly to, and closing simply blinked out. -->
        <button
          v-for="(item, index) in thumbs"
          :key="item.id ?? item.fileName"
          :data-media-id="item.id"
          type="button"
          class="w-16 overflow-hidden rounded ring-1 ring-edge transition hover:ring-2 hover:ring-accent focus-visible:ring-2 focus-visible:ring-accent"
          :aria-label="item.title || item.fileName"
          @click="openThumb($event, index)"
        >
          <MediaThumb :media="item" :alt="item.title || item.fileName" />
        </button>
      </div>
    </div>

    <!-- Said plainly, because the text on screen is not what the server holds
         and the editor has to know which they are looking at. -->
    <p
      v-if="restored"
      class="cascade-item flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md bg-accent-soft px-3 py-2 text-xs text-ink"
    >
      {{ t('editor.draftRestored') }}
      <button
        type="button"
        class="underline underline-offset-2 transition hover:text-accent"
        @click="discardDraft"
      >
        {{ t('editor.draftDiscard') }}
      </button>
    </p>

    <LanguageTabs
      v-model="activeLang"
      :disabled="loading"
      class="cascade-item"
      :style="cascadeDelay(1)"
    />

    <div class="cascade-item" :style="cascadeDelay(2)">
      <label class="field-label" :for="`day-note-${date}`">{{ t('editor.note') }}</label>
      <textarea
        :id="`day-note-${date}`"
        v-model="active.note"
        rows="10"
        class="field-input"
        :disabled="loading"
      />
      <p v-if="showLoading" class="field-hint">{{ t('common.loading') }}</p>
    </div>

    <label
      class="cascade-item flex items-center gap-2 text-sm text-ink-soft"
      :style="cascadeDelay(3)"
    >
      <input v-model="isReady" type="checkbox" class="rounded border-edge" />
      {{ t('editor.isReady') }}
    </label>

    <div class="cascade-item" :style="cascadeDelay(4)">
      <label class="flex items-center gap-2 text-sm text-ink-soft">
        <input v-model="autoTranslate" type="checkbox" class="rounded border-edge" />
        {{ t('editor.autoTranslate') }}
      </label>
      <p class="field-hint">{{ t('editor.autoTranslateHint') }}</p>
    </div>

    <p v-if="translated" class="cascade-item rounded-md bg-accent-soft px-3 py-2 text-xs text-ink">
      {{ t('editor.translationReview') }}
    </p>

    <p v-if="error" role="alert" class="cascade-item text-sm text-accent">
      {{ error.detail || error.title || t('errors.generic') }}
    </p>

    <div class="cascade-item flex justify-end gap-2" :style="cascadeDelay(5)">
      <button type="button" class="btn-ghost" @click="emit('cancel')">
        {{ t('common.cancel') }}
      </button>
      <button type="submit" class="btn-primary" :disabled="!canSave">
        <!-- The same button says something else with translation ticked: the
             note is saved *and* the empty languages are filled, and the form
             stays open so the machine's work can be read. -->
        {{
          saving
            ? t('common.saving')
            : autoTranslate
              ? t('editor.translateAction')
              : t('common.save')
        }}
      </button>
    </div>

    <MediaLightbox v-model:index="lightboxIndex" :items="thumbs" />
  </form>
</template>
