import { request } from './client'

/**
 * GET /v1/tags/suggestion -> `TagSuggestionDto[]`, no numeric id. The one tag
 * call a visitor makes: matches captions and aliases across every language and
 * answers in the one asked for. Public.
 */
export async function fetchTagSuggestions(text, take = 8, signal) {
  const data = await request('/tags/suggestion', { query: { text, take }, signal })
  return data?.items ?? []
}

/** GET /v1/tags -> the whole dictionary as full `TagDto`s. Editor-only. */
export async function fetchTags(signal) {
  const data = await request('/tags', { requiresAuth: true, signal })
  return data?.items ?? []
}

/**
 * POST /v1/tags/completion -> `{ tag, similarExisting }`. Saves nothing: the
 * proposal comes from a language model and must be read before it is kept.
 * See docs/features/tags.md.
 */
export async function completeTag(tag, signal) {
  const data = await request('/tags/completion', {
    method: 'POST',
    body: { tag },
    requiresAuth: true,
    signal,
  })
  return { tag: data?.tag ?? null, similarExisting: data?.similarExisting ?? [] }
}

/** POST /v1/tags -> the created `TagDto`. Editor-only. */
export async function createTag(tag) {
  const data = await request('/tags', { method: 'POST', body: { tag }, requiresAuth: true })
  return data?.tag ?? null
}

/** PATCH /v1/tags/{id} -> the updated `TagDto`. Body fields all optional. Editor-only. */
export async function editTag(id, tag) {
  const data = await request(`/tags/${id}`, { method: 'PATCH', body: { tag }, requiresAuth: true })
  return data?.tag ?? null
}

/**
 * GET /v1/tags/{id}/suggest -> `{ seedCount, items }`. Under three marked files
 * the server returns no items on purpose - an expected state, not an error.
 * Editor-only. See docs/features/similarity.md.
 */
export async function fetchTagCandidates(tagId, take = 300, signal) {
  const data = await request(`/tags/${tagId}/suggest`, {
    query: { take },
    requiresAuth: true,
    signal,
  })
  return { seedCount: data?.seedCount ?? 0, items: data?.items ?? [] }
}

/**
 * POST /v1/tags/{id}/media -> `{ affected }`. **Adds** the tag, leaving the other
 * tags alone - unlike `PATCH /v1/media`, where `tagIds` replaces the set outright.
 * Editor-only.
 */
export async function addTagToMedia(tagId, mediaFileIds) {
  const data = await request(`/tags/${tagId}/media`, {
    method: 'POST',
    body: { mediaFileIds },
    requiresAuth: true,
  })
  return data?.affected ?? 0
}
