<script setup>
import { ref, computed, watch, nextTick, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import { copyMediaUrl } from '@/services/share'
import { isPrivate } from '@/services/privacy'
import { useEditorStore } from '@/stores/editor'

const props = defineProps({
  /** `{ media, x, y }` while a menu is up, null while none is. */
  target: { type: Object, default: null },
})

const emit = defineEmits(['close'])

const { t } = useI18n()
const editor = useEditorStore()

/*
  What a right-click on a picture offers: one action, a link to where it sits -
  or to the whole selection it belongs to. Placed at the click, nudged back
  inside the window, and closed by anything at all.
  See docs/features/media-grid-and-selection.md.
*/
const menu = ref(null)
const size = ref({ width: 0, height: 0 })

/**
 * Whether the pressed tile is part of a selection: the menu then acts on the
 * whole selection rather than on this tile alone.
 * See docs/features/sharing-and-links.md.
 */
const fromSelection = computed(() => {
  const id = props.target?.media?.id
  return id != null && editor.selectionMode && editor.isSelected(id)
})

/**
 * The ids a share would name - the whole selection, or this tile - with private
 * files left out, since a private file is never shareable. Empty means the menu
 * says why instead: the native menu is suppressed, so silence would read as a
 * broken page. See docs/features/sharing-and-links.md.
 */
const shareIds = computed(() => {
  const media = props.target?.media
  if (media?.id == null) return []
  const list = fromSelection.value ? editor.items : [media]
  return list.filter((item) => item?.id != null && !isPrivate(item)).map((item) => item.id)
})

const shareable = computed(() => shareIds.value.length > 0)

const position = computed(() => {
  if (!props.target) return { left: '0px', top: '0px' }
  const margin = 8
  const maxLeft = window.innerWidth - size.value.width - margin
  const maxTop = window.innerHeight - size.value.height - margin
  return {
    left: `${Math.max(margin, Math.min(props.target.x, maxLeft))}px`,
    top: `${Math.max(margin, Math.min(props.target.y, maxTop))}px`,
  }
})

const feedback = ref(null)
let feedbackTimer = null

async function share() {
  const ids = shareIds.value
  emit('close')
  if (!ids.length) return

  const copied = await copyMediaUrl(ids)
  feedback.value = copied ? t('common.shareCopied') : t('common.shareFailed')
  clearTimeout(feedbackTimer)
  feedbackTimer = setTimeout(() => (feedback.value = null), 2000)
}

function close() {
  emit('close')
}

/**
 * Measured once it is up, because where it may sit depends on how big it is.
 * Until then it is placed at the click and corrects itself in the same frame.
 */
watch(
  () => props.target,
  async (target) => {
    if (!target) {
      document.removeEventListener('pointerdown', close)
      document.removeEventListener('keydown', onKeydown, true)
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
      return
    }

    // Bubble phase, not capture: the menu stops the event on itself, so a press
    // on its own item never reaches this and the menu is still there to be clicked.
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', onKeydown, true)
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)

    // Before the paint, not a frame after it: a menu opened near an edge would
    // otherwise be seen hanging off it for one frame before correcting itself.
    await nextTick()
    const rect = menu.value?.getBoundingClientRect()
    if (rect) size.value = { width: rect.width, height: rect.height }
  },
)

function onKeydown(event) {
  if (event.key === 'Escape') close()
}

onBeforeUnmount(() => {
  clearTimeout(feedbackTimer)
  document.removeEventListener('pointerdown', close)
  document.removeEventListener('keydown', onKeydown, true)
  window.removeEventListener('scroll', close, true)
  window.removeEventListener('resize', close)
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="target"
      ref="menu"
      role="menu"
      class="fixed z-[1500] min-w-40 overflow-hidden rounded-md border border-edge bg-paper-raised py-1 shadow-lg"
      :style="position"
      @pointerdown.stop
      @contextmenu.prevent
    >
      <p v-if="!shareable" class="px-3 py-2 text-xs text-ink-faint">
        {{ t(fromSelection ? 'media.hiddenSelectionNoShare' : 'media.hiddenNoShare') }}
      </p>

      <button
        v-else
        type="button"
        role="menuitem"
        class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-ink-soft transition hover:bg-edge/50 hover:text-ink"
        @click="share"
      >
        <svg
          class="h-4 w-4 shrink-0"
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          stroke-width="1.6"
          aria-hidden="true"
        >
          <path d="M7.5 11.5 12.5 8.5M7.5 8.5l5 3" stroke-linecap="round" />
          <circle cx="5.5" cy="10" r="2.2" />
          <circle cx="14.5" cy="6.5" r="2.2" />
          <circle cx="14.5" cy="13.5" r="2.2" />
        </svg>
        {{ t(fromSelection ? 'media.shareSelection' : 'media.shareFile') }}
      </button>
    </div>

    <!-- Outlives the menu it was asked from, so the answer is still there to
         read once the menu has got out of the way. -->
    <Transition
      enter-from-class="translate-y-2 opacity-0"
      enter-active-class="transition duration-150"
      leave-to-class="translate-y-2 opacity-0"
      leave-active-class="transition duration-150"
    >
      <p
        v-if="feedback"
        role="status"
        class="fixed bottom-6 left-1/2 z-[1500] -translate-x-1/2 rounded-md bg-ink px-3 py-1.5 text-xs text-paper shadow-lg"
      >
        {{ feedback }}
      </p>
    </Transition>
  </Teleport>
</template>
