import { defineStore } from 'pinia'
import { ref } from 'vue'
import { i18n, setLocale as applyLocale, SUPPORTED_LOCALES } from '@/i18n'

let toastId = 0

/** Locale selection, transient notifications and the one blocking question. */
export const useUiStore = defineStore('ui', () => {
  const locale = ref(i18n.global.locale.value)
  const toasts = ref([])

  /*
    Confirmation, asked in the site's own voice.

    `window.confirm` is a different application interrupting this one: it wears
    the browser's chrome, ignores the theme, cannot say which files are about to
    go, and on a phone it lands wherever the browser feels like. Deleting is the
    one irreversible thing here, so it is worth a dialog that looks like the rest
    of the site and names what it is about to do.

    A promise rather than a callback, so a caller reads top to bottom the way it
    did with `confirm`. One question at a time: a second while one is open
    resolves the first as refused, which is the safe answer.
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

  /**
   * Switching the locale also switches the `Accept-Language` header every
   * request carries, so callers are expected to refetch content afterwards.
   */
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
