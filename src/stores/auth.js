import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { setAuthHeader, encodeBasic } from '@/api/authState'
import { verifyCredentials } from '@/api/auth'
import { useTagsStore } from './tags'

const STORAGE_KEY = 'haruyasumi.auth'

/**
 * Editor session.
 *
 * There is no token endpoint — the API uses HTTP Basic — so "staying signed in"
 * means keeping the encoded credentials around. With "remember me" they go to
 * localStorage and survive a restart; without it they live only in memory and
 * disappear when the tab is closed.
 */
export const useAuthStore = defineStore('auth', () => {
  const login = ref('')
  const header = ref(null)
  const remember = ref(false)

  const isEditor = computed(() => Boolean(header.value))

  function apply(nextLogin, nextHeader) {
    login.value = nextLogin
    header.value = nextHeader
    setAuthHeader(nextHeader)
  }

  /** Restores a remembered session on boot. Call once, before the first render. */
  function restore() {
    let stored = null
    try {
      stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
    } catch {
      stored = null
    }

    if (stored?.header) {
      remember.value = true
      apply(stored.login ?? '', stored.header)
    }
  }

  /**
   * Verifies the credentials against the backend before storing them.
   *
   * @returns {Promise<boolean>} false when the server rejected them.
   */
  async function signIn(nextLogin, password, rememberMe) {
    const nextHeader = encodeBasic(nextLogin, password)
    const accepted = await verifyCredentials(nextLogin, password)
    if (!accepted) return false

    remember.value = Boolean(rememberMe)
    apply(nextLogin, nextHeader)

    if (remember.value) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ login: nextLogin, header: nextHeader }))
    } else {
      localStorage.removeItem(STORAGE_KEY)
    }

    return true
  }

  function signOut() {
    apply('', null)
    remember.value = false
    localStorage.removeItem(STORAGE_KEY)
    // The tag dictionary is editor-only data held in memory; leaving it behind
    // would show the next person a vocabulary they are not signed in to see.
    useTagsStore().clear()
  }

  return { login, remember, isEditor, restore, signIn, signOut }
})
