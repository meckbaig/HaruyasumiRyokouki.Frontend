<script setup>
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
</script>

<template>
  <div class="mx-auto max-w-md px-4 py-24 text-center">
    <h1 class="text-xl font-semibold tracking-tight text-ink">{{ t('notFound.title') }}</h1>
    <RouterLink :to="{ name: 'home' }" class="btn-ghost mt-6">
      {{ t('notFound.back') }}
    </RouterLink>
  </div>
</template>
