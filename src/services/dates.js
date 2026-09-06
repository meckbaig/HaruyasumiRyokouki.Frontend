/**
 * Date helpers. The API speaks ISO calendar dates with no time zone, so every
 * conversion goes through explicit year/month/day parts and stays in local time -
 * `new Date('2025-04-12')` is UTC midnight and shifts the day west of Greenwich.
 */

/** `2025-04-12` -> Date at local midnight. */
export function parseIsoDate(iso) {
  if (!iso) return null
  const [year, month, day] = String(iso).slice(0, 10).split('-').map(Number)
  if (!year || !month || !day) return null
  return new Date(year, month - 1, day)
}

/** Date -> `2025-04-12`, using local parts rather than `toISOString()`. */
export function toIsoDate(date) {
  if (!date) return ''
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function addDays(date, amount) {
  const result = new Date(date)
  result.setDate(result.getDate() + amount)
  return result
}

export function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

export function addMonths(date, amount) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1)
}

export function isSameDay(a, b) {
  return Boolean(a && b) && toIsoDate(a) === toIsoDate(b)
}

/** Long, human date for headings: "April 12, 2026". */
export function formatLongDate(iso, locale) {
  const date = parseIsoDate(iso)
  if (!date) return ''
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date)
}

/** Compact date for a badge on a picture: "12 Apr". */
export function formatShortDate(iso, locale) {
  const date = parseIsoDate(iso)
  if (!date) return ''
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(date)
}

/** Day and clock time: "12 Apr, 14:35". Both halves - the picker spans three days. */
export function formatShortDateTime(iso, locale) {
  const at = iso ? new Date(iso) : null
  if (!at || Number.isNaN(at.getTime())) return ''
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(at)
}

/** Clock time alone: "14:35". The day is whatever page it is read on. */
export function formatShortTime(iso, locale) {
  const at = iso ? new Date(iso) : null
  if (!at || Number.isNaN(at.getTime())) return ''
  return new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(at)
}

export function formatWeekday(iso, locale) {
  const date = parseIsoDate(iso)
  if (!date) return ''
  return new Intl.DateTimeFormat(locale, { weekday: 'long' }).format(date)
}

export function formatMonthTitle(date, locale) {
  return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(date)
}

/** Short weekday labels, Monday first. See docs/features/days-and-calendar.md. */
export function weekdayLabels(locale) {
  const formatter = new Intl.DateTimeFormat(locale, { weekday: 'short' })
  const monday = new Date(2024, 0, 1)
  return Array.from({ length: 7 }, (_, index) => formatter.format(addDays(monday, index)))
}

/**
 * A 6x7 grid covering `monthDate`, padded from the surrounding months so every
 * row is full. Monday is the first column.
 *
 * @returns {Array<{date: Date, iso: string, inMonth: boolean}>}
 */
export function monthGrid(monthDate) {
  const first = startOfMonth(monthDate)
  // getDay() is Sunday-based; shift so Monday becomes 0.
  const leading = (first.getDay() + 6) % 7
  const gridStart = addDays(first, -leading)

  return Array.from({ length: 42 }, (_, index) => {
    const date = addDays(gridStart, index)
    return {
      date,
      iso: toIsoDate(date),
      inMonth: date.getMonth() === first.getMonth(),
    }
  })
}
