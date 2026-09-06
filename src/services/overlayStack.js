/**
 * Which overlay answers the keyboard: whatever opened last. One shared list,
 * because dialogs and the viewer are unrelated components that both listen on
 * the document. See docs/features/ui-shell.md.
 */
const stack = []

/** Call as an overlay opens. The token is any unique value the caller keeps. */
export function pushOverlay(token) {
  if (!stack.includes(token)) stack.push(token)
}

/** Call as it closes, and again on unmount - leaving twice is harmless. */
export function popOverlay(token) {
  const at = stack.indexOf(token)
  if (at >= 0) stack.splice(at, 1)
}

export function isTopmost(token) {
  return stack.length > 0 && stack[stack.length - 1] === token
}

/** True while anything is up, which is what "may the page scroll" comes down to. */
export function hasOverlay() {
  return stack.length > 0
}
