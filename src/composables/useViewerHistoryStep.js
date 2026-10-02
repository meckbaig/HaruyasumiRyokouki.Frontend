import { nextTick, onBeforeUnmount, onMounted, watch } from 'vue'

/**
 * The history step a page gives its full-screen viewer. Opening **pushes** a
 * step of its own, closing by hand takes it back, and the browser's Back runs
 * the viewer's own close so the picture flies home. A step never opens a viewer.
 * See docs/features/media-viewer.md.
 *
 * @param {object} options
 * @param {import('vue').Ref<number|null>} options.index the open file, null when closed.
 * @param {(index: number) => number|null} options.idAt the file's id at that index.
 * @param {() => boolean} options.addressHasStep the page's pair is already in the address.
 * @param {(id: number) => void} options.push add the viewer's own step.
 * @param {(id: number) => void} options.replace replace the step on a turn.
 * @param {() => void} options.clear drop the pair when the step is not this page's.
 * @param {() => void} options.close run the viewer's own close.
 * @param {() => void} [options.otherStep] the page's remaining overlays on a step.
 * @returns {{ isHistoryStep: () => boolean, forgetStep: () => void, takeBack: () => void }}
 */
export function useViewerHistoryStep({
  index,
  idAt,
  addressHasStep,
  push,
  replace,
  clear,
  close,
  otherStep,
}) {
  /** The viewer's own step stands in history. */
  let pushed = false
  /** A write from the close would cancel the popstate it is answering. */
  let answering = false
  /** This page is taking back a step it pushed, so the step answers nothing. */
  let consuming = false
  /** A step is being answered: no address it lands on may open a viewer. */
  let stepping = false

  /** A step of this page's own, taken back: the browser's next step is ours. */
  function takeBack() {
    consuming = true
    history.back()
  }

  watch(index, (value) => {
    if (answering) return

    const id = value == null ? null : idAt(value)
    if (id != null) {
      if (pushed) {
        replace(id)
        return
      }
      // A deep link already brought its own step, so none is pushed for it.
      if (addressHasStep()) return
      pushed = true
      push(id)
      return
    }

    if (pushed) {
      pushed = false
      takeBack()
      return
    }
    clear()
  })

  function onPopState() {
    const tookBack = consuming
    consuming = false

    if (!tookBack) {
      stepping = true
      nextTick(() => (stepping = false))
      // A step onto a link that named the viewer keeps it open.
      if (new URLSearchParams(window.location.search).get('o') === '1') return
    }

    if (index.value != null) {
      answering = true
      close()
      pushed = false
      nextTick(() => (answering = false))
      return
    }

    if (!tookBack) otherStep?.()
  }

  onMounted(() => window.addEventListener('popstate', onPopState))
  onBeforeUnmount(() => window.removeEventListener('popstate', onPopState))

  return {
    /** Whether the step now being answered is the browser's own. */
    isHistoryStep: () => stepping,
    /** Drop the viewer's step flag: a navigation is taking its place. */
    forgetStep: () => (pushed = false),
    takeBack,
  }
}
