import { defineStore } from 'pinia'
import { ref } from 'vue'

const STORAGE_KEY = 'haruyasumi.motion'

/**
 * Whether the site honours the operating system's "reduce motion" setting.
 *
 * "auto" respects it, which is the right default for everyone. "always" opts
 * back into animation for a visitor who turned motion off system-wide but wants
 * it here anyway — the choice is written to <html>, where the reduced-motion
 * rules in main.css check for it.
 */
export const MOTION_OPTIONS = ['auto', 'always']

function apply(preference) {
  const root = document.documentElement
  if (preference === 'always') root.setAttribute('data-motion', 'always')
  else root.removeAttribute('data-motion')
}

export const useMotionStore = defineStore('motion', () => {
  const stored = localStorage.getItem(STORAGE_KEY)
  const preference = ref(MOTION_OPTIONS.includes(stored) ? stored : 'auto')

  function set(next) {
    if (!MOTION_OPTIONS.includes(next)) return
    preference.value = next
    localStorage.setItem(STORAGE_KEY, next)
    apply(next)
  }

  function toggle() {
    set(preference.value === 'always' ? 'auto' : 'always')
  }

  /** Applies the stored preference; call once on boot. */
  function init() {
    apply(preference.value)
  }

  return { preference, set, toggle, init }
})
