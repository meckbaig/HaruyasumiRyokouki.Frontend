/**
 * Writes a markup template into a textarea at the caret, replacing whatever was
 * selected, and leaves the placeholder highlighted so it can be typed over.
 * See docs/features/rich-text-and-links.md.
 */

/**
 * @param {HTMLTextAreaElement} element the field to write into.
 * @param {(selected: string) => { text: string, select: [number, number] }} build
 * @returns {[number, number] | null} the placeholder's absolute range, so a
 *   later step - a tile being clicked - can replace exactly it.
 */
export function insertTemplate(element, build) {
  if (!element) return null

  const value = element.value ?? ''
  const start = element.selectionStart ?? value.length
  const end = element.selectionEnd ?? start
  const { text, select } = build(value.slice(start, end))

  element.value = value.slice(0, start) + text + value.slice(end)
  element.focus()
  element.setSelectionRange(start + select[0], start + select[1])
  // v-model listens for `input`; assigning `value` alone would leave it behind.
  element.dispatchEvent(new Event('input', { bubbles: true }))

  return [start + select[0], start + select[1]]
}
