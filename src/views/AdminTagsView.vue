<script setup>
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import TagEditDialog from '@/components/editor/TagEditDialog.vue'
import ErrorState from '@/components/common/ErrorState.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import { useTagsStore } from '@/stores/tags'
import { useUiStore } from '@/stores/ui'
import { tagLabel, tagMatches, compareTags } from '@/services/tags'
import { cascadeDelay } from '@/services/cascade'

const { t } = useI18n()
const tags = useTagsStore()
const ui = useUiStore()

const filter = ref('')
const editing = ref(null)
const creating = ref(false)

onMounted(() => tags.load().catch(() => {}))

/*
  The whole vocabulary, commonest first.

  Order is the point of this screen. Filing a photograph means remembering what
  this sort of thing was called last time, and a list sorted alphabetically
  answers a question nobody asked — the working vocabulary is the top of the
  usage list, and everything below the fold is the long tail of one-offs.

  Filtering runs over captions *and* aliases in every language, the same as the
  picker: looking up how a tag is spelled in Japanese means finding it by its
  Russian name first.
*/
const visible = computed(() =>
  tags.items
    .filter((tag) => tagMatches(tag, filter.value))
    .sort((a, b) => compareTags(a, b, ui.locale)),
)

/**
 * A near-duplicate was clicked in the tag being written: put it in the search
 * field, so the table underneath narrows to it and it can be read where every
 * other tag is read. The dialog folds itself down to a draft rather than
 * closing — the proposal in it has been paid for.
 */
function onSimilar(tag) {
  filter.value = tagLabel(tag, ui.locale)
}

function aliasCount(tag) {
  return Array.isArray(tag.aliases) ? tag.aliases.length : 0
}

/** Which languages still have no caption — the hole this screen exists to find. */
function missingCaptions(tag) {
  const written = new Set(
    (tag.translations ?? []).filter((row) => row?.text?.trim()).map((row) => row.languageCode),
  )
  return ['ru', 'en', 'ja'].filter((locale) => !written.has(locale))
}
</script>

<template>
  <div class="mx-auto max-w-4xl px-4 py-8">
    <header class="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 class="text-xl font-semibold tracking-tight text-ink">{{ t('tags.title') }}</h1>
        <p class="mt-1 text-xs text-ink-faint">
          {{ t('tags.count', { count: tags.items.length }, tags.items.length) }}
        </p>
      </div>
      <button type="button" class="btn-primary" @click="creating = true">
        {{ t('tags.create') }}
      </button>
    </header>

    <label class="mb-6 block">
      <span class="sr-only">{{ t('tags.filter') }}</span>
      <input
        v-model="filter"
        type="search"
        class="field-input"
        :placeholder="t('tags.filterPlaceholder')"
      />
    </label>

    <ErrorState v-if="tags.error" :error="tags.error" @retry="tags.load(true)" />

    <p v-else-if="tags.loading && !tags.loaded" class="text-sm text-ink-faint">
      {{ t('common.loading') }}
    </p>

    <EmptyState v-else-if="!visible.length" :message="t('tags.none')" />

    <!--
      Not a table on a phone.

      Four columns and a link do not fit across 360 pixels, and what fell off the
      right-hand edge was the one control on the row that does something other
      than open it. So the counts move under the caption on the narrow layout and
      the link keeps its corner; from `sm` up there is room for the columns and
      they come back.
    -->
    <div v-else>
      <!-- Column labels only where there are columns; the narrow layout runs the
           same facts together under the caption, where a heading row would be
           labelling nothing. -->
      <div
        class="mb-1 hidden items-center gap-3 px-3 text-xs uppercase tracking-wide text-ink-faint sm:flex"
      >
        <span class="min-w-0 flex-1">{{ t('tags.caption') }}</span>
        <span class="w-40">{{ t('tags.slug') }}</span>
        <span class="w-10 text-right">{{ t('tags.aliasesShort') }}</span>
        <span class="w-12 text-right">{{ t('tags.usage') }}</span>
        <span class="w-28" />
      </div>

      <ul class="overflow-hidden rounded-lg border border-edge">
        <li
          v-for="(tag, index) in visible"
          :key="tag.id"
          class="cascade-item flex items-center gap-3 border-t border-edge px-3 py-2 text-sm transition first:border-t-0 hover:bg-edge/30"
          :style="cascadeDelay(index)"
        >
          <button type="button" class="min-w-0 flex-1 text-left" @click="editing = tag">
            <span class="flex flex-wrap items-center gap-x-1.5 gap-y-1">
              <span class="text-ink">#{{ tagLabel(tag, ui.locale) }}</span>
              <!-- A caption missing in one language is invisible from the other
                   two, so it is called out here or nowhere. -->
              <span
                v-if="missingCaptions(tag).length"
                class="rounded bg-accent px-1.5 py-0.5 text-[10px] font-medium uppercase text-paper"
              >
                {{ missingCaptions(tag).join(' ') }}
              </span>
            </span>
            <span class="mt-0.5 block truncate font-mono text-xs text-ink-faint sm:hidden">
              {{ tag.slug }} · {{ t('tags.aliasesShort') }} {{ aliasCount(tag) }} ·
              {{ t('tags.usage') }} {{ tag.usageCount }}
            </span>
          </button>

          <span class="hidden w-40 truncate font-mono text-xs text-ink-faint sm:block">
            {{ tag.slug }}
          </span>
          <span class="hidden w-10 text-right text-ink-faint sm:block">{{ aliasCount(tag) }}</span>
          <span class="hidden w-12 text-right text-ink-soft sm:block">{{ tag.usageCount }}</span>

          <!-- Icon alone where the words would not fit; the label is still read out. -->
          <RouterLink
            :to="{ name: 'admin-tag-collect', query: { tag: tag.slug } }"
            class="shrink-0 rounded p-1.5 text-ink-faint transition hover:text-ink sm:w-28 sm:p-0 sm:text-right sm:text-xs sm:underline sm:underline-offset-2"
            :title="t('collect.find')"
            :aria-label="t('collect.find')"
          >
            <svg
              class="h-4 w-4 sm:hidden"
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              stroke-width="1.6"
              aria-hidden="true"
            >
              <circle cx="8.5" cy="8.5" r="5" />
              <path d="m12.5 12.5 4 4" stroke-linecap="round" />
              <path d="M8.5 6.5v4M6.5 8.5h4" stroke-linecap="round" />
            </svg>
            <span class="hidden sm:inline" aria-hidden="true">{{ t('collect.find') }}</span>
          </RouterLink>
        </li>
      </ul>
    </div>

    <TagEditDialog :open="creating" inspect @close="creating = false" @pick="onSimilar" />
    <TagEditDialog
      :open="Boolean(editing)"
      :tag="editing"
      @close="editing = null"
      @pick="onSimilar"
    />
  </div>
</template>
