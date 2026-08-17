import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

/**
 * Multi-select state for the editor.
 *
 * Selection mode is entered by pressing and holding a tile, then plain clicks
 * add and remove files until it is cleared. Selected ids are held globally so
 * the floating toolbar can act on them from anywhere on the page.
 */
export const useEditorStore = defineStore('editor', () => {
  const selectionMode = ref(false)
  const selectedIds = ref(new Set())
  /** Media objects behind the ids, so the bulk dialog can show file names. */
  const selectedItems = ref(new Map())

  /*
    What the last bulk save did, for a page that is showing a queue.

    The toolbar is mounted at app level so a selection survives navigation
    between the day, the results and the pending queue — which is also why it
    cannot simply tell the page underneath what just happened. Approving a
    selection took those files out of the queue on the server and left them
    sitting on the screen until a reload, because nothing carried the fact
    across.

    A plain record, replaced whole on every save so that watching it fires even
    when the same files are saved twice.
  */
  const lastSave = ref(null)

  function reportSaved(result) {
    if (!result) return
    lastSave.value = { ...result }
  }

  const count = computed(() => selectedIds.value.size)
  const ids = computed(() => [...selectedIds.value])
  const items = computed(() => [...selectedItems.value.values()])

  function isSelected(id) {
    return selectedIds.value.has(id)
  }

  function toggle(media) {
    // `== null` on purpose: ids are integers now and 0 is a valid id.
    if (media?.id == null) return

    const nextIds = new Set(selectedIds.value)
    const nextItems = new Map(selectedItems.value)

    if (nextIds.has(media.id)) {
      nextIds.delete(media.id)
      nextItems.delete(media.id)
    } else {
      nextIds.add(media.id)
      nextItems.set(media.id, media)
    }

    selectedIds.value = nextIds
    selectedItems.value = nextItems

    // Leaving the last item selected would strand the toolbar with nothing to do.
    if (nextIds.size === 0) selectionMode.value = false
  }

  /** Enters selection mode with one file already picked. */
  function start(media) {
    selectionMode.value = true
    if (media && !selectedIds.value.has(media.id)) toggle(media)
  }

  function selectMany(mediaList) {
    const nextIds = new Set(selectedIds.value)
    const nextItems = new Map(selectedItems.value)
    for (const media of mediaList ?? []) {
      if (media?.id == null) continue
      nextIds.add(media.id)
      nextItems.set(media.id, media)
    }
    selectedIds.value = nextIds
    selectedItems.value = nextItems
    if (nextIds.size > 0) selectionMode.value = true
  }

  /**
   * Replaces the whole selection with exactly `mediaList`. Used by the paint
   * gesture, which recomputes the selection from a snapshot plus the dragged
   * range on every pointer move, so dragging back can shrink it again.
   */
  function setSelection(mediaList) {
    const nextIds = new Set()
    const nextItems = new Map()
    for (const media of mediaList ?? []) {
      if (media?.id == null) continue
      nextIds.add(media.id)
      nextItems.set(media.id, media)
    }
    selectedIds.value = nextIds
    selectedItems.value = nextItems
    selectionMode.value = nextIds.size > 0
  }

  function clear() {
    selectedIds.value = new Set()
    selectedItems.value = new Map()
    selectionMode.value = false
  }

  return {
    selectionMode,
    count,
    ids,
    items,
    lastSave,
    isSelected,
    toggle,
    start,
    selectMany,
    setSelection,
    reportSaved,
    clear,
  }
})
