/**
 * Unsaved day notes, kept on the machine that typed them.
 *
 * A day's note is the one thing on this site written at length, and it is
 * written in a form that lives inside a page — so a stray back gesture, a
 * swipe to the next day or a closed tab took it with them. The server hears
 * nothing until Save is pressed and has no business hearing a half-written
 * paragraph, so the copy stays here.
 *
 * Only where something differs from what the server holds. A draft identical to
 * the saved note is not a draft, it is litter — and with a three-month trip
 * there are enough days to make that matter.
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
    // A draft that cannot be parsed is a draft that is gone; nothing to report.
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
    // A full or disabled store costs the draft and nothing else. The form still
    // works; it just stops holding a spare copy.
  }
}

export function clearDraft(date) {
  if (!date) return
  try {
    localStorage.removeItem(keyFor(date))
  } catch {
    // Nothing to do — and nothing depends on it having worked.
  }
}

/** Whether two sets of notes say the same thing, blank and absent included. */
export function sameNotes(a, b, locales) {
  return locales.every((locale) => (a?.[locale] ?? '').trim() === (b?.[locale] ?? '').trim())
}
