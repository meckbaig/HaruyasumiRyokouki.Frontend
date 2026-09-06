<script setup>
import { ref, reactive, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import ModalDialog from '@/components/common/ModalDialog.vue'
import LoadingIndicator from '@/components/common/LoadingIndicator.vue'
import { completeTag, createTag, editTag } from '@/api/tags'
import { useTagsStore } from '@/stores/tags'
import { useUiStore } from '@/stores/ui'
import { SUPPORTED_LOCALES } from '@/i18n'
import { tagLabel } from '@/services/tags'

const props = defineProps({
  open: { type: Boolean, default: false },
  /** Existing tag to edit; null means a new one is being coined. */
  tag: { type: Object, default: null },
  /** Word the new tag is being made from, when creating. */
  seed: { type: String, default: '' },
  /** Sits over another dialog - see ModalDialog. */
  stacked: { type: Boolean, default: false },
  /** What clicking a near-duplicate means: "that one is what I meant" in the media
   *  editor, "let me see it first" on the tag screen. See docs/features/tags.md. */
  inspect: { type: Boolean, default: false },
})

const emit = defineEmits(['close', 'saved', 'pick'])

const { t } = useI18n()
const tags = useTagsStore()
const ui = useUiStore()

const editing = computed(() => Boolean(props.tag?.id))

/*
  Coining a tag is two steps, and the first is a single word. Skipped when the
  picker already has one; asked for on the tag screen, where an empty form is the
  one thing the arrangement exists to prevent. See docs/features/tags.md.
*/
const step = ref('form')
const seedWord = ref('')

/*
  A proposal costs tokens and a wait, and the editor wants to go and look at the
  tag it says already exists - so the dialog folds to a bar rather than closing.
  See docs/features/tags.md.
*/
const minimised = ref(false)

const slug = ref('')
/** One caption per language, keyed by locale. */
const captions = reactive({})
/** Aliases as a flat list; language is carried on each row. */
const aliases = ref([])
const similar = ref([])

/*
  Two waits, and not the same wait: a proposal **replaces** the form, so the
  fields lock; asking for aliases only appends, so nothing does.
  See docs/features/tags.md.
*/
const proposing = ref(false)
const suggesting = ref(false)
const saving = ref(false)
const error = ref(null)

const busy = computed(() => proposing.value || suggesting.value)

/** Every language must end up with a caption - a hole is invisible from whichever
 *  language you filled in, and shows a Russian word to a Japanese reader. */
const complete = computed(() => SUPPORTED_LOCALES.every((locale) => captions[locale]?.trim()))
const canSave = computed(() => !busy.value && !saving.value && complete.value && slug.value.trim())

function blank() {
  for (const locale of SUPPORTED_LOCALES) captions[locale] = ''
  slug.value = ''
  aliases.value = []
  similar.value = []
  error.value = null
}

/** Fills the form from a `TagDto`, from the server or from the dictionary. */
function hydrate(tag) {
  blank()
  if (!tag) return
  slug.value = tag.slug ?? ''
  for (const row of tag.translations ?? []) {
    if (row?.languageCode) captions[row.languageCode] = row.text ?? ''
  }
  aliases.value = (tag.aliases ?? [])
    .filter((row) => row?.text)
    .map((row) => ({ languageCode: row.languageCode ?? ui.locale, text: row.text }))
}

/**
 * The first of the two steps. **Saves nothing**: the proposal comes from a
 * language model, and the near-duplicates it returns are the check against
 * coining "torii" beside "torii gate". See docs/features/tags.md.
 */
async function propose(word) {
  proposing.value = true
  error.value = null
  try {
    const answer = await completeTag(word)
    hydrate(answer.tag)
    // The word that was typed is the one meaning the editor is sure of; keep it
    // over whatever the model proposed for that language.
    if (!answer.tag?.translations?.some((row) => row.languageCode === ui.locale)) {
      captions[ui.locale] = word
    }
    similar.value = answer.similarExisting ?? []
  } catch (caught) {
    error.value = caught
    // A proposal that never arrived is not a reason to lose the word: the form
    // still opens, with the one caption that is known for certain.
    captions[ui.locale] = word
  } finally {
    proposing.value = false
  }
}

watch(
  () => [props.open, props.tag, props.seed],
  () => {
    if (!props.open) return
    // A fresh open is never a folded one, whatever the last one ended as.
    minimised.value = false

    if (editing.value) {
      step.value = 'form'
      hydrate(props.tag)
      return
    }

    blank()
    seedWord.value = props.seed.trim()
    if (seedWord.value) {
      step.value = 'form'
      captions[ui.locale] = seedWord.value
      propose(seedWord.value)
    } else {
      step.value = 'seed'
    }
  },
  { immediate: true },
)

/** First step done: ask for the proposal and move on to reading it. */
async function askProposal() {
  const word = seedWord.value.trim()
  if (!word) return
  step.value = 'form'
  captions[ui.locale] = word
  await propose(word)
}

/** Straight to an empty form, for a word the model has nothing useful to say about. */
function skipProposal() {
  const word = seedWord.value.trim()
  if (word) captions[ui.locale] = word
  step.value = 'form'
}

function addAlias() {
  aliases.value = [...aliases.value, { languageCode: ui.locale, text: '' }]
}

function removeAlias(index) {
  aliases.value = aliases.value.filter((_, at) => at !== index)
}

/**
 * Asks on whichever caption is filled in, reader's language first - refusing
 * because the interface is in another one would be a silent no-op.
 */
function firstCaption() {
  const own = captions[ui.locale]?.trim()
  if (own) return own
  for (const locale of SUPPORTED_LOCALES) {
    const text = captions[locale]?.trim()
    if (text) return text
  }
  return ''
}

async function suggestAliases() {
  const word = firstCaption()
  if (!word) {
    ui.notify(t('tags.needCaptionFirst'), 'info')
    return
  }

  suggesting.value = true
  error.value = null
  try {
    const answer = await completeTag(word)
    const known = new Set(aliases.value.map((row) => `${row.languageCode}::${row.text}`))
    let added = 0
    for (const row of answer.tag?.aliases ?? []) {
      const key = `${row.languageCode}::${row.text}`
      if (row?.text && !known.has(key)) {
        known.add(key)
        aliases.value.push({ languageCode: row.languageCode ?? ui.locale, text: row.text })
        added += 1
      }
    }
    // A proposal that adds nothing is still an answer, and an unchanged screen
    // is indistinguishable from a button that did not work.
    if (!added) ui.notify(t('tags.aliasesNoneNew'), 'info')
  } catch (caught) {
    error.value = caught
  } finally {
    suggesting.value = false
  }
}

function buildBody() {
  return {
    slug: slug.value.trim(),
    translations: SUPPORTED_LOCALES.map((locale) => ({
      languageCode: locale,
      text: captions[locale].trim(),
    })),
    aliases: aliases.value
      .filter((row) => row.text.trim())
      .map((row) => ({ languageCode: row.languageCode, text: row.text.trim() })),
  }
}

async function save() {
  if (!canSave.value) return
  saving.value = true
  error.value = null
  try {
    const body = buildBody()
    const saved = editing.value ? await editTag(props.tag.id, body) : await createTag(body)
    if (saved) tags.upsert(saved)
    ui.notify(t('admin.saved'), 'success')
    emit('saved', saved)
    emit('close')
  } catch (caught) {
    error.value = caught
  } finally {
    saving.value = false
  }
}

/** A near-duplicate was clicked. What that means is the host's to say. */
function pickExisting(tag) {
  emit('pick', tag)
  if (props.inspect) minimised.value = true
  else emit('close')
}

/** Name for the folded bar: whatever this tag is called so far. */
const draftName = computed(() => firstCaption() || seedWord.value.trim())

function discardDraft() {
  minimised.value = false
  emit('close')
}
</script>

<template>
  <ModalDialog
    :open="open && !minimised"
    :stacked="stacked"
    :title="editing ? t('tags.editTitle') : t('tags.createTitle')"
    @close="emit('close')"
    @dismiss="emit('close')"
  >
    <!--
      Step one. One field, and the proposal is what fills the rest of the form:
      three captions, a slug, a handful of aliases, and the existing tags that
      look like near-duplicates of this one.
    -->
    <form v-if="step === 'seed'" class="space-y-4" @submit.prevent="askProposal">
      <div>
        <label class="field-label" for="tag-seed">{{ t('tags.seedLabel') }}</label>
        <input
          id="tag-seed"
          v-model="seedWord"
          type="text"
          class="field-input"
          :placeholder="t('tags.seedPlaceholder')"
        />
        <p class="field-hint">{{ t('tags.seedHint') }}</p>
      </div>
    </form>

    <form v-else class="space-y-4" @submit.prevent="save">
      <!--
        Near-duplicates first, and loudly. By the time the form is scrolled the
        decision has already been made; the whole value of this block is that it
        is read before anything is typed.
      -->
      <div v-if="similar.length" class="rounded-md border border-accent/40 bg-accent-soft p-3">
        <p class="text-xs font-medium text-ink">{{ t('tags.similarTitle') }}</p>
        <p class="mt-1 text-xs text-ink-soft">{{ t('tags.similarHint') }}</p>
        <div class="mt-2 flex flex-wrap gap-1.5">
          <!-- The count is the thing that settles it: a near-duplicate used a
               hundred times is the established name and this proposal is the
               duplicate, while one used twice may be the mistake. -->
          <button
            v-for="item in similar"
            :key="item.id"
            type="button"
            class="rounded-full border border-edge bg-paper-raised px-2.5 py-1 text-xs text-ink-soft transition hover:border-ink-faint hover:text-ink"
            :title="inspect ? t('tags.similarInspect') : t('tags.similarUse')"
            @click="pickExisting(item)"
          >
            #{{ tagLabel(item, ui.locale) }}
            <span v-if="item.usageCount != null" class="ml-1.5 text-ink-faint">
              {{ t('tags.usedOn', { count: item.usageCount }, item.usageCount) }}
            </span>
          </button>
        </div>
      </div>

      <!-- While a proposal is in flight the form below is about to be replaced
           wholesale, so it is dimmed and locked rather than left looking
           editable. -->
      <LoadingIndicator v-if="proposing" :message="t('tags.proposing')" />

      <div :class="proposing ? 'pointer-events-none opacity-40' : ''">
        <span class="field-label">{{ t('tags.captions') }}</span>
        <p class="field-hint mb-2">{{ t('tags.captionsHint') }}</p>
        <div class="space-y-2">
          <label v-for="locale in SUPPORTED_LOCALES" :key="locale" class="flex items-center gap-2">
            <span class="w-8 shrink-0 text-xs uppercase text-ink-faint">{{ locale }}</span>
            <input
              v-model="captions[locale]"
              type="text"
              class="field-input"
              :disabled="proposing"
              :placeholder="t('tags.captionPlaceholder')"
            />
          </label>
        </div>
      </div>

      <div :class="proposing ? 'pointer-events-none opacity-40' : ''">
        <div class="mb-1 flex items-center justify-between gap-4">
          <span class="field-label mb-0">{{ t('tags.aliases') }}</span>
          <!-- Appending, not replacing: the list stays usable, and the wait is
               announced right here instead of over the whole dialog. -->
          <span v-if="suggesting" class="flex items-center gap-1.5 text-xs text-ink-faint">
            <span
              class="spinner h-3 w-3 rounded-full border-2 border-edge border-t-accent"
              aria-hidden="true"
            />
            {{ t('tags.suggesting') }}
          </span>
          <button
            v-else
            type="button"
            class="text-xs text-ink-faint underline underline-offset-2 transition hover:text-ink"
            :disabled="busy"
            @click="suggestAliases"
          >
            {{ t('tags.suggestAliases') }}
          </button>
        </div>
        <p class="field-hint mb-2">{{ t('tags.aliasesHint') }}</p>

        <div class="space-y-2">
          <div v-for="(row, index) in aliases" :key="index" class="flex items-center gap-2">
            <select
              v-model="row.languageCode"
              class="field-input w-20 shrink-0"
              :aria-label="t('tags.aliasLanguage')"
            >
              <option v-for="locale in SUPPORTED_LOCALES" :key="locale" :value="locale">
                {{ locale }}
              </option>
            </select>
            <input v-model="row.text" type="text" class="field-input" />
            <button
              type="button"
              class="shrink-0 rounded p-1.5 text-ink-faint transition hover:text-accent"
              :aria-label="t('common.delete')"
              @click="removeAlias(index)"
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
          </div>
        </div>

        <button
          type="button"
          class="mt-2 text-xs text-ink-faint underline underline-offset-2 transition hover:text-ink"
          :disabled="proposing"
          @click="addAlias"
        >
          {{ t('tags.addAlias') }}
        </button>
      </div>

      <div :class="proposing ? 'pointer-events-none opacity-40' : ''">
        <label class="field-label" for="tag-slug">{{ t('tags.slug') }}</label>
        <input id="tag-slug" v-model="slug" type="text" class="field-input" :disabled="proposing" />
        <p class="field-hint">{{ t('tags.slugHint') }}</p>
      </div>

      <p v-if="!complete" class="field-hint">{{ t('tags.captionsMissing') }}</p>

      <p v-if="error" role="alert" class="text-sm text-accent">
        {{ error.detail || error.title || t('errors.generic') }}
      </p>
    </form>

    <template #footer>
      <!-- Only for a tag that exists: collecting measures candidates against
           what already carries it, and an unsaved one carries nothing. -->
      <RouterLink
        v-if="editing && step !== 'seed'"
        :to="{ name: 'admin-tag-collect', query: { tag: tag.slug } }"
        class="btn-ghost mr-auto"
        @click="emit('close')"
      >
        {{ t('collect.find') }}
      </RouterLink>

      <template v-if="step === 'seed'">
        <button type="button" class="btn-ghost mr-auto" @click="skipProposal">
          {{ t('tags.manual') }}
        </button>
        <button type="button" class="btn-ghost" @click="emit('close')">
          {{ t('common.cancel') }}
        </button>
        <button
          type="button"
          class="btn-primary"
          :disabled="!seedWord.trim() || proposing"
          @click="askProposal"
        >
          {{ t('tags.propose') }}
        </button>
      </template>

      <template v-else>
        <button type="button" class="btn-ghost" @click="emit('close')">
          {{ t('common.cancel') }}
        </button>
        <button type="button" class="btn-primary" :disabled="!canSave" @click="save">
          {{ saving ? t('common.saving') : t('common.save') }}
        </button>
      </template>
    </template>
  </ModalDialog>

  <!--
    The folded draft. Below the modal layer on purpose: opening the tag that was
    gone to look at puts its own dialog over this, and a bar floating on top of
    that would be a control for something the reader cannot see.
  -->
  <Teleport to="body">
    <Transition
      enter-from-class="translate-y-4 opacity-0"
      enter-active-class="transition duration-200"
      leave-to-class="translate-y-4 opacity-0"
      leave-active-class="transition duration-200"
    >
      <div v-if="open && minimised" class="fixed inset-x-0 bottom-6 z-[1900] flex justify-center px-4">
        <div
          class="flex items-center gap-3 rounded-full border border-edge bg-paper-raised px-4 py-2 shadow-lg"
        >
          <span class="text-sm text-ink">{{ t('tags.draft', { tag: draftName }) }}</span>
          <button type="button" class="btn-primary !px-3 !py-1.5" @click="minimised = false">
            {{ t('tags.resumeDraft') }}
          </button>
          <button
            type="button"
            class="text-sm text-ink-faint transition hover:text-ink"
            @click="discardDraft"
          >
            {{ t('tags.discardDraft') }}
          </button>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
