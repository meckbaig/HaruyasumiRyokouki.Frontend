import { ref, onBeforeUnmount } from 'vue'

/**
 * Which set of media URLs to request: the API ships a `mobile` and a `desktop`
 * variant of every preview and original, and the choice is a property of the
 * viewport, not of the device. The breakpoint matches Tailwind's `sm`, the same
 * width at which the grid switches to its narrow layout.
 */
const QUERY = '(max-width: 640px)'

export function useIsMobile() {
  const query = window.matchMedia?.(QUERY)
  const isMobile = ref(Boolean(query?.matches))

  if (query) {
    const update = (event) => (isMobile.value = event.matches)
    query.addEventListener('change', update)
    onBeforeUnmount(() => query.removeEventListener('change', update))
  }

  return isMobile
}
