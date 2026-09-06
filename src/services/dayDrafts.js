/**
 * Unsaved day notes, kept in localStorage on the machine that typed them, and
 * only where they differ from the saved note. See
 * docs/features/day-editor-and-pending.md.
 */
const PREFIX = 'haruyasumi.dayDraft.'

function keyFor(date) {
  return `${PREFIX}${date}`
}

/**
 * @param {string} date ISO day
 * @returns {{ notes: Record<string, string>, savedAt: string } | null}
 */
export function readDraft(date) {
  if (!date) return null
  try {
    const stored = JSON.parse(localStorage.getItem(keyFor(date)) ?? 'null')
    return stored?.notes ? stored : null
  } catch {
    // A draft that cannot be parsed is a draft that is gone.
    return null
  }
}

export function writeDraft(date, notes) {
  if (!date) return
  try {
    localStorage.setItem(
      keyFor(date),
      JSON.stringify({ notes, savedAt: new Date().toISOString() }),
    )
  } catch {
    // A full or disabled store costs the draft and nothing else.
  }
}

export function clearDraft(date) {
  if (!date) return
  try {
    localStorage.removeItem(keyFor(date))
  } catch {
    // Nothing depends on it having worked.
  }
}

/** Whether two sets of notes say the same thing, blank and absent included. */
export function sameNotes(a, b, locales) {
  return locales.every((locale) => (a?.[locale] ?? '').trim() === (b?.[locale] ?? '').trim())
}
