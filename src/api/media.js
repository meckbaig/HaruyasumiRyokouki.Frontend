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
