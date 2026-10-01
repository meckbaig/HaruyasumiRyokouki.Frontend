import { request } from './client'

/**
 * GET /v1/media/edit?ids=1&ids=2 -> full `MediaFileEditDto[]`, every language at
 * once. `ids` are integers sent as a repeated parameter. Editor-only.
 */
export async function fetchMediaEdit(ids, signal) {
  const data = await request('/media/edit', {
    query: { ids },
    requiresAuth: true,
    signal,
  })
  return data?.items ?? []
}

/**
 * GET /v1/media?from=&to= -> `GetMediaResponse { items: MediaFileDto[] }`, all media
 * in range (geotagged only on the server side). Both dates required, inclusive ISO. Public.
 */
export async function fetchMediaLocations(from, to, signal) {
  const data = await request('/media', { query: { from, to }, signal })
  return data?.items ?? []
}

/**
 * PATCH /v1/media - one set of changes applied to every id. Omitting a field is
 * what tells the backend to leave it alone. See docs/features/api-layer.md.
 *
 * @param {string[]} ids
 * @param {{latitude?: number, longitude?: number, isApproved?: boolean,
 *          private?: boolean, favorite?: boolean, tagIds?: number[],
 *          translations?: Array<{id?: number, languageCode: string,
 *          title?: string, description?: string}>}} changes
 *   `tagIds` **replaces** the tag set; to add one use `POST /v1/tags/{id}/media`.
 * @returns {Promise<object|null>} `{ items: MediaFileEditDto[] }` when translating, else null.
 */
export function editMedia(ids, changes, { autoTranslate = false } = {}) {
  return request('/media', {
    method: 'PATCH',
    body: { ids, changes, autoTranslate },
    requiresAuth: true,
  })
}

/** Marks one file for the front page, or takes the mark off. Editor-only. */
export function setFavorite(id, favorite) {
  return editMedia([id], { favorite })
}

/** Keeps one file out of public view, or lets it back in. Editor-only. */
export function setPrivate(id, isPrivate) {
  return editMedia([id], { private: isPrivate })
}

/**
 * GET /v1/media/favorites -> `MediaFileDto[]`, shuffled and capped by the server
 * and loose rather than inside their days. Public.
 */
export async function fetchFavoriteMedia(signal) {
  const data = await request('/media/favorites', { signal })
  return data?.items ?? []
}

/** DELETE /v1/media/{mediaId}. Irreversible - always confirm first. */
export function deleteMedia(mediaId) {
  return request(`/media/${mediaId}`, {
    method: 'DELETE',
    requiresAuth: true,
  })
}

/** PUT /v1/media/sync - rescans the storage and picks up newly uploaded files. */
export function syncMedia() {
  return request('/media/sync', {
    method: 'PUT',
    requiresAuth: true,
  })
}

/**
 * POST /v1/media/youtube -> the imported `MediaFileEditDto`. The server stores a
 * **link** to the video, not its bytes, and marks it with `source`; the response
 * is already a full edit model, so the editor opens on it with no follow-up
 * fetch. Editor-only.
 */
export async function importYoutubeMedia(url) {
  const data = await request('/media/youtube', {
    method: 'POST',
    body: { url },
    requiresAuth: true,
  })
  return data?.media ?? null
}

/**
 * GET /v1/media/{id}/similar -> `{ media, score }[]`, most alike first and never
 * cut off at a threshold. An empty list means no fingerprint - a video, usually.
 * Editor-only. See docs/features/similarity.md.
 */
export async function fetchSimilarMedia(id, take = 50, signal) {
  const data = await request(`/media/${id}/similar`, { query: { take }, requiresAuth: true, signal })
  return data?.items ?? []
}
