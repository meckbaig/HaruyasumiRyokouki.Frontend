import { defineStore } from 'pinia'
import { ref } from 'vue'
import { i18n, setLocale as applyLocale, SUPPORTED_LOCALES } from '@/i18n'

let toastId = 0

/** Locale selection, transient notifications and the one blocking question. */
export const useUiStore = defineStore('ui', () => {
  const locale = ref(i18n.global.locale.value)
  const toasts = ref([])

  /**
   * Confirmation in the site's own voice, promised rather than called back. One
   * question at a time: a second resolves the first as refused, the safe answer.
   * See docs/features/ui-shell.md.
   */
  const question = ref(null)
  let answer = null

  function confirm(request) {
    answer?.(false)
    return new Promise((resolve) => {
      answer = resolve
      question.value = { tone: 'danger', ...request }
    })
  }

  function settle(accepted) {
    question.value = null
    answer?.(accepted)
    answer = null
  }

  /** Switches `Accept-Language` too, so **callers must refetch** afterwards. */
  function setLocale(next) {
    if (!SUPPORTED_LOCALES.includes(next) || next === locale.value) return
    applyLocale(next)
    locale.value = next
  }

  function dismissToast(id) {
    toasts.value = toasts.value.filter((toast) => toast.id !== id)
  }

  function notify(message, tone = 'info') {
    const id = (toastId += 1)
    toasts.value = [...toasts.value, { id, message, tone }]
    setTimeout(() => dismissToast(id), 4000)
    return id
  }

  return { locale, toasts, question, setLocale, notify, dismissToast, confirm, settle }
})
