<script setup>
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth'
import { useUiStore } from '@/stores/ui'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const ui = useUiStore()

const login = ref('')
const password = ref('')
const remember = ref(true)
const submitting = ref(false)
const error = ref(null)

async function submit() {
  submitting.value = true
  error.value = null
  try {
    const accepted = await auth.signIn(login.value, password.value, remember.value)
    if (!accepted) {
      error.value = { message: t('login.failed') }
      return
    }

    ui.notify(t('login.success'), 'success')
    const redirect = route.query.redirect
    router.replace(typeof redirect === 'string' && redirect ? redirect : { name: 'home' })
  } catch (caught) {
    error.value = {
      message: caught.detail || caught.title || t(caught.fallbackKey ?? 'errors.generic'),
    }
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="mx-auto max-w-sm px-4 py-16">
    <h1 class="mb-6 text-xl font-semibold tracking-tight text-ink">{{ t('login.title') }}</h1>

    <form class="space-y-4" @submit.prevent="submit">
      <div>
        <label class="field-label" for="login-name">{{ t('login.login') }}</label>
        <input
          id="login-name"
          v-model="login"
          type="text"
          autocomplete="username"
          required
          class="field-input"
        />
      </div>

      <div>
        <label class="field-label" for="login-password">{{ t('login.password') }}</label>
        <input
          id="login-password"
          v-model="password"
          type="password"
          autocomplete="current-password"
          required
          class="field-input"
        />
      </div>

      <label class="flex items-center gap-2 text-sm text-ink-soft">
        <input v-model="remember" type="checkbox" class="rounded border-edge" />
        {{ t('login.remember') }}
      </label>

      <p v-if="error" role="alert" class="text-sm text-accent">{{ error.message }}</p>

      <button type="submit" class="btn-primary w-full" :disabled="submitting">
        {{ submitting ? t('login.submitting') : t('login.submit') }}
      </button>
    </form>
  </div>
</template>
