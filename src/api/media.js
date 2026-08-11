import { request } from './client'

/**
 * GET /v1/media/edit?ids=1&ids=2 -> full MediaFileEditDto[] with id and every
 * language's title/description/tags.
 *
 * The public models are flattened to one language, so the editor fetches this
 * richer model to fill all the language tabs. `ids` are integers, sent as a
 * repeated query parameter. Editor-only.
 */
export async function fetchMediaEdit(ids, signal) {
  const data = await request('/media/edit', {
    query: { ids },
    requiresAuth: true,
    signal,
  })
  // The response schema is undocumented; tolerate a bare array or an { items } wrapper.
  return Array.isArray(data) ? data : (data?.items ?? [])
}

/**
 * GET /v1/media/locations?from=&to= -> MediaFileLocationDto[].
 *
 * Only media that carry coordinates, as `{ id, created, latitude, longitude,
 * fileName, title, languageCode }`. One request draws the whole map for a range;
 * the route line is the points ordered by `created`. Both `from` and `to` are
 * required (inclusive ISO dates). Public.
 */
export async function fetchMediaLocations(from, to, signal) {
  const data = await request('/media/locations', { query: { from, to }, signal })
  return data?.items ?? []
}

/**
 * PATCH /v1/media — applies one set of changes to every id at once.
 *
 * `changes.translations` entries deliberately omit the translation `id`: in a
 * bulk edit each media file has its own translation row, so the backend is
 * expected to match on `languageCode`.
 *
 * With `autoTranslate: true` the backend fills the missing languages from the
 * one that was written and returns the updated media (translations array) so the
 * editor can review the machine translation. Without it the call just saves.
 *
 * @param {string[]} ids
 * @param {{latitude?: number, longitude?: number, isApproved?: boolean,
 *          translations?: Array<{languageCode: string, title?: string,
 *          description?: string, tags?: string[]}>}} changes
 * @param {{autoTranslate?: boolean}} [options]
 * @returns {Promise<object|null>} `{ items: MediaFileEditDto[] }` when translating, else null.
 */
export function editMedia(ids, changes, { autoTranslate = false } = {}) {
  return request('/media', {
    method: 'PATCH',
    body: { ids, changes, autoTranslate },
    requiresAuth: true,
  })
}

/**
 * Marks one file for the front page, or takes the mark off.
 *
 * A PATCH carrying nothing but `favorite`: every other field is left out, which
 * is what tells the backend to leave it alone. Editor-only.
 */
export function setFavorite(id, favorite) {
  return editMedia([id], { favorite })
}

/**
 * GET /v1/media/favorites -> MediaFileDto[].
 *
 * The files picked out for the front page. The backend shuffles them and caps
 * the count, so the order is different on every visit and nothing here sorts or
 * trims. Public.
 *
 * They arrive loose rather than inside their days, so each one's day comes from
 * its own `created` timestamp (`mediaDate` in services/mediaAssets).
 */
export async function fetchFavoriteMedia(signal) {
  const data = await request('/media/favorites', { signal })
  return data?.items ?? []
}

/** DELETE /v1/media/{mediaId}. Irreversible — always confirm first. */
export function deleteMedia(mediaId) {
  return request(`/media/${mediaId}`, {
    method: 'DELETE',
    requiresAuth: true,
  })
}

/** PUT /v1/media/sync — rescans the storage and picks up newly uploaded files. */
export function syncMedia() {
  return request('/media/sync', {
    method: 'PUT',
    requiresAuth: true,
  })
}
