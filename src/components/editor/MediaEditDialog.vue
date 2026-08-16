<script setup>
import { ref, reactive, watch, computed, defineAsyncComponent } from 'vue'
import { useI18n } from 'vue-i18n'
import ModalDialog from '@/components/common/ModalDialog.vue'
import LanguageTabs from './LanguageTabs.vue'
import TagPicker from './TagPicker.vue'
import SimilarMediaPanel from './SimilarMediaPanel.vue'
// Lazy so Leaflet is not pulled into the main bundle — this dialog is mounted
// app-wide via the selection toolbar, and the map only loads when it opens.
const MediaLocationPicker = defineAsyncComponent(() => import('./MediaLocationPicker.vue'))
import { editMedia, fetchMediaEdit, fetchMediaLocations } from '@/api/media'
import { useUiStore } from '@/stores/ui'
import { miniatureSrc, previewSrc } from '@/services/mediaAssets'
import { tagSlugsOf } from '@/services/tags'
import { useTagsStore } from '@/stores/tags'
import { applySavedMedia } from '@/services/mediaEdits'
import { SUPPORTED_LOCALES } from '@/i18n'
import { addDays, parseIsoDate, toIsoDate } from '@/services/dates'
import { useDelayed } from '@/composables/useDelayed'
import { isPrivate } from '@/services/privacy'

const props = defineProps({
  open: { type: Boolean, default: false },
  /** Single file. */
  media: { type: Object, default: null },
  /** Many files, for bulk editing; takes precedence over `media`. */
  items: { type: Array, default: null },
  /** Owning day, when the caller knows it; otherwise derived from `created`. */
  date: { type: String, default: null },
  /** Offers a delete action; the parent owns the confirmation and the request. */
  deletable: { type: Boolean, default: false },
})

const emit = defineEmits(['close', 'saved', 'delete'])

const { t } = useI18n()
const ui = useUiStore()
const tagsStore = useTagsStore()

// The two entry points share one dialog: single edit prefills every field, bulk
// leaves them blank and only writes the ones actually filled in.
const editList = computed(() => (props.items?.length ? props.items : props.media ? [props.media] : []))
const isBulk = computed(() => editList.value.length > 1)
const single = computed(() => (isBulk.value ? null : editList.value[0]))

// Full edit models (id + every language), fetched when the caller only had the
// flattened public model. Save is blocked until these arrive.
const models = ref([])
const loading = ref(false)

const form = reactive({})
// Translation row ids per language, so an existing row is updated in place.
const rowIds = reactive({})
// The language selected when the dialog opened. Its fields come from the data
// already on screen and must not be overwritten when the full model arrives.
let initialLang = ui.locale
const activeLang = ref(ui.locale)
const coords = ref(null)
const coordsTouched = ref(false)
/*
  Tags belong to the file rather than to any one of its translations, so they sit
  outside the language tabs and a save carries them beside `translations` rather
  than inside it. Nothing about them needs translating: the tag already knows its
  own three captions.

  Held as slugs, because that is the only name the media models carry — public
  and editor alike. The numeric ids the save wants exist solely in the tag
  dictionary, and are looked up there at the moment of saving; see
  `resolveTagIds`.
*/
const tagSlugs = ref([])
const tagsTouched = ref(false)
const approved = ref(true)
const favorite = ref(false)
const hidden = ref(false)
const autoTranslate = ref(false)
const saving = ref(false)
const error = ref(null)
const translated = ref(false)
const neighborPoints = ref([])

// Said out loud only if the wait actually lasts — see composables/useDelayed.
const showLoading = useDelayed(() => loading.value)

const active = computed(() => form[activeLang.value] ?? { title: '', description: '' })
const thumbs = computed(() => editList.value)
const canSave = computed(() => !loading.value && !saving.value && models.value.length > 0)

/** An entity is already a full edit model when it carries a translations array. */
function isEditModel(entity) {
  return Array.isArray(entity?.translations)
}

function blankForm() {
  for (const locale of SUPPORTED_LOCALES) {
    form[locale] = { title: '', description: '' }
    rowIds[locale] = null
  }
}

function rowFor(model, locale) {
  const rows = Array.isArray(model?.translations) ? model.translations : []
  return rows.find((entry) => entry?.languageCode === locale) ?? null
}

/** Fills every language tab from a full edit model (pending, or a bulk review). */
function hydrateAll(model) {
  for (const locale of SUPPORTED_LOCALES) {
    const row = rowFor(model, locale)
    form[locale] = { title: row?.title ?? '', description: row?.description ?? '' }
    rowIds[locale] = row?.id ?? null
  }
}

/** First selected model whose row for `locale` actually has content. */
function firstWithContent(models, locale) {
  for (const model of models) {
    const row = rowFor(model, locale)
    if (row && (row.title?.trim() || row.description?.trim())) return row
  }
  return null
}

/**
 * Prefills each language of a bulk edit from the first selected file that has
 * content there. The selected files are usually similar, so starting from real
 * values beats an empty form; the editor tweaks and applies to all. Languages
 * with no content anywhere stay blank and are left untouched on save.
 */
function prefillBulk(models) {
  for (const locale of SUPPORTED_LOCALES) {
    const row = firstWithContent(models, locale)
    form[locale] = { title: row?.title ?? '', description: row?.description ?? '' }
  }
}

/** Prefills only the initially-selected language from the flat public model. */
function prefillSelected(media) {
  blankForm()
  form[initialLang] = { title: media?.title ?? '', description: media?.description ?? '' }
}

/**
 * Merges the fetched model without disturbing the language already on screen:
 * the selected language keeps its (current, correct) fields and only gains its
 * row id, while the other languages are filled from the model. Used both after
 * the initial fetch and after an auto-translate, where the untouched languages
 * are exactly the ones to (re)fill.
 */
function mergeOthers(model) {
  for (const locale of SUPPORTED_LOCALES) {
    const row = rowFor(model, locale)
    rowIds[locale] = row?.id ?? null
    if (locale === initialLang) continue
    form[locale] = { title: row?.title ?? '', description: row?.description ?? '' }
  }
}

/** Day this file belongs to: an explicit prop, else its capture date. */
function ownDate() {
  return props.date ?? (single.value?.created ? String(single.value.created).slice(0, 10) : null)
}

/**
 * Reference points from the day itself and its immediate neighbours, so a photo
 * can be placed by eye. One `/media/locations` request over the three-day window
 * rather than fetching whole days. Single edits only — a bulk selection has no
 * single day.
 */
async function loadNeighborPoints() {
  neighborPoints.value = []
  if (isBulk.value) return
  const base = parseIsoDate(ownDate())
  if (!base) return

  try {
    const items = await fetchMediaLocations(
      toIsoDate(addDays(base, -1)),
      toIsoDate(addDays(base, 1)),
    )
    neighborPoints.value = items
      .filter((item) => item.id !== single.value?.id)
      .filter((item) => Number.isFinite(item.latitude) && Number.isFinite(item.longitude))
      .map((item) => ({ lat: item.latitude, lng: item.longitude }))
  } catch {
    // No reference points is fine; the picker still works.
  }
}

/**
 * Loads the full edit models. Anything already an edit model (the pending list)
 * is used as-is; otherwise it is fetched by id. Save stays disabled until this
 * resolves, so a file is never saved back without its id.
 */
async function loadModels() {
  loading.value = true
  models.value = []
  try {
    const list = editList.value
    if (list.every(isEditModel)) {
      // The pending list already has every language; nothing to fetch. The open
      // handler already hydrated the form from it (single).
      models.value = list
    } else {
      const ids = list.map((item) => item.id).filter((id) => id != null)
      models.value = ids.length ? await fetchMediaEdit(ids) : []
      // Single: fill the other languages, keeping the one on screen untouched.
      if (!isBulk.value && models.value[0]) mergeOthers(models.value[0])
    }

    // Bulk: prefill from the selected files once their full models are known.
    if (isBulk.value) prefillBulk(models.value)
  } catch (caught) {
    error.value = caught
  } finally {
    loading.value = false
  }
}

watch(
  () => [props.open, props.media, props.items],
  () => {
    if (!props.open || editList.value.length === 0) return

    initialLang = ui.locale
    activeLang.value = ui.locale
    error.value = null
    translated.value = false
    autoTranslate.value = false
    coordsTouched.value = false

    if (isBulk.value) {
      // Bulk: every field starts blank — blank means "leave untouched".
      blankForm()
    } else if (isEditModel(single.value)) {
      // From the pending list: it already carries every language.
      hydrateAll(single.value)
    } else {
      // From a public page: fill the selected language now, fetch the rest.
      prefillSelected(single.value)
    }

    // Single: prefill approval, the mark and the current coordinate. Bulk:
    // start neutral — there an unticked box means "leave these alone".
    approved.value = !isBulk.value
    favorite.value = !isBulk.value && single.value?.favorite === true
    hidden.value = !isBulk.value && isPrivate(single.value)

    /*
      Tags start from what the selection already carries — for one file that is
      its own set, for many it is the union of theirs.

      The union is shown rather than a blank field because the alternative is
      worse in both directions: an empty field looks like "these have no tags",
      and saving from it would be read as "and now they have none". Seeing the
      whole of what the selection holds is the only honest starting point.

      Whether any of it is *written* is a separate question — see `buildChanges`.
    */
    tagsTouched.value = false
    tagSlugs.value = [...new Set(editList.value.flatMap((item) => tagSlugsOf(item)))]
    coords.value =
      !isBulk.value &&
      Number.isFinite(single.value?.latitude) &&
      Number.isFinite(single.value?.longitude)
        ? { lat: single.value.latitude, lng: single.value.longitude }
        : null

    loadModels()
    loadNeighborPoints()
  },
  { immediate: true },
)

function onCoords(value) {
  coords.value = value
  coordsTouched.value = true
}

function onTags(value) {
  tagSlugs.value = value
  tagsTouched.value = true
}

/**
 * Slugs back into the ids `changes.tagIds` is specified in.
 *
 * The dictionary is the only place holding both, which makes this the one point
 * where a tag the client does not know about can go missing. It is reported
 * rather than dropped: the save replaces the whole set, so a silently skipped
 * slug would not be a tag left alone — it would be a tag taken off the file.
 */
function resolveTagIds() {
  const ids = []
  const missing = []
  for (const slug of tagSlugs.value) {
    const id = tagsStore.getBySlug(slug)?.id
    if (id == null) missing.push(slug)
    else ids.push(id)
  }
  return { ids, missing }
}

/** Every language with any content becomes a translation row, keeping its id. */
function buildTranslations() {
  const rows = []
  for (const locale of SUPPORTED_LOCALES) {
    const entry = form[locale]
    if (!entry) continue
    if (!entry.title.trim() && !entry.description.trim()) continue
    const row = {
      languageCode: locale,
      title: entry.title.trim(),
      description: entry.description.trim(),
    }
    // Single edit updates existing rows in place; bulk has no per-row id.
    if (!isBulk.value && rowIds[locale] != null) row.id = rowIds[locale]
    rows.push(row)
  }
  return rows
}

function buildChanges() {
  const changes = {}
  const translations = buildTranslations()
  if (translations.length) changes.translations = translations

  if (isBulk.value) {
    // Bulk: only touch what the editor deliberately set.
    if (coordsTouched.value && coords.value) {
      changes.latitude = coords.value.lat
      changes.longitude = coords.value.lng
    }
    if (approved.value) changes.isApproved = true
    // Same rule as approval: a bulk tick marks the whole selection, an untouched
    // box leaves each file as it was. Taking a mark off is the star's job, one
    // file at a time — which is also the only place it is ever wanted.
    if (favorite.value) changes.favorite = true
    // And the same rule again for hiding, which is the direction that matters:
    // a batch just pulled off a camera is hidden wholesale, and let back out one
    // at a time once it has been looked at. An untouched box cannot mean "show
    // these", or a bulk edit of anything else would quietly publish the lot.
    if (hidden.value) changes.private = true
    /*
      Tags are the one field where a bulk save cannot be additive: the command
      *replaces* the set on every file it touches. Sending the union that was
      shown as the starting point would therefore hand every selected file every
      tag any of them had — a silent merge nobody asked for.

      So the untouched case sends nothing at all, and each file keeps what it
      had. Once the editor has actually changed the list they have said what the
      whole selection should carry, and that is what is written.
    */
    if (tagsTouched.value) changes.tagIds = resolveTagIds().ids
  } else {
    changes.latitude = coords.value?.lat ?? null
    changes.longitude = coords.value?.lng ?? null
    changes.isApproved = approved.value
    changes.favorite = favorite.value
    changes.private = hidden.value
    changes.tagIds = resolveTagIds().ids
  }
  return changes
}

/** Fills the tabs from an auto-translate response so the editor can review it. */
function applyTranslated(items) {
  if (isBulk.value) {
    // Bulk applied one set of values to all, so any returned item is a fair
    // representative of the resulting translations.
    const first = items?.[0]
    if (!first) return false
    hydrateAll(first)
  } else {
    const updated = items?.find((item) => item.id === single.value?.id) ?? items?.[0]
    if (!updated) return false
    // Keep the language the editor wrote; refill the machine-translated ones.
    mergeOthers(updated)
  }
  translated.value = true
  return true
}

/**
 * Writes what came back onto the very objects the page is showing.
 *
 * The files being edited *are* the ones in the grid behind this dialog — the
 * same objects, handed down as props — so assigning to them is what puts a new
 * title, tag or mark under the photograph the instant the dialog closes. The
 * page is then told whether this happened, and only refetches if it did not.
 *
 * @returns {boolean} false when the response carried nothing to write.
 */
function applySaved(items) {
  if (!Array.isArray(items) || items.length === 0) return false

  const targets = new Map(
    editList.value.filter((media) => media?.id != null).map((media) => [media.id, media]),
  )

  let written = 0
  for (const saved of items) {
    const target = targets.get(saved?.id)
    if (!target) continue
    applySavedMedia(target, saved, ui.locale)
    written += 1
  }
  return written > 0
}

async function save() {
  const ids = models.value.map((model) => model.id).filter((id) => id != null)
  if (ids.length === 0) return

  // Refused rather than half-applied: see `resolveTagIds`.
  const unresolved = resolveTagIds().missing
  if (unresolved.length) {
    ui.notify(t('tags.unresolved', { tags: unresolved.join(', ') }), 'error')
    return
  }

  saving.value = true
  error.value = null
  try {
    const response = await editMedia(ids, buildChanges(), { autoTranslate: autoTranslate.value })

    // With translation on, keep the dialog open so the machine output can be
    // reviewed before the editor leaves — for bulk as well as single.
    if (autoTranslate.value && applyTranslated(response?.items)) {
      ui.notify(t('editor.translationReview'), 'info')
      autoTranslate.value = false
      return
    }

    const applied = applySaved(response?.items)
    ui.notify(t('admin.saved'), 'success')
    // `approved` is what takes a file out of the pending queue, and the answer
    // carries no such field — only this dialog knows whether the box was ticked.
    emit('saved', { ids, applied, approved: approved.value })
    emit('close')
  } catch (caught) {
    error.value = caught
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <ModalDialog
    :open="open"
    :title="isBulk ? t('editor.editBulk', { count: editList.length }) : t('editor.editMedia')"
    @close="emit('close')"
  >
    <form v-if="editList.length" class="space-y-4" @submit.prevent="save">
      <!-- Every file being edited, so a bulk change is done with the set in view. -->
      <div class="flex flex-wrap gap-1.5">
        <img
          v-for="item in thumbs"
          :key="item.id ?? item.fileName"
          :src="previewSrc(item) || miniatureSrc(item)"
          :alt="item.title || item.fileName"
          loading="lazy"
          class="h-16 w-16 rounded object-cover ring-1 ring-edge"
        />
      </div>

      <p v-if="isBulk" class="rounded-md bg-edge/40 px-3 py-2 text-xs text-ink-soft">
        {{ t('editor.bulkHint') }}
      </p>

      <LanguageTabs v-model="activeLang" :disabled="loading" />

      <div>
        <label class="field-label" for="media-title">{{ t('editor.title') }}</label>
        <input id="media-title" v-model="active.title" type="text" class="field-input" :disabled="loading" />
      </div>

      <div>
        <label class="field-label" for="media-description">{{ t('editor.description') }}</label>
        <textarea
          id="media-description"
          v-model="active.description"
          rows="4"
          class="field-input"
          :disabled="loading"
        />
      </div>

      <!-- Outside the language tabs on purpose: a tag is the same tag in all
           three, and putting it under a tab would suggest otherwise. -->
      <div>
        <TagPicker :model-value="tagSlugs" :disabled="loading" @update:model-value="onTags" />
        <p v-if="isBulk" class="field-hint">{{ t('tags.bulkHint') }}</p>
      </div>

      <MediaLocationPicker :model-value="coords" :points="neighborPoints" @update:model-value="onCoords" />

      <label class="flex items-center gap-2 text-sm text-ink-soft">
        <input v-model="approved" type="checkbox" class="rounded border-edge" />
        {{ t('editor.approved') }}
      </label>

      <div>
        <label class="flex items-center gap-2 text-sm text-ink-soft">
          <input v-model="favorite" type="checkbox" class="rounded border-edge" />
          {{ t('editor.favorite') }}
        </label>
        <p v-if="isBulk" class="field-hint">{{ t('editor.favoriteBulkHint') }}</p>
      </div>

      <div>
        <label class="flex items-center gap-2 text-sm text-ink-soft">
          <input v-model="hidden" type="checkbox" class="rounded border-edge" />
          {{ t('editor.hidden') }}
        </label>
        <p class="field-hint">
          {{ isBulk ? t('editor.hiddenBulkHint') : t('editor.hiddenHint') }}
        </p>
      </div>

      <div>
        <label class="flex items-center gap-2 text-sm text-ink-soft">
          <input v-model="autoTranslate" type="checkbox" class="rounded border-edge" />
          {{ t('editor.autoTranslate') }}
        </label>
        <p class="field-hint">{{ t('editor.autoTranslateHint') }}</p>
      </div>

      <p v-if="translated" class="rounded-md bg-accent-soft px-3 py-2 text-xs text-ink">
        {{ t('editor.translationReview') }}
      </p>

      <!--
        Filing one photograph is rarely filing one photograph. The panel loads on
        its own and only for a single file — "similar to these forty" is not a
        question with an answer.
      -->
      <SimilarMediaPanel v-if="open && single" :media="single" :tag-slugs="tagSlugs" />

      <p v-if="showLoading" class="text-xs text-ink-faint">{{ t('common.loading') }}</p>

      <p v-if="error" role="alert" class="text-sm text-accent">
        {{ error.detail || error.title || t('errors.generic') }}
      </p>
    </form>

    <template #footer>
      <button
        v-if="deletable && single"
        type="button"
        class="btn-danger mr-auto"
        @click="emit('delete', single)"
      >
        {{ t('common.delete') }}
      </button>
      <button type="button" class="btn-ghost" @click="emit('close')">
        {{ t('common.cancel') }}
      </button>
      <button type="button" class="btn-primary" :disabled="!canSave" @click="save">
        {{ saving ? t('common.saving') : t('common.save') }}
      </button>
    </template>
  </ModalDialog>
</template>
