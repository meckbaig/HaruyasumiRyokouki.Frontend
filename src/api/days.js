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
 * GET /v1/days/{date}/edit -> `{ day: DayEditDto }`, every language's note with
 * its own row id. The public GET flattens to one language. Editor-only.
 */
export async function fetchDayEdit(date, signal) {
  const data = await request(`/days/${date}/edit`, { requiresAuth: true, signal })
  return data?.day ?? null
}

/**
 * PUT /v1/days/{date}. `isReady` is what removes the day from the pending list;
 * `autoTranslate` returns translations **without storing them**.
 * See docs/features/day-editor-and-pending.md.
 *
 * @returns {Promise<object|null>} `{ day: DayEditDto }` when translating, else null.
 */
export function saveDay(date, day, { autoTranslate = false } = {}) {
  return request(`/days/${date}`, {
    method: 'PUT',
    body: { day, autoTranslate },
    requiresAuth: true,
  })
}
