/**
 * Files kept out of public view.
 *
 * `private` is one of the fields the API only fills in for an editor — an
 * anonymous reader gets null, and never sees the file at all. So the test is
 * against `true` rather than truthiness: null means "not being told", not "no",
 * and the difference matters at the one place it is asked, which is whether to
 * put a mark on the screen.
 *
 * The mark exists because the file looks exactly like every other one. An editor
 * scrolling a day has no way of telling which of these are for everyone and
 * which are not, and the one thing worse than a hidden file nobody remembers is
 * a hidden file somebody shares.
 */
export function isPrivate(media) {
  return media?.private === true
}
