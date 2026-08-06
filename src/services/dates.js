/**
 * Date helpers.
 *
 * The API speaks ISO calendar dates (`2025-04-12`) with no time zone attached.
 * Parsing those with `new Date('2025-04-12')` would place them at UTC midnight
 * and shift the day for anyone west of Greenwich, so every conversion here goes
 * through explicit year/month/day parts and stays in local time.
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

/** Weekday name for the date heading. */
export function formatWeekday(iso, locale) {
  const date = parseIsoDate(iso)
  if (!date) return ''
  return new Intl.DateTimeFormat(locale, { weekday: 'long' }).format(date)
}

export function formatMonthTitle(date, locale) {
  return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(date)
}

/**
 * Short weekday labels for a calendar header, Monday first.
 *
 * Built from a known week (2024-01-01 was a Monday) so the labels always come
 * from `Intl` and never from a hardcoded list per locale.
 */
export function weekdayLabels(locale) {
  const formatter = new Intl.DateTimeFormat(locale, { weekday: 'short' })
  const monday = new Date(2024, 0, 1)
  return Array.from({ length: 7 }, (_, index) => formatter.format(addDays(monday, index)))
}

/**
 * Builds a 6×7 grid of dates covering `monthDate`, padded with the surrounding
 * days so every row is full. Monday is the first column.
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
