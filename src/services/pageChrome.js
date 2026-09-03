/**
 * Where the page's own floating chrome leaves off.
 *
 * For anything drawn over the page that should still appear to come out from
 * under it. Elements opt in by marking themselves `data-page-chrome="top"`.
 */
export function chromeInsets() {
  const top = document.querySelector('[data-page-chrome="top"]')
  const bottom = top?.getBoundingClientRect().bottom ?? 0
  return { top: Math.max(0, Math.round(bottom)), right: 0, bottom: 0, left: 0 }
}
