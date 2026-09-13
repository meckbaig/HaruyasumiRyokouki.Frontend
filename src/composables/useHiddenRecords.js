import { ref } from 'vue'
import { isPrivate } from '@/services/privacy'

const STORAGE_KEY = 'haruyasumi.hiddenRecordsHidden'

/**
 * Whether hidden files are kept out of the pages an editor is looking at. Shared
 * by every page and persisted like the day map's own default, so the choice
 * survives a reload. See docs/features/media-grid-and-selection.md.
 */
const hidden = ref(localStorage.getItem(STORAGE_KEY) === '1')

/** The one toggle every page offers, and the filter each wall applies. */
export function useHiddenRecords() {
  function toggle() {
    hidden.value = !hidden.value
    localStorage.setItem(STORAGE_KEY, hidden.value ? '1' : '0')
  }

  /** Removes private files from a list; the cached media objects stay untouched. */
  function withoutHidden(list) {
    return hidden.value ? list.filter((item) => !isPrivate(item)) : list
  }

  return { hidden, toggle, withoutHidden }
}
