<script setup>
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import MediaLightbox from '@/components/media/MediaLightbox.vue'
import MediaThumb from '@/components/media/MediaThumb.vue'
import { fetchSimilarMedia } from '@/api/media'
import { addTagToMedia } from '@/api/tags'
import { useTagsStore } from '@/stores/tags'
import { useUiStore } from '@/stores/ui'
import { tagLabel, tagSlugsOf } from '@/services/tags'
import { scorePercent, scoreBadgeClass } from '@/services/similarity'
import { addTagLocally } from '@/services/mediaEdits'
import { cascadeDelay } from '@/services/cascade'
import { markOpenedFrom } from '@/services/openedFrom'
import { useTilePaint } from '@/composables/useTilePaint'

const props = defineProps({
  /** The file being edited; null while the dialog is shut or editing many. */
  media: { type: Object, default: null },
  /** Slugs currently on that file, as the editor has them — saved or not. */
  tagSlugs: { type: Array, default: () => [] },
})

const { t } = useI18n()
const tags = useTagsStore()
const ui = useUiStore()

/*
  Filing by resemblance.

  The point of this panel is that tagging one photograph is rarely tagging one
  photograph: the same subject was shot five times in a row, and again from the
  other side of the square a week later. The server can find those, so the tags
  written here can be handed to them without leaving the dialog.

  It loads on its own and is allowed to be slow — the card above it must not wait
  on a fingerprint search to be readable.
*/
/**
 * Asked for generously, because the tags chosen below then take a bite out of
 * the answer. Filtering the list down to files a tag would actually change is
 * done here — the server has no idea which tags are being handed out — so the
 * list has to arrive with enough in it to still be worth reading afterwards.
 */
const TAKE = 200

const items = ref([])
const loading = ref(false)
const failed = ref(false)

/** Ids of the neighbours ticked for tagging. */
const chosen = ref(new Set())
/** Which of this file's tags to hand over. None, until some are asked for. */
const chosenTags = ref(new Set())

const applying = ref(false)
/** `{ done, total }` while the tags go over one request at a time. */
const progress = ref(null)

/*
  What the chosen tags would actually change.

  With no tags chosen this is the whole answer, sorted by likeness, which is what
  the panel is for on its own. Choose a tag and it becomes the far more useful
  question: which of these does *not* already carry it — because a file that
  already has every chosen tag gains nothing from being ticked, and leaving it in
  the wall means reading past it and deciding about it again.

  Missing *any* of them is enough to stay, not missing all: the button hands over
  every chosen tag at once, so a file short of one of the three is still a file
  the operation changes.
*/
const shown = computed(() => {
  const wanted = chosenTags.value
  if (!wanted.size) return items.value

  return items.value.filter((entry) => {
    const has = new Set(tagSlugsOf(entry.media))
    for (const slug of wanted) if (!has.has(slug)) return true
    return false
  })
})

const hiddenCount = computed(() => items.value.length - shown.value.length)

const grid = ref(null)
const lightboxIndex = ref(null)
const lightboxItems = computed(() => shown.value.map((entry) => entry.media))

/*
  The same press-and-drag marking the grids use, on the same terms: a long press
  opens it on a touchscreen, a sideways drag extends it, and a downwards one is
  handed straight back to the page so a wall of thumbnails is not a region that
  cannot be scrolled past.
*/
const paint = useTilePaint({
  container: grid,
  idAt: (index) => shown.value[index]?.media?.id ?? null,
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

const availableTags = computed(() =>
  props.tagSlugs.map((slug) => tags.getBySlug(slug)).filter(Boolean),
)
const chosenCount = computed(() => chosen.value.size)
const canApply = computed(
  () => !applying.value && chosenCount.value > 0 && chosenTags.value.size > 0,
)

let controller = null

async function load(id) {
  controller?.abort()
  items.value = []
  chosen.value = new Set()
  failed.value = false
  if (id == null) return

  const own = new AbortController()
  controller = own
  loading.value = true
  try {
    const found = await fetchSimilarMedia(id, TAKE, own.signal)
    if (controller !== own) return
    items.value = found
  } catch (error) {
    if (error?.name === 'AbortError') return
    failed.value = true
  } finally {
    if (controller === own) {
      controller = null
      loading.value = false
    }
  }
}

watch(
  () => props.media?.id,
  (id) => {
    tags.load().catch(() => {})
    load(id ?? null)
  },
  { immediate: true },
)

// Tags can be added and taken off while the panel is open; anything no longer on
// the file cannot be handed to anyone, and a stale tick would hand it anyway.
watch(
  () => props.tagSlugs,
  (slugs) => {
    const available = new Set(slugs)
    chosenTags.value = new Set([...chosenTags.value].filter((slug) => available.has(slug)))
  },
  { deep: true },
)

// A file the filter has taken away is a file the operation would not change, so
// it stops being ticked with it — otherwise "12 chosen" counts things nobody can
// see and the button quietly does less than it says.
watch(shown, (visible) => {
  const present = new Set(visible.map((entry) => entry.media.id))
  const kept = [...chosen.value].filter((id) => present.has(id))
  if (kept.length !== chosen.value.size) chosen.value = new Set(kept)
})

function toggle(id) {
  const next = new Set(chosen.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  chosen.value = next
}

function toggleTag(slug) {
  const next = new Set(chosenTags.value)
  if (next.has(slug)) next.delete(slug)
  else next.add(slug)
  chosenTags.value = next
}

/**
 * Everything from the top down to and including this one.
 *
 * The list falls away monotonically, so what a reader wants is almost always an
 * unbroken run from the top — the drop is visible, and marking it one tile at a
 * time is work the shape of the data makes unnecessary.
 */
function chooseThrough(index) {
  const next = new Set(chosen.value)
  for (const entry of shown.value.slice(0, index + 1)) next.add(entry.media.id)
  chosen.value = next
}

/**
 * One request per tag, in turn.
 *
 * `POST /tags/{id}/media` adds a tag without touching the others on those files,
 * which is exactly what is wanted here and is not what a media PATCH would do.
 * It takes one tag at a time, so several tags are several requests — run in
 * sequence rather than at once, both to keep the progress honest and to leave a
 * failure halfway with a clear account of what did land.
 */
async function apply() {
  const slugs = [...chosenTags.value]
  const mediaIds = [...chosen.value]
  if (!slugs.length || !mediaIds.length) return

  applying.value = true
  progress.value = { done: 0, total: slugs.length }
  let applied = 0

  try {
    for (const slug of slugs) {
      const tag = tags.getBySlug(slug)
      if (!tag?.id) continue
      await addTagToMedia(tag.id, mediaIds)
      // Written onto the neighbours on screen, which is also what takes them out
      // of the wall: the list shows what the chosen tags would still change.
      const marked = new Set(mediaIds)
      for (const entry of items.value) {
        if (marked.has(entry.media.id)) addTagLocally(entry.media, tag, ui.locale)
      }
      // The dictionary's usage counts drive the order of every tag list on the
      // site, so they are kept true here rather than waiting for a refetch.
      tags.upsert({ ...tag, usageCount: (tag.usageCount ?? 0) + mediaIds.length })
      applied += 1
      progress.value = { done: applied, total: slugs.length }
    }

    ui.notify(t('similar.applied', { count: mediaIds.length }, mediaIds.length), 'success')
    chosen.value = new Set()
  } catch (error) {
    ui.notify(error?.detail || error?.title || t('errors.generic'), 'error')
  } finally {
    applying.value = false
    progress.value = null
  }
}
</script>

<template>
  <section>
    <div class="mb-1 flex items-center justify-between gap-4">
      <span class="field-label mb-0">{{ t('similar.title') }}</span>
      <span v-if="chosenCount" class="text-xs text-ink-faint">
        {{ t('similar.chosen', { count: chosenCount }, chosenCount) }}
      </span>
    </div>

    <p v-if="loading" class="field-hint">{{ t('similar.searching') }}</p>

    <p v-else-if="failed" class="field-hint">{{ t('similar.failed') }}</p>

    <!-- No fingerprint rather than no matches: videos have none, and the server
         says so with an empty list instead of an error. -->
    <p v-else-if="!items.length" class="field-hint">{{ t('similar.unavailable') }}</p>

    <template v-else>
      <!-- Everything the chosen tags would have touched already carries them,
           which is a finished job rather than an empty answer. -->
      <p
        v-if="!shown.length"
        class="rounded-md border border-edge bg-edge/30 px-3 py-2 text-xs text-ink-soft"
      >
        {{ t('similar.allTagged') }}
      </p>

      <div v-else class="max-h-64 overflow-y-auto rounded-md border border-edge p-1.5">
        <div
          ref="grid"
          class="grid grid-cols-3 gap-1.5 sm:grid-cols-4"
          @pointerdown="paint.onPointerDown"
          @touchstart.passive="paint.onTouchStart"
          @click.capture="paint.onClickCapture"
        >
          <div
            v-for="(entry, index) in shown"
            :key="entry.media.id"
            :data-tile-index="index"
            class="cascade-item group relative"
            :style="cascadeDelay(index)"
          >
            <button
              type="button"
              class="block w-full touch-pan-y overflow-hidden rounded ring-1 transition"
              :class="
                chosen.has(entry.media.id)
                  ? 'ring-2 ring-accent'
                  : 'ring-edge hover:ring-ink-faint'
              "
              :aria-pressed="chosen.has(entry.media.id)"
              :aria-label="entry.media.fileName"
              @click="toggle(entry.media.id)"
            >
              <MediaThumb :media="entry.media" :alt="entry.media.fileName" />
            </button>

            <span
              class="pointer-events-none absolute bottom-0.5 left-0.5 rounded px-1 py-0.5 text-[10px] font-medium"
              :class="scoreBadgeClass(entry.score)"
            >
              {{ scorePercent(entry.score) }}%
            </span>

            <!-- Two things a tile can do besides being ticked, both offered the
                 way the pencil is on a grid tile: only when reached for. -->
            <button
              type="button"
              class="hover-reveal absolute right-0.5 top-0.5 rounded bg-paper/90 p-1 text-ink shadow-sm transition"
              :title="t('similar.chooseThrough')"
              :aria-label="t('similar.chooseThrough')"
              @click="chooseThrough(index)"
            >
              <svg
                class="h-3 w-3"
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
              class="hover-reveal absolute left-0.5 top-0.5 rounded bg-paper/90 p-1 text-ink shadow-sm transition"
              :title="t('similar.openFull')"
              :aria-label="t('similar.openFull')"
              @click="openFull($event, index)"
            >
              <svg
                class="h-3 w-3"
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
      </div>

      <!-- Which of this file's tags travel. All of them by default: that is the
           usual intent, and unticking is easier than ticking three. -->
      <div v-if="availableTags.length" class="mt-2 flex flex-wrap items-center gap-1.5">
        <button
          v-for="tag in availableTags"
          :key="tag.slug"
          type="button"
          class="rounded-full border px-2.5 py-0.5 text-xs transition"
          :class="
            chosenTags.has(tag.slug)
              ? 'border-accent bg-accent-soft text-ink'
              : 'border-edge text-ink-faint hover:text-ink'
          "
          :aria-pressed="chosenTags.has(tag.slug)"
          @click="toggleTag(tag.slug)"
        >
          #{{ tagLabel(tag, ui.locale) }}
        </button>
      </div>

      <p v-else class="field-hint mt-2">{{ t('similar.noTags') }}</p>

      <!-- What choosing a tag did to the wall above, said plainly: silence would
           read as the server having returned fewer files than it did. -->
      <p v-if="availableTags.length" class="field-hint mt-1">
        {{
          chosenTags.size
            ? t('similar.filtered', { count: hiddenCount })
            : t('similar.pickTags')
        }}
      </p>

      <div class="mt-2 flex items-center gap-3">
        <button type="button" class="btn-primary !py-1.5" :disabled="!canApply" @click="apply">
          {{ t('similar.apply') }}
        </button>
        <span v-if="progress" class="text-xs text-ink-faint">
          {{ t('similar.progress', { done: progress.done, total: progress.total }) }}
        </span>
        <button
          v-else-if="chosenCount"
          type="button"
          class="text-xs text-ink-faint underline underline-offset-2 transition hover:text-ink"
          @click="chosen = new Set()"
        >
          {{ t('common.clearSelection') }}
        </button>
      </div>

      <p class="field-hint mt-1">{{ t('similar.hint') }}</p>
    </template>

    <MediaLightbox v-model:index="lightboxIndex" :items="lightboxItems" />
  </section>
</template>
