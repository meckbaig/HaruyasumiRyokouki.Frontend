/**
 * What release this is, for the footer to say.
 *
 * The number lives in package.json and arrives here as a build-time constant.
 * Only feature releases carry a name — the third segment is for fixes, and a
 * fix belongs to the feature release it follows, so the name is looked up by
 * major and minor alone. CHANGELOG.md is the long version of this list.
 */
const NAMES = {
  '0.10': 'favorites and links to a photo',
  '0.9': 'an app with a face',
  '0.8': 'zoom-based framing',
  '0.7': 'new image viewer',
  '0.6': 'mobile gestures',
  '0.5': 'display-aware resolution',
  '0.4': 'media served by the backend',
  '0.3': 'language-aware sharing',
  '0.2': 'themes and shortcuts',
  '0.1': 'MVP',
}

export const version = __APP_VERSION__

/** ISO timestamp of the build this bundle came from. */
export const build = __APP_BUILD__

/**
 * What each generation of the site calls itself, keyed by major version.
 *
 * Zero says it is still finding its shape. A major after that is a rework
 * rather than a number going up, and can say so here; anything with nothing
 * listed simply carries its name alone.
 */
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
