import { ref, watch, onBeforeUnmount } from 'vue'

/**
 * A flag that only turns on once its source has stayed on for a while.
 *
 * For "loading" notices. A request answered from nearby is answered in a few
 * dozen milliseconds, and a line of text that appears and is gone again before
 * it can be read is not information — it is a flicker, and it takes the rest of
 * the form with it as the layout closes back up.
 *
 * Held back, it says what it is for: nothing has come back yet, and the wait is
 * long enough to be worth mentioning. Turning off is immediate — once the answer
 * is here there is nothing left to wait for.
 *
 * @param {() => boolean} source what is being waited on
 * @param {number} [delay] how long a wait has to run before it is worth saying
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
