<script setup>
import { ref, reactive, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import LanguageTabs from './LanguageTabs.vue'
import MediaLightbox from '@/components/media/MediaLightbox.vue'
import { saveDay, fetchDayEdit } from '@/api/days'
import { useUiStore } from '@/stores/ui'
import { useDaysStore } from '@/stores/days'
import { miniatureSrc, previewSrc } from '@/services/mediaAssets'
import { SUPPORTED_LOCALES } from '@/i18n'
import { cascadeDelay } from '@/services/cascade'
import { useDelayed } from '@/composables/useDelayed'

const props = defineProps({
  /** DayDto (read model) or DayEditDto (pending list) — both are accepted. */
  day: { type: Object, required: true },
  date: { type: String, required: true },
})

const emit = defineEmits(['saved', 'cancel'])

const { t } = useI18n()
const ui = useUiStore()
const days = useDaysStore()

// One note per language, plus the id of each existing translation row so the
// backend can update it in place rather than matching by language.
const form = reactive({})
const rowIds = reactive({})
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

// Said out loud only if the wait actually lasts — see composables/useDelayed.
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
}

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
  (day) => {
    hydrate(day)
    activeLang.value = ui.locale
    isReady.value = Boolean(day?.isReady)
    autoTranslate.value = false
    translated.value = false
    error.value = null
    loadThumbs()
    loadFullModel()
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
    way — the stagger is `.cascade-item`, the fold around them is `.reveal` on
    whoever mounts this form. The delays are written by hand rather than counted
    off the loop, so a notice that only sometimes appears cannot shift the
    others' place in the order; the two that do appear mid-editing carry none at
    all, since a message about what just happened must not be held back.
  -->
  <form class="space-y-4" @submit.prevent="save">
    <div v-if="thumbs.length" class="cascade-item" :style="cascadeDelay(0)">
      <span class="field-label">{{ t('editor.dayThumbs') }}</span>
      <div class="flex flex-wrap gap-1.5">
        <button
          v-for="(item, index) in thumbs"
          :key="item.id ?? item.fileName"
          type="button"
          class="overflow-hidden rounded ring-1 ring-edge transition hover:ring-2 hover:ring-accent focus-visible:ring-2 focus-visible:ring-accent"
          :aria-label="item.title || item.fileName"
          @click="lightboxIndex = index"
        >
          <img
            :src="previewSrc(item) || miniatureSrc(item)"
            :alt="item.title || item.fileName"
            loading="lazy"
            class="h-16 w-16 object-cover"
          />
        </button>
      </div>
    </div>

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
        {{ saving ? t('common.saving') : t('common.save') }}
      </button>
    </div>

    <MediaLightbox v-model:index="lightboxIndex" :items="thumbs" />
  </form>
</template>
