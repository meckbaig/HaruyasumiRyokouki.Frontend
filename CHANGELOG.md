# Changelog

Feature releases only. The third segment carries fixes and small changes that a
visitor would not notice, and those are left to the git history. Major zero says
the site is still finding its shape.

## 0.12.0 — pre-release: tags and private files

Tags are no longer words typed under each photo. A tag is now one thing with a
name in each of the three languages, and a set of hidden synonyms that only the
search knows about: type "лапша" and the tag "рамэн" is offered, though that word
appears nowhere on the site. Tapping a tag shows everything carrying it.

Files that are not for public view can now be marked as such. They stay visible
to the editor, wear a mark saying so, and cannot be shared by accident.

- The search bar suggests tags as you type, with the number of photos on each
- A tag under a photo opens everything carrying it; the address is readable
- Tags are shown and searched in the language the site is being read in
- Hidden files are marked in the grid and in the viewer, and offer no link (only
  for admins)
- The map on a day page unfolds and folds away instead of appearing at once
- Editing windows rise into place; day fields arrive and leave one after another
- Saving a photo updates it on the page straight away, with no reload
- A tag screen for coining and correcting tags, with duplicate warnings (only for
  admins)
- Tags on a photo are picked from the list rather than spelled out (only for
  admins)
- Clicking a photo in the pending queue opens it full screen instead of the editor
- The pending queue loads further photos on request, so the day list below stays
  reachable
- Photos in the day editor open full screen, to be described while being looked at
- Photos appear in the day editor only from pending page
- The "loading" line no longer flashes when a window opens

## 0.11.0 — pre-release: animated transitions

Navigation, the image viewer and loading content are animated instead of
switching in a single frame. Every animation honours the system's reduce-motion
setting and is skipped outright when it is on.

- Pages and days animate on navigation; days move in the direction stepped
- The viewer animates on open, on close and when paging between files
- The blurred placeholder fades into the picture instead of being replaced abruptly
- The viewer's bars animate when their height changes between files
- Favourites expand into place on the front page without displacing the calendar
- Search results and the pending queue appear from top to bottom
- The placeholder grid uses the day's media count and cross-fades into the real grid
- Hiding the interface responds to a tap immediately on mobile
- On a phone in landscape, the next image is sized correctly while paging
- The scrollbar is drawn as an overlay and no longer takes layout width
- The installed app uses the name in the language selected on the site

## 0.10.0 — pre-release: favorites and links to a photo

The front page opens with a wall of photos picked out by hand, drifting past and
opening into the viewer as one album. And a photo is now something a link can
point at: shared, it arrives outlined among its neighbours, or already open.

- A right-click on a photo offers a link to it, and the viewer has a share
  button of its own
- A photo arrived at by link is outlined until the next click anywhere
- "Open the day" carries the photo with it, from the viewer and from the map
- The map opens full screen, where the wheel zooms without holding Ctrl
- Photos open at their true size at once, over a blurred stand-in rather than
  over black — and video stopped sliding under the viewer's bars
- Map popups show a wider picture again
- The theme menu no longer hides behind the map
- A star on each file marks it for the front page (only for admins)
- "Pending" page now shows dates on each media (only for admins)

## 0.9.0 — pre-release: an app with a face

The site can be installed on a phone and kept on the home screen, where it opens
without browser chrome around it. It also gained a logo — which in the Japanese
version stands in for the first character of the name and reads as part of it.

- Tapping the picture while it is still loading no longer closes the viewer
- On mobile, tapping beside the picture hides the interface instead of closing
- Nothing spins over a picture on mobile — the wait is short and the preview is
  already there
- A larger target for the handle that opens the tag list
- Map thumbnails are built the same way as everywhere else with blurred miniatures
- The day and map pages stay where they were opened rather than jumping to the
  calendar on refresh

## 0.8.0 — pre-release: zoom-based framing

The viewer stopped reserving room for its bars with padding and started framing
the picture with the zoom itself. Hiding the interface now opens the picture out
to the whole window, and paging on keeps that setting.

- A cached full-size picture replaces the preview outright, with no cross-fade
- Vertical images sit correctly on the first frame rather than settling into place
- Download links point at the file the backend offers for download

## 0.7.0 — pre-release: new image viewer

The viewer rewritten. Zoom, sideways swipes between files, a pull down to
dismiss, and an interface that can be taken away entirely.

- Chrome that carries the site's own theme rather than a fixed palette
- Descriptions and tags that open when they do not fit
- Cursor lands in the search field on mobile
- A loading indicator while a search runs

## 0.6.0 — pre-release: mobile gestures

Touch given its own vocabulary: swipes to page through files, a double tap and
the wheel to zoom, and gestures that no longer fight the page.

- Scrolling works from the previews on mobile
- Skeleton grid matches the layout it stands in for
- The editor dims the page behind it

## 0.5.0 — pre-release: display-aware resolution

Every request now says what it is being displayed on, and the backend answers
with a rendition to match — replacing the mobile/desktop split.

- Fullscreen video with playback on open
- Fullscreen images whatever their resolution
- Days titled in words rather than as a date

## 0.4.0 — pre-release: media served by the backend

The frontend stopped building storage URLs. Every file arrives with its links
ready-made, and with a tiny inline placeholder to show before anything loads.

- Buttons to download a file and to open the day it belongs to
- Video plays a stream rather than the original

## 0.3.0 — pre-release: language-aware sharing

A shared link carries the language it was shared in, and link previews are built
per language for crawlers that never run the site.

## 0.2.0 — pre-release: themes and shortcuts

Themes became a registry a new one can be added to, and the day page gained its
shortcuts.

- Pink theme
- Keyboard arrows step between days; the map can be folded away
- Tags navigate to their search and close the viewer behind them

## 0.1.0 — pre-release: first working site

The timeline, day albums, search, calendar and map, with the editor toolkit.
