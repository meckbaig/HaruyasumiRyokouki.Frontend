import { ref, watch, onBeforeUnmount } from 'vue'

/**
 * A flag that turns on only once its source has stayed on that long, and off at
 * once. For "loading" notices. See docs/features/ui-shell.md.
 *
 * @param {() => boolean} source what is being waited on
 */
export function useDelayed(source, delay = 400) {
  const shown = ref(false)
  let timer = null

  function stop() {
    clearTimeout(timer)
    timer = null
  }

  watch(
    source,
    (active) => {
      stop()
      if (!active) {
        shown.value = false
        return
      }
      timer = setTimeout(() => {
        shown.value = true
      }, delay)
    },
    { immediate: true },
  )

  onBeforeUnmount(stop)

  return shown
}
