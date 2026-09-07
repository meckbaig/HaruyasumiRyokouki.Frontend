import { watch } from 'vue'
import { i18n } from '@/i18n'
import { useThemeStore } from '@/stores/theme'
import { buildInstallManifest, applyInstallManifest } from '@/services/install'

/*
  Keeps the install manifest link pointing at a manifest whose theme_color is the
  paper of the resolved theme. A browser reads the manifest at install time, so
  the installed app's system bar takes the theme chosen then.
  See docs/features/install-and-theming.md.
*/
export function useInstallManifest() {
  const theme = useThemeStore()
  const { t, locale } = i18n.global

  function refresh() {
    const resolved = theme.resolvedTheme
    const paper = resolved?.colors?.paper
    if (!resolved || !paper) return
    applyInstallManifest(
      buildInstallManifest({
        title: t('app.title'),
        subtitle: t('app.subtitle'),
        description: t('seo.description'),
        locale: locale.value,
        paper,
      }),
    )
  }

  // Rebuild on a theme change (system resolves to light/dark live) and on a
  // locale switch, which rewrites the name under the icon. Runs once on boot.
  watch([locale, () => theme.resolvedTheme], refresh, { immediate: true })
}
