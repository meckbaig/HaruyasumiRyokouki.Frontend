<script setup>
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import MediaGrid from '@/components/media/MediaGrid.vue'
import MediaEditDialog from '@/components/editor/MediaEditDialog.vue'
import DayEditForm from '@/components/editor/DayEditForm.vue'
import SkeletonGrid from '@/components/common/SkeletonGrid.vue'
import ErrorState from '@/components/common/ErrorState.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import { fetchPending } from '@/api/admin'
import { syncMedia, deleteMedia } from '@/api/media'
import { useUiStore } from '@/stores/ui'
import { useDaysStore } from '@/stores/days'
import { useEditorStore } from '@/stores/editor'
import { formatLongDate } from '@/services/dates'
import { cascadeDelay } from '@/services/cascade'

const { t } = useI18n()
const ui = useUiStore()
const days = useDaysStore()
const editor = useEditorStore()

const pending = ref({ media: [], days: [] })
const loading = ref(false)
const error = ref(null)
const syncing = ref(false)
const editing = ref(null)
const openDayDate = ref(null)

async function load() {
  loading.value = true
  error.value = null
  try {
    pending.value = await fetchPending()
  } catch (caught) {
    error.value = caught
  } finally {
    loading.value = false
  }
}

onMounted(load)

async function runSync() {
  syncing.value = true
  try {
    await syncMedia()
    ui.notify(t('admin.syncDone'), 'success')
    await load()
    days.invalidate()
    days.loadList(true)
  } catch (caught) {
    ui.notify(caught.detail || caught.title || t('errors.generic'), 'error')
  } finally {
    syncing.value = false
  }
}

async function removeMedia(media) {
  if (!window.confirm(t('admin.deleteConfirm', { name: media.fileName }))) return

  try {
    await deleteMedia(media.id)
    ui.notify(t('admin.deleted'), 'success')
    // Drop it locally instead of refetching the whole list.
    pending.value = {
      ...pending.value,
      media: pending.value.media.filter((item) => item.id !== media.id),
    }
    editing.value = null
  } catch (caught) {
    ui.notify(caught.detail || caught.title || t('errors.generic'), 'error')
  }
}

function onMediaSaved(id) {
  // An approved file is no longer pending, so take it out of the list.
  pending.value = {
    ...pending.value,
    media: pending.value.media.filter((item) => item.id !== id),
  }
}

function onDaySaved({ date, isReady }) {
  openDayDate.value = null
  // Only the "ready" checkbox clears a day from the queue.
  if (isReady) {
    pending.value = {
      ...pending.value,
      days: pending.value.days.filter((day) => day.date !== date),
    }
  }
  days.invalidate()
  days.loadList(true)
}

function dayTitle(day) {
  return formatLongDate(day.date, ui.locale)
}
</script>

<template>
  <div class="mx-auto max-w-6xl px-4 py-8">
    <header class="mb-8 flex flex-wrap items-end justify-between gap-4">
      <h1 class="text-xl font-semibold tracking-tight text-ink">{{ t('admin.title') }}</h1>

      <div class="flex items-center gap-2">
        <button
          v-if="editor.count > 0"
          type="button"
          class="btn-ghost"
          @click="editor.clear()"
        >
          {{ t('common.clearSelection') }}
        </button>
        <button
          v-else-if="pending.media.length"
          type="button"
          class="btn-ghost"
          @click="editor.selectMany(pending.media)"
        >
          {{ t('common.selectAll') }}
        </button>
        <button type="button" class="btn-primary" :disabled="syncing" @click="runSync">
          {{ syncing ? t('admin.syncing') : t('admin.sync') }}
        </button>
      </div>
    </header>

    <ErrorState v-if="error" :error="error" @retry="load" />

    <template v-else>
      <section class="mb-12">
        <h2 class="mb-3 text-sm font-semibold text-ink-soft">
          {{ t('admin.mediaSection') }}
          <span class="ml-1 font-normal text-ink-faint">{{ pending.media.length }}</span>
        </h2>

        <SkeletonGrid v-if="loading" />
        <MediaGrid
          v-else-if="pending.media.length"
          :items="pending.media"
          editable
          show-date
          cascade
          @open="editing = $event"
          @edit="editing = $event"
        />
        <EmptyState v-else :message="t('admin.allDone')" />
        <p v-if="pending.media.length" class="mt-3 text-xs text-ink-faint">
          {{ t('editor.selectMore') }}
        </p>
      </section>

      <section>
        <h2 class="mb-3 text-sm font-semibold text-ink-soft">
          {{ t('admin.daysSection') }}
          <span class="ml-1 font-normal text-ink-faint">{{ pending.days.length }}</span>
        </h2>

        <div v-if="pending.days.length" class="space-y-3">
          <div
            v-for="(day, index) in pending.days"
            :key="day.date"
            class="cascade-item rounded-lg border border-edge bg-paper-raised"
            :style="cascadeDelay(index)"
          >
            <button
              type="button"
              class="flex w-full items-center justify-between px-4 py-3 text-left"
              :aria-expanded="openDayDate === day.date"
              @click="openDayDate = openDayDate === day.date ? null : day.date"
            >
              <span class="text-sm font-medium text-ink">{{ dayTitle(day) }}</span>
              <span class="text-xs text-ink-faint">{{ t('day.notReady') }}</span>
            </button>

            <div v-if="openDayDate === day.date" class="border-t border-edge px-4 py-4">
              <DayEditForm
                :day="day"
                :date="day.date"
                @saved="onDaySaved"
                @cancel="openDayDate = null"
              />
            </div>
          </div>
        </div>
        <EmptyState v-else-if="!loading" :message="t('admin.allDone')" />
      </section>
    </template>

    <MediaEditDialog
      :open="Boolean(editing)"
      :media="editing"
      deletable
      @close="editing = null"
      @saved="onMediaSaved"
      @delete="removeMedia"
    />
  </div>
</template>
