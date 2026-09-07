/*
  Builds a themed install manifest at runtime. The installed app's system status
  bar is painted from the manifest's theme_color, which a browser reads at install
  time. Pointing the manifest link at the paper of the theme chosen then is what
  gives a dark install a dark bar. See docs/features/install-and-theming.md.
*/

/*
  The structural half of public/manifest.webmanifest, mirrored here because the
  runtime manifest is served as a Blob URL, whose relative URLs resolve nowhere.
  Keep these fields in sync with that file. Absolute URLs carry the origin.
*/
function structuralManifest() {
  const origin = window.location.origin
  const abs = (path) => new URL(path, origin).href
  return {
    start_url: abs('/'),
    scope: abs('/'),
    display: 'standalone',
    orientation: 'any',
    icons: [
      { src: abs('/haru-logo.svg'), sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
      { src: abs('/icon-192.png'), sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: abs('/icon-512.png'), sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: abs('/icon-512.png'), sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}

/** A Blob URL previously set on the manifest link, revoked on replacement. */
let activeUrl = null

/**
 * Builds the full manifest for a locale and a theme's paper. Mirrors the fields
 * the build script writes into the per-locale manifests (name, short_name).
 */
export function buildInstallManifest({ title, subtitle, description, locale, paper }) {
  return {
    ...structuralManifest(),
    lang: locale,
    name: `${title} - ${subtitle}`,
    short_name: title,
    description,
    theme_color: paper,
    background_color: paper,
  }
}

/**
 * Points <link rel="manifest"> at a themed manifest. Production only, like the
 * service-worker registration this sits beside. Revokes the previous Blob URL.
 */
export function applyInstallManifest(manifest) {
  if (!import.meta.env.PROD) return
  const link = document.querySelector('link[rel="manifest"]')
  if (!link) return
  if (activeUrl) URL.revokeObjectURL(activeUrl)
  const blob = new Blob([JSON.stringify(manifest)], { type: 'application/manifest+json' })
  activeUrl = URL.createObjectURL(blob)
  link.setAttribute('href', activeUrl)
}
