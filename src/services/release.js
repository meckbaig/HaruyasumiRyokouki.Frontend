/**
 * What release this is, for the footer to say. Names are keyed by major and minor
 * alone - the third segment is for fixes, and a fix belongs to the feature
 * release it follows. See docs/features/build-and-release.md.
 */
const NAMES = {
  '2.0': 'a new map',
  '1.9': 'touch gesture updates',
  '1.8': 'multi-file media references',
  '1.7': 'viewer preloading + search polish',
  '1.6': 'media references in notes',
  '1.5': 'search visual update',
  '1.4': 'viewer image layer stack',
  '1.3': 'viewer optimization + new tag input',
  '1.2': 'editor filing + delete dialogs',
  '1.1': 'bulk editing + map',
  '1.0': 'similarity search',
  '0.12': 'tags and private files',
  '0.11': 'animated transitions',
  '0.10': 'favorites + photo links',
  '0.9': 'installable app + logo',
  '0.8': 'zoom-based framing',
  '0.7': 'new image viewer',
  '0.6': 'mobile gestures',
  '0.5': 'display-aware resolution',
  '0.4': 'backend media URLs',
  '0.3': 'language-aware sharing',
  '0.2': 'themes and shortcuts',
  '0.1': 'first working site',
}

export const version = __APP_VERSION__

/** ISO timestamp of the build this bundle came from. */
export const build = __APP_BUILD__

/** What each generation of the site calls itself, keyed by major version. */
const STAGES = {
  0: 'pre-release',
}

const [major, minor] = version.split('.')

export const name = NAMES[`${major}.${minor}`] ?? ''
export const stage = STAGES[Number(major)] ?? ''

/** Reads as `0.8.1 · pre-release: zoom-based framing`. */
export const label = [version, [stage, name].filter(Boolean).join(': ')]
  .filter(Boolean)
  .join(' · ')
