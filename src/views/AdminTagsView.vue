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

    <div v-else class="overflow-hidden rounded-lg border border-edge">
      <table class="w-full text-left text-sm">
        <thead class="border-b border-edge bg-edge/30 text-xs uppercase tracking-wide text-ink-faint">
          <tr>
            <th class="px-3 py-2 font-medium">{{ t('tags.caption') }}</th>
            <th class="hidden px-3 py-2 font-medium sm:table-cell">{{ t('tags.slug') }}</th>
            <th class="px-3 py-2 text-right font-medium">{{ t('tags.aliasesShort') }}</th>
            <th class="px-3 py-2 text-right font-medium">{{ t('tags.usage') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(tag, index) in visible"
            :key="tag.id"
            class="cascade-item cursor-pointer border-t border-edge transition hover:bg-edge/30"
            :style="cascadeDelay(index)"
            @click="editing = tag"
          >
            <td class="px-3 py-2 text-ink">
              #{{ tagLabel(tag, ui.locale) }}
              <!-- A caption missing in one language is invisible from the other
                   two, so it is called out here or nowhere. -->
              <span
                v-if="missingCaptions(tag).length"
                class="ml-1.5 rounded bg-accent px-1.5 py-0.5 text-[10px] font-medium uppercase text-paper"
              >
                {{ missingCaptions(tag).join(' ') }}
              </span>
            </td>
            <td class="hidden px-3 py-2 font-mono text-xs text-ink-faint sm:table-cell">
              {{ tag.slug }}
            </td>
            <td class="px-3 py-2 text-right text-ink-faint">{{ aliasCount(tag) }}</td>
            <td class="px-3 py-2 text-right text-ink-soft">{{ tag.usageCount }}</td>
          </tr>
        </tbody>
      </table>
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
