import { request } from './client'

/** GET /v1/days -> DayShortDto[] (date, isReady, mediaCount). */
export async function fetchDays(signal) {
  const data = await request('/days', { signal })
  return data?.items ?? []
}

/**
 * GET /v1/days/{date} -> DayDto with the note and every media file of that day.
 * `date` must be an ISO calendar date, e.g. `2025-04-12`.
 */
export async function fetchDay(date, signal) {
  const data = await request(`/days/${date}`, { signal })
  return data?.day ?? null
}

/**
 * GET /v1/days/{date}/edit -> the full DayEditDto with every language's note and
 * each translation's row id.
 *
 * The public GET flattens the day to one language, so the editor fetches this
 * richer model to fill all the language tabs and to update existing rows in
 * place. Editor-only. Returns GetEditDayResponse `{ day: DayEditDto }`.
 */
export async function fetchDayEdit(date, signal) {
  const data = await request(`/days/${date}/edit`, { requiresAuth: true, signal })
  return data?.day ?? null
}

/**
 * PUT /v1/days/{date}. The body carries a DayEditDto whose `translations` hold
 * the per-language note; `isReady` is what removes the day from the pending list.
 *
 * With `autoTranslate: true` the backend fills the missing languages from the
 * one that was written and returns the saved DayEditDto (translations array) so
 * the editor can review the machine translation. Without it the call just saves.
 *
 * @returns {Promise<object|null>} `{ value: DayEditDto }` when translating, else null.
 */
export function saveDay(date, day, { autoTranslate = false } = {}) {
  return request(`/days/${date}`, {
    method: 'PUT',
    body: { day, autoTranslate },
    requiresAuth: true,
  })
}
