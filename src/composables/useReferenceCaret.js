import { computed, ref } from 'vue'
import { referenceAt, unwrapReference } from '@/services/richText'

/**
 * The markup reference sitting under a field's caret, and the way to take one
 * off without losing the text it carried. Shared by the note and description
 * fields, which wear the same buttons.
 * See docs/features/rich-text-and-links.md.
 *
 * @param {() => string} readText the field's text, read live.
 * @param {() => HTMLTextAreaElement | null} readElement the field itself.
 */
export function useReferenceCaret(readText, readElement) {
  const caret = ref(null)
  const reference = computed(() =>
    caret.value == null ? null : referenceAt(readText() ?? '', caret.value),
  )

  /** Where the field says its caret stands; held when the field is left. */
  function onCaret(offset) {
    caret.value = offset
  }

  /** Remembers the caret a write of our own left behind. */
  function setCaret(offset) {
    caret.value = offset
  }

  /**
   * Takes the reference under the caret off, keeping its label as plain text.
   *
   * @returns {object|null} the reference taken off, so a caller may react.
   */
  function removeReference() {
    const element = readElement()
    if (!element) return null

    const found = referenceAt(element.value, element.selectionStart ?? 0)
    if (!found) return null

    const next = unwrapReference(element.value, found)
    element.value = next.text
    element.focus()
    element.setSelectionRange(next.caret, next.caret)
    // v-model listens for `input`; assigning `value` alone would leave it behind.
    element.dispatchEvent(new Event('input', { bubbles: true }))
    caret.value = next.caret
    return found
  }

  return { caret, reference, onCaret, setCaret, removeReference }
}
