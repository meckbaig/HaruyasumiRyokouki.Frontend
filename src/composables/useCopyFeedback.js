import { ref, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'

/**
 * "Copied" feedback shown beside a share button rather than as a corner toast.
 * `run` takes anything answering a promise of a boolean.
 */
export function useCopyFeedback({ duration = 2000 } = {}) {
  const { t } = useI18n()
  const feedback = ref(null)
  let timer = null

  async function run(copy) {
    const ok = await copy()
    feedback.value = { ok, text: t(ok ? 'common.shareCopied' : 'common.shareFailed') }
    clearTimeout(timer)
    timer = setTimeout(() => (feedback.value = null), duration)
    return ok
  }

  onBeforeUnmount(() => clearTimeout(timer))

  return { feedback, run }
}
