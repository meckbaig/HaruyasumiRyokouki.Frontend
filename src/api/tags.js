import { request } from './client'

/**
 * GET /v1/tags/suggestion?text=&take= -> `{ id, value, usageCount }[]`.
 *
 * Public, and the one tag call a visitor ever makes. Matches captions and
 * aliases across every language at once, and answers with the caption in the
 * language asked for — which is how typing "лапша" offers "рамэн".
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
 * POST /v1/tags/completion -> `{ tag, similarExisting }`.
 *
 * Saves nothing. It proposes the three captions, a set of aliases and a slug
 * for a word, and hands back the existing tags that look like near-duplicates.
 * The proposal comes from a language model, which is exactly why it is a
 * separate step: it has to be read before it reaches the database, and the
 * mistakes it makes are the quiet kind — katakana where kanji belongs, aliases
 * broader than the thing they name.
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

/**
 * PATCH /v1/tags/{id} -> the updated `TagDto`.
 *
 * Every field of the body is optional; only what changed is sent. Editor-only.
 */
export async function editTag(id, tag) {
  const data = await request(`/tags/${id}`, { method: 'PATCH', body: { tag }, requiresAuth: true })
  return data?.tag ?? null
}
