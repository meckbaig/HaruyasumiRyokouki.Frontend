import { defineStore } from 'pinia'
import { ref } from 'vue'
import { i18n, setLocale as applyLocale, SUPPORTED_LOCALES } from '@/i18n'

let toastId = 0

/** Locale selection and transient notifications. */
export const useUiStore = defineStore('ui', () => {
  const locale = ref(i18n.global.locale.value)
  const toasts = ref([])

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

  return { locale, toasts, setLocale, notify, dismissToast }
})
