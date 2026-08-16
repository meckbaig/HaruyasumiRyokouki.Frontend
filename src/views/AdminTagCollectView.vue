<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import TagPicker from '@/components/editor/TagPicker.vue'
import MediaLightbox from '@/components/media/MediaLightbox.vue'
import MediaThumb from '@/components/media/MediaThumb.vue'
import LoadingIndicator from '@/components/common/LoadingIndicator.vue'
import ErrorState from '@/components/common/ErrorState.vue'
import { fetchTagCandidates, addTagToMedia } from '@/api/tags'
import { useTagsStore } from '@/stores/tags'
import { useUiStore } from '@/stores/ui'
import { tagLabel } from '@/services/tags'
import { scorePercent, scoreBadgeClass } from '@/services/similarity'
import { cascadeDelay } from '@/services/cascade'
import { markOpenedFrom } from '@/services/openedFrom'
import { useTilePaint } from '@/composables/useTilePaint'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const tags = useTagsStore()
const ui = useUiStore()

/*
  A second pass over the archive, by subject rather than by day.

  Filing day by day gets every photograph described; it does not get every
  photograph of a festival tagged "festival", because the festival happened in
  four different weeks. This screen asks the opposite question — given what
  already carries this tag, what else in the archive belongs with it — and
  answers it with the whole archive at once.

  The tag lives in the address so the screen can be linked to from the tag list
  and from the tag form, and so a reload does not lose it.
*/
const TAKE = 300
/** Fewer than this marked, and the server declines to guess. */
const MIN_SEEDS = 3

const slug = computed(() => String(route.query.tag ?? '').trim())
const tag = computed(() => tags.getBySlug(slug.value))

const seedCount = ref(0)
const items = ref([])
const loading = ref(false)
const error = ref(null)
const loaded = ref(false)

const chosen = ref(new Set())
const applying = ref(false)

const grid = ref(null)
const lightboxIndex = ref(null)
const lightboxItems = computed(() => items.value.map((entry) => entry.media))

/*
  The same press-and-drag marking used on every other wall of thumbnails: a long
  press opens it on a touchscreen, a sideways drag extends it, and a downwards
  one goes back to the page — three hundred tiles that could not be scrolled past
  would be the worst possible place to get that wrong.
*/
const paint = useTilePaint({
  container: grid,
  idAt: (index) => items.value[index]?.media?.id ?? null,
  snapshot: () => [...chosen.value],
  isSelected: (id) => chosen.value.has(id),
  apply: (ids) => {
    chosen.value = new Set(ids)
  },
  armed: () => true,
})

function openFull(event, index) {
  markOpenedFrom(event.currentTarget.closest('[data-tile-index]'))
  lightboxIndex.value = index
}

/** The picker is a multi-select; here it holds one tag or none. */
const picked = computed({
  get: () => (slug.value ? [slug.value] : []),
  set: (next) => {
    const chosenSlug = next[next.length - 1] ?? ''
    router.replace({ name: 'admin-tag-collect', query: chosenSlug ? { tag: chosenSlug } : {} })
  },
})

const tooFewSeeds = computed(() => loaded.value && seedCount.value < MIN_SEEDS)
const canApply = computed(() => !applying.value && chosen.value.size > 0 && Boolean(tag.value?.id))

let controller = null

async function load() {
  controller?.abort()
  items.value = []
  chosen.value = new Set()
  error.value = null
  loaded.value = false
  seedCount.value = 0

  const id = tag.value?.id
  if (id == null) return

  const own = new AbortController()
  controller = own
  loading.value = true
  try {
    const answer = await fetchTagCandidates(id, TAKE, own.signal)
    if (controller !== own) return
    seedCount.value = answer.seedCount
    items.value = answer.items
    loaded.value = true
  } catch (caught) {
    if (caught?.name === 'AbortError') return
    error.value = caught
  } finally {
    if (controller === own) {
      controller = null
      loading.value = false
    }
  }
}

onMounted(async () => {
  // The dictionary is what turns the slug in the address into a tag with an id.
  await tags.load().catch(() => {})
  load()
})

watch([slug, () => tags.loaded], () => {
  if (tags.loaded) load()
})

function toggle(id) {
  const next = new Set(chosen.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  chosen.value = next
}

/**
 * Everything from the top down to and including this one.
 *
 * Scores fall away monotonically and the drop is usually visible, so what gets
 * marked is almost always an unbroken run from the top followed by a few
 * stragglers. Marking three hundred tiles one at a time to express that is work
 * the shape of the data makes unnecessary.
 */
function chooseThrough(index) {
  const next = new Set(chosen.value)
  for (const entry of items.value.slice(0, index + 1)) next.add(entry.media.id)
  chosen.value = next
}

async function apply() {
  const id = tag.value?.id
  const mediaIds = [...chosen.value]
  if (id == null || !mediaIds.length) return

  applying.value = true
  try {
    const affected = await addTagToMedia(id, mediaIds)
    tags.upsert({ ...tag.value, usageCount: (tag.value.usageCount ?? 0) + affected })
    ui.notify(t('collect.applied', { count: affected }, affected), 'success')

    /*
      Asked again straight away, and not merely to refresh the screen: every
      photograph just marked moves the centre this tag is measured from, so the
      next answer is drawn from a better description of the subject than the last
      one was. Collecting a tag is meant to be done in rounds.
    */
    await load()
  } catch (caught) {
    ui.notify(caught?.detail || caught?.title || t('errors.generic'), 'error')
  } finally {
    applying.value = false
  }
}
</script>

<template>
  <div class="mx-auto max-w-6xl px-4 py-8">
    <header class="mb-6">
      <h1 class="text-xl font-semibold tracking-tight text-ink">{{ t('collect.title') }}</h1>
      <p class="mt-1 text-xs text-ink-faint">{{ t('collect.subtitle') }}</p>
    </header>

    <!-- The count belongs under the field it describes, not beside it: put in a
         row, it had to be pushed down by hand to line up with a control whose
         height it does not share, and it broke the field's own spacing doing it. -->
    <div class="mb-6 max-w-md">
      <TagPicker v-model="picked" single />
      <p v-if="loaded" class="mt-1 text-sm text-ink-soft">
        {{ t('collect.marked', { count: seedCount }, seedCount) }}
      </p>
    </div>

    <ErrorState v-if="error" :error="error" @retry="load" />

    <LoadingIndicator v-else-if="loading" :message="t('collect.searching')" />

    <p v-else-if="!slug" class="text-sm text-ink-faint">{{ t('collect.pickTag') }}</p>

    <!-- Not "nothing found": the server declines to guess from one or two
         photographs, and saying so is the difference between a dead end and an
         instruction. -->
    <div
      v-else-if="tooFewSeeds"
      class="rounded-md border border-edge bg-edge/30 px-4 py-3 text-sm text-ink-soft"
    >
      {{ t('collect.tooFewSeeds', { count: seedCount, min: MIN_SEEDS }) }}
    </div>

    <p v-else-if="loaded && !items.length" class="text-sm text-ink-faint">
      {{ t('collect.nothing') }}
    </p>

    <template v-else-if="items.length">
      <p class="mb-3 text-xs text-ink-faint">{{ t('collect.hint') }}</p>

      <div
        ref="grid"
        class="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6"
        @pointerdown="paint.onPointerDown"
        @touchstart.passive="paint.onTouchStart"
        @click.capture="paint.onClickCapture"
      >
        <div
          v-for="(entry, index) in items"
          :key="entry.media.id"
          :data-tile-index="index"
          class="cascade-item group relative"
          :style="cascadeDelay(index)"
        >
          <button
            type="button"
            class="block w-full touch-pan-y overflow-hidden rounded-md ring-1 transition"
            :class="
              chosen.has(entry.media.id) ? 'ring-2 ring-accent' : 'ring-edge hover:ring-ink-faint'
            "
            :aria-pressed="chosen.has(entry.media.id)"
            :aria-label="entry.media.fileName"
            @click="toggle(entry.media.id)"
          >
            <!-- Three hundred of them: the inline miniature is free, and the
                 preview over it is not fetched until it is scrolled to. -->
            <MediaThumb :media="entry.media" :alt="entry.media.fileName" />
          </button>

          <span
            class="pointer-events-none absolute bottom-1 left-1 rounded px-1.5 py-0.5 text-[10px] font-medium"
            :class="scoreBadgeClass(entry.score)"
          >
            {{ scorePercent(entry.score) }}%
          </span>

          <button
            type="button"
            class="hover-reveal absolute right-1 top-1 rounded bg-paper/90 p-1 text-ink shadow-sm transition"
            :title="t('similar.chooseThrough')"
            :aria-label="t('similar.chooseThrough')"
            @click="chooseThrough(index)"
          >
            <svg
              class="h-3.5 w-3.5"
              viewBox="0 0 12 12"
              fill="none"
              stroke="currentColor"
              stroke-width="1.6"
              aria-hidden="true"
            >
              <path d="M6 10V2M3 5l3-3 3 3" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </button>

          <button
            type="button"
            class="hover-reveal absolute left-1 top-1 rounded bg-paper/90 p-1 text-ink shadow-sm transition"
            :title="t('similar.openFull')"
            :aria-label="t('similar.openFull')"
            @click="openFull($event, index)"
          >
            <svg
              class="h-3.5 w-3.5"
              viewBox="0 0 12 12"
              fill="none"
              stroke="currentColor"
              stroke-width="1.6"
              aria-hidden="true"
            >
              <path d="M4.5 1.5h-3v3M7.5 10.5h3v-3" stroke-linecap="round" />
            </svg>
          </button>
        </div>
      </div>

      <!-- Held to the bottom of the window: the list is three hundred long, and
           a button at the end of it is a button nobody reaches. -->
      <div class="sticky bottom-4 mt-6 flex justify-center">
        <div
          class="flex items-center gap-3 rounded-full border border-edge bg-paper-raised px-4 py-2 shadow-lg"
        >
          <span class="text-sm text-ink">
            {{ t('collect.chosen', { count: chosen.size }, chosen.size) }}
          </span>
          <button
            v-if="chosen.size"
            type="button"
            class="text-sm text-ink-faint transition hover:text-ink"
            @click="chosen = new Set()"
          >
            {{ t('common.clearSelection') }}
          </button>
          <button type="button" class="btn-primary !px-3 !py-1.5" :disabled="!canApply" @click="apply">
            {{ applying ? t('common.saving') : t('collect.apply') }}
          </button>
        </div>
      </div>
    </template>

    <MediaLightbox v-model:index="lightboxIndex" :items="lightboxItems" />
  </div>
</template>
