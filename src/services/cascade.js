/** Stagger for `.cascade-item` in `assets/main.css`. See docs/features/ui-shell.md. */
const STEP_MS = 35
const MAX_STEPS = 12

/** Inline style carrying an entry's place in the cascade. */
export function cascadeDelay(index) {
  return { '--cascade-delay': `${Math.min(index, MAX_STEPS) * STEP_MS}ms` }
}
