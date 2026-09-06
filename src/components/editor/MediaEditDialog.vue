<script setup>
import { ref, reactive, watch, computed, defineAsyncComponent } from 'vue'
import { useI18n } from 'vue-i18n'
import ModalDialog from '@/components/common/ModalDialog.vue'
import LanguageTabs from './LanguageTabs.vue'
import TagPicker from './TagPicker.vue'
import TriStateCheck from './TriStateCheck.vue'
import SimilarMediaPanel from './SimilarMediaPanel.vue'
// Lazy so Leaflet is not pulled into the main bundle - this dialog is mounted
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
  /**
   * Offers a delete action; the parent owns the confirmation and the request.
   *
   * For one file or for the whole selection alike - `delete` carries the list,
   * and how many it holds is the caller's own business.
   */
  deletable: { type: Boolean, default: false },
})

const emit = defineEmits(['close', 'saved', 'delete'])

const { t } = useI18n()
const ui = useUiStore()
const tagsStore = useTagsStore()

/*
  The files being edited, one or forty. **A computed, never a ref maintained by a
  watcher** - props are patched in template order, so a watcher runs against a
  list that is not there yet. See docs/features/media-editor.md.
*/
const editList = computed(() =>
  props.items?.length ? props.items : props.media ? [props.media] : [],
)
const isBulk = computed(() => editList.value.length > 1)
const single = computed(() => (isBulk.value ? null : editList.value[0]))

// Full edit models (id + every language), fetched when the caller only had the
// flattened public model. Save is blocked until these arrive.
const models = ref([])
const loading = ref(false)

/*
  One row per language, exactly as the server holds them. **Never seeded from the
  public model**, which is flattened by fallback and would put Japanese text in
  the Russian field. The editor waits for `/media/edit`.
  See docs/features/media-editor.md.
*/
const form = reactive({})
/*
  What each language looked like when the editor last received it. **Sending a
  field unchanged is still a write**, so nothing goes unless it differs from
  this. See docs/features/media-editor.md.
*/
const baseline = reactive({})
// Translation row ids per language, so an existing row is updated in place.
const rowIds = reactive({})
const activeLang = ref(ui.locale)
const coords = ref(null)
const coordsTouched = ref(false)
/*
  Tags belong to the file, not to a translation, so they sit outside the language
  tabs. Held as slugs - the only name a media model carries; the ids a save wants
  are looked up at save time. See docs/features/tags.md.
*/
const tagSlugs = ref([])
const tagsTouched = ref(false)
const approved = ref(false)
const favorite = ref(false)
const hidden = ref(false)

/*
  The three marks, and whether each box was **pressed** rather than merely shown.
  They show what the files carry, which is exactly why their values must not be
  posted unasked. See docs/features/media-editor.md.
*/
const approvedTouched = ref(false)
const favoriteTouched = ref(false)
const hiddenTouched = ref(false)

/**
 * How a selection answers a yes-or-no question: `true`, `false`, or neither.
 *
 * `null` is the third state, and it is not a value - it is the absence of an
 * agreement. Drawing it as "no" would be a claim about files that say yes.
 */
function markState(reader) {
  const list = editList.value
  if (!list.length) return false
  const first = reader(list[0])
  return list.every((media) => reader(media) === first) ? first : null
}

const approvedState = computed(() => markState((media) => media?.isApproved === true))
const favoriteState = computed(() => markState((media) => media?.favorite === true))
const hiddenState = computed(() => markState((media) => isPrivate(media)))

// Shown as the third state until the box is pressed; after that it is a value
// like any other, and a dash would describe a disagreement already settled.
const approvedMixed = computed(() => !approvedTouched.value && approvedState.value === null)
const favoriteMixed = computed(() => !favoriteTouched.value && favoriteState.value === null)
const hiddenMixed = computed(() => !hiddenTouched.value && hiddenState.value === null)
const anyMixed = computed(() => approvedMixed.value || favoriteMixed.value || hiddenMixed.value)
const autoTranslate = ref(false)
const saving = ref(false)
const error = ref(null)
const translated = ref(false)
const neighborPoints = ref([])

// Said out loud only if the wait actually lasts - see composables/useDelayed.
const showLoading = useDelayed(() => loading.value)

/*
  Folded away rather than thrown away: a backdrop press is how people look at the
  photograph they are describing. The cross keeps its own meaning.
  See docs/features/media-editor.md.
*/
const minimised = ref(false)

const cardName = computed(() =>
  isBulk.value
    ? t('editor.editBulk', { count: editList.value.length })
    : (single.value?.title || single.value?.fileName || t('media.untitled')),
)

function discardCard() {
  minimised.value = false
  emit('close')
}

const active = computed(() => form[activeLang.value] ?? { title: '', description: '' })
const thumbs = computed(() => editList.value)

/**
 * Where the files being edited already sit. Only for a selection: one file has a
 * pin of its own on the map, and drawing it twice would say two things.
 */
const ownPoints = computed(() =>
  isBulk.value
    ? editList.value
        .filter((media) => Number.isFinite(media?.latitude) && Number.isFinite(media?.longitude))
        .map((media) => ({ lat: media.latitude, lng: media.longitude }))
    : [],
)
const canSave = computed(() => !loading.value && !saving.value && models.value.length > 0)

/** An entity is already a full edit model when it carries a translations array. */
function isEditModel(entity) {
  return Array.isArray(entity?.translations)
}

/** Takes the fields as they now stand to be the state the server is in. */
function rememberBaseline() {
  for (const locale of SUPPORTED_LOCALES) {
    baseline[locale] = { ...form[locale] }
  }
}

function blankForm() {
  for (const locale of SUPPORTED_LOCALES) {
    form[locale] = { title: '', description: '' }
    rowIds[locale] = null
  }
  rememberBaseline()
}

function rowFor(model, locale) {
  const rows = Array.isArray(model?.translations) ? model.translations : []
  return rows.find((entry) => entry?.languageCode === locale) ?? null
}

/**
 * Fills every language tab from a full edit model. `asBaseline` separates what
 * the server holds from a machine translation, which must count as changed.
 */
function hydrateAll(model, { asBaseline = true } = {}) {
  for (const locale of SUPPORTED_LOCALES) {
    const row = rowFor(model, locale)
    form[locale] = { title: row?.title ?? '', description: row?.description ?? '' }
    rowIds[locale] = row?.id ?? null
  }
  if (asBaseline) rememberBaseline()
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
  // Prefilled, and therefore unchanged: what is on screen is a starting point to
  // edit from, not something the editor has said should go to every file.
  rememberBaseline()
}

/** When the file being edited was taken; for a selection, the earliest of them. */
function ownCreated() {
  const stamps = editList.value
    .map((item) => item?.created)
    .filter(Boolean)
    .map(String)
    .sort()
  return stamps[0] ?? null
}

/** Day this file belongs to: an explicit prop, else its capture date. */
function ownDate() {
  return props.date ?? ownCreated()?.slice(0, 10) ?? null
}

/**
 * Reference points over a **three-day window**, one `/media/locations` request.
 * Each carries `before`, which lets the picker frame the gap the photograph fell
 * into. See docs/features/media-editor.md.
 */
async function loadNeighborPoints() {
  neighborPoints.value = []
  const base = parseIsoDate(ownDate())
  if (!base) return

  const own = ownCreated()
  const editing = new Set(editList.value.map((item) => item?.id).filter((id) => id != null))

  try {
    const items = await fetchMediaLocations(
      toIsoDate(addDays(base, -1)),
      toIsoDate(addDays(base, 1)),
    )
    neighborPoints.value = items
      .filter((item) => !editing.has(item.id))
      .filter((item) => Number.isFinite(item.latitude) && Number.isFinite(item.longitude))
      // Sorted, because the picker joins them into the path that was walked -
      // and a path drawn in the order a server happened to return rows is a
      // scribble rather than a route.
      .sort((a, b) => String(a.created ?? '').localeCompare(String(b.created ?? '')))
      .map((item) => ({
        lat: item.latitude,
        lng: item.longitude,
        created: item.created ?? null,
        before: own ? String(item.created ?? '') <= own : null,
      }))
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
      // Every language from the model, the one on screen included - and the
      // marks with them, since the flat model on the page can only be as fresh
      // as the page is.
      if (!isBulk.value && models.value[0]) {
        hydrateAll(models.value[0])
        // Unless it has been pressed in the meantime, which the disabled fields
        // make unlikely but not impossible.
        if (!approvedTouched.value) approved.value = models.value[0].isApproved === true
      }
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

    // A fresh open is never a folded one, whatever the last one ended as.
    minimised.value = false
    activeLang.value = ui.locale
    error.value = null
    translated.value = false
    autoTranslate.value = false
    coordsTouched.value = false

    if (!isBulk.value && isEditModel(single.value)) {
      // From the pending list: it already carries every language, so there is
      // nothing to wait for.
      hydrateAll(single.value)
    } else {
      // Blank until the rows arrive. For a bulk edit blank is also the final
      // state of anything nobody fills in - it means "leave this alone".
      blankForm()
    }

    // The marks as the files carry them. A disagreeing selection shows the third
    // state and holds `false` underneath, as a browser does.
    approvedTouched.value = false
    favoriteTouched.value = false
    hiddenTouched.value = false
    approved.value = approvedState.value === true
    favorite.value = favoriteState.value === true
    hidden.value = hiddenState.value === true

    // Tags start from the **union** of what the selection carries; a blank field
    // would read as "these have no tags". Whether it is written is `buildChanges`.
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
 * Slugs back into the ids `changes.tagIds` wants. **An unresolvable slug is
 * reported, never dropped** - the save replaces the set, so a skipped slug is a
 * tag taken off the file. See docs/features/tags.md.
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

/** Whether either half of a language's translation has been edited. */
function localeChanged(locale) {
  const now = form[locale]
  const was = baseline[locale]
  if (!now) return false
  return (
    now.title.trim() !== (was?.title ?? '').trim() ||
    now.description.trim() !== (was?.description ?? '').trim()
  )
}

/**
 * The languages that were edited - and, when translating, every language with
 * any text, since the backend fills the empty ones from what it is given.
 * Blank counts as an edit when it used to hold something.
 * See docs/features/media-editor.md.
 */
function buildTranslations() {
  const rows = []
  for (const locale of SUPPORTED_LOCALES) {
    const entry = form[locale]
    if (!entry) continue

    const written = Boolean(entry.title.trim() || entry.description.trim())
    if (!localeChanged(locale) && !(autoTranslate.value && written)) continue

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
    // One rule for one file and for forty: a box that was pressed says what the
    // whole selection should be, and one that was not says nothing at all.
    if (approvedTouched.value) changes.isApproved = approved.value
    if (favoriteTouched.value) changes.favorite = favorite.value
    if (hiddenTouched.value) changes.private = hidden.value
    // `tagIds` **replaces** the set on every file it touches, so sending the
    // union unprompted would be a silent merge. Untouched sends nothing.
    if (tagsTouched.value) changes.tagIds = resolveTagIds().ids
  } else {
    changes.latitude = coords.value?.lat ?? null
    changes.longitude = coords.value?.lng ?? null
    if (approvedTouched.value) changes.isApproved = approved.value
    if (favoriteTouched.value) changes.favorite = favorite.value
    if (hiddenTouched.value) changes.private = hidden.value
    changes.tagIds = resolveTagIds().ids
  }
  return changes
}

/**
 * Fills the tabs from a translation so it can be read before it is kept.
 * **`asBaseline: false`** - it is a proposal, and must count as changed or the
 * save that follows sends nothing. See docs/features/media-editor.md.
 */
function applyTranslated(items) {
  if (isBulk.value) {
    // Bulk applied one set of values to all, so any returned item is a fair
    // representative of the resulting translations.
    const first = items?.[0]
    if (!first) return false
    hydrateAll(first, { asBaseline: false })
  } else {
    const updated = items?.find((item) => item.id === single.value?.id) ?? items?.[0]
    if (!updated) return false
    hydrateAll(updated, { asBaseline: false })
  }
  translated.value = true
  return true
}

/**
 * Writes what came back onto the very objects the page is showing - they are the
 * same objects the grid behind holds. The page refetches only if this fails.
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
    // reviewed before the editor leaves - for bulk as well as single.
    if (autoTranslate.value && applyTranslated(response?.items)) {
      ui.notify(t('editor.translationReview'), 'info')
      autoTranslate.value = false
      return
    }

    const applied = applySaved(response?.items)
    ui.notify(t('admin.saved'), 'success')
    // What takes a file out of the pending queue, and the answer carries no such
    // field - only this dialog knows whether the box was pressed, and to what.
    emit('saved', { ids, applied, approved: approvedTouched.value && approved.value })
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
    :open="open && !minimised"
    :title="isBulk ? t('editor.editBulk', { count: editList.length }) : t('editor.editMedia')"
    @close="emit('close')"
    @dismiss="minimised = true"
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

      <!-- Shut while the rows are on their way; one attribute, no per-field
           bookkeeping. `SimilarMediaPanel` sits **outside** it deliberately.
           See docs/features/media-editor.md. -->
      <fieldset
        :disabled="loading"
        class="m-0 space-y-4 border-0 p-0 transition-opacity"
        :class="loading ? 'opacity-50' : ''"
      >
        <LanguageTabs v-model="activeLang" :disabled="loading" />

        <div>
          <label class="field-label" for="media-title">{{ t('editor.title') }}</label>
          <input id="media-title" v-model="active.title" type="text" class="field-input" />
        </div>

        <div>
          <label class="field-label" for="media-description">{{ t('editor.description') }}</label>
          <textarea
            id="media-description"
            v-model="active.description"
            rows="4"
            class="field-input"
          />
        </div>

        <!-- Outside the language tabs on purpose: a tag is the same tag in all
             three, and putting it under a tab would suggest otherwise. -->
        <div>
          <TagPicker :model-value="tagSlugs" :disabled="loading" @update:model-value="onTags" />
          <p v-if="isBulk" class="field-hint">{{ t('tags.bulkHint') }}</p>
        </div>

        <!-- A map is not a form control, so `disabled` never reaches it; the
             clicks are turned off by hand. -->
        <div :class="loading ? 'pointer-events-none' : ''">
          <MediaLocationPicker
            :model-value="coords"
            :points="neighborPoints"
            :own-points="ownPoints"
            @update:model-value="onCoords"
          />
        </div>

        <label class="flex items-center gap-2 text-sm text-ink-soft">
          <TriStateCheck
            v-model="approved"
            :mixed="approvedMixed"
            @change="approvedTouched = true"
          />
          {{ t('editor.approved') }}
        </label>

        <div>
          <label class="flex items-center gap-2 text-sm text-ink-soft">
            <TriStateCheck
              v-model="favorite"
              :mixed="favoriteMixed"
              @change="favoriteTouched = true"
            />
            {{ t('editor.favorite') }}
          </label>
          <p v-if="isBulk" class="field-hint">{{ t('editor.favoriteBulkHint') }}</p>
        </div>

        <div>
          <label class="flex items-center gap-2 text-sm text-ink-soft">
            <TriStateCheck v-model="hidden" :mixed="hiddenMixed" @change="hiddenTouched = true" />
            {{ t('editor.hidden') }}
          </label>
          <p class="field-hint">
            {{ isBulk ? t('editor.hiddenBulkHint') : t('editor.hiddenHint') }}
          </p>
        </div>

        <!-- Said once, under the marks it applies to, and only where a selection
             can disagree with itself. -->
        <p v-if="isBulk && anyMixed" class="field-hint">{{ t('editor.mixedHint') }}</p>

        <div>
          <label class="flex items-center gap-2 text-sm text-ink-soft">
            <input v-model="autoTranslate" type="checkbox" class="rounded border-edge" />
            {{ t('editor.autoTranslate') }}
          </label>
          <p class="field-hint">{{ t('editor.autoTranslateHint') }}</p>
          <!-- The one case where the "only what you changed" rule is suspended,
               and on a selection that means every file gets this text. -->
          <p v-if="isBulk && autoTranslate" class="field-hint text-accent">
            {{ t('editor.autoTranslateBulkWarning') }}
          </p>
        </div>

        <p v-if="translated" class="rounded-md bg-accent-soft px-3 py-2 text-xs text-ink">
          {{ t('editor.translationReview') }}
        </p>
      </fieldset>

      <!--
        Filing one photograph is rarely filing one photograph. The panel loads on
        its own and only for a single file - "similar to these forty" is not a
        question with an answer.
      -->
      <SimilarMediaPanel v-if="open && single" :media="single" :tag-slugs="tagSlugs" />

      <p v-if="showLoading" class="text-xs text-ink-faint">{{ t('common.loading') }}</p>

      <p v-if="error" role="alert" class="text-sm text-accent">
        {{ error.detail || error.title || t('errors.generic') }}
      </p>
    </form>

    <template #footer>
      <!--
        The one destructive control on the card, and it says how much it is
        about to take: deleting is exactly as available for forty files as for
        one, and the count is the difference between the two.
      -->
      <button
        v-if="deletable && editList.length"
        type="button"
        class="btn-danger mr-auto"
        @click="emit('delete', editList)"
      >
        {{ isBulk ? t('admin.deleteCount', { count: editList.length }) : t('common.delete') }}
      </button>
      <button type="button" class="btn-ghost" @click="emit('close')">
        {{ t('common.cancel') }}
      </button>
      <!-- With translation ticked the button does something else: it sends the
           card *and* asks for the empty languages to be filled, then keeps the
           dialog open so the machine's work can be read. Calling that "save"
           describes half of it. -->
      <button type="button" class="btn-primary" :disabled="!canSave" @click="save">
        {{
          saving
            ? t('common.saving')
            : autoTranslate
              ? t('editor.translateAction')
              : t('common.save')
        }}
      </button>
    </template>
  </ModalDialog>

  <!--
    Below the modal layer on purpose: a viewer opened from the card sits over
    this, and a control floating on top of that would belong to nothing visible.
  -->
  <Teleport to="body">
    <Transition
      enter-from-class="translate-y-4 opacity-0"
      enter-active-class="transition duration-200"
      leave-to-class="translate-y-4 opacity-0"
      leave-active-class="transition duration-200"
    >
      <div
        v-if="open && minimised"
        class="fixed inset-x-0 bottom-6 z-[1900] flex justify-center px-4"
      >
        <div
          class="flex max-w-full flex-wrap items-center justify-center gap-x-3 gap-y-2 rounded-3xl border border-edge bg-paper-raised px-4 py-2 shadow-lg"
        >
          <span class="min-w-0 truncate text-sm text-ink">
            {{ t('editor.minimised', { name: cardName }) }}
          </span>
          <button type="button" class="btn-primary !px-3 !py-1.5" @click="minimised = false">
            {{ t('editor.resume') }}
          </button>
          <button
            type="button"
            class="text-sm text-ink-faint transition hover:text-ink"
            @click="discardCard"
          >
            {{ t('editor.discard') }}
          </button>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
