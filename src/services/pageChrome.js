/**
 * Where the page's floating chrome leaves off, for anything drawn over the page
 * that should still come out from under it. Opt in with `data-page-chrome`.
 */
export function chromeInsets() {
  const top = document.querySelector('[data-page-chrome="top"]')
  const bottom = top?.getBoundingClientRect().bottom ?? 0
  return { top: Math.max(0, Math.round(bottom)), right: 0, bottom: 0, left: 0 }
}
