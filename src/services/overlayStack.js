/**
 * Which overlay answers the keyboard.
 *
 * Every full-window overlay — a dialog, the image viewer — listens on the
 * document, because that is the only way to catch a key wherever focus happens
 * to be. Which means that with two of them up, one key reaches both: Escape over
 * a viewer opened from inside an edit dialog used to close the viewer *and* the
 * dialog underneath it, taking unsaved edits with it.
 *
 * The rule is the obvious one — the key belongs to whatever opened last — and it
 * needs a single list shared by everything that can be on top. Hence a module
 * rather than a component: dialogs and the viewer are unrelated components and
 * would otherwise each keep their own idea of who is in front.
 */
const stack = []

/** Call as an overlay opens. The token is any unique value the caller keeps. */
export function pushOverlay(token) {
  if (!stack.includes(token)) stack.push(token)
}

/** Call as it closes, and again on unmount — leaving twice is harmless. */
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
