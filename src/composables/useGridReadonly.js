import { ref } from 'vue'

const STORAGE_KEY = 'haruyasumi.gridReadonly'

/**
 * A wall an editor is only reading: the star, the hide control and the pencil
 * answer nothing, so a press on a preview panel cannot edit by accident, while
 * opening a file, selection and the context menu stay. Shared by the day and
 * search walls, and persisted. See docs/features/media-grid-and-selection.md.
 */
const readonly = ref(localStorage.getItem(STORAGE_KEY) === '1')

/** The one switch every browsable wall honours, and the state the footer shows. */
export function useGridReadonly() {
  function toggle() {
    readonly.value = !readonly.value
    localStorage.setItem(STORAGE_KEY, readonly.value ? '1' : '0')
  }

  return { readonly, toggle }
}
