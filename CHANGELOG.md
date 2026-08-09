# Changelog

Feature releases only. The third segment carries fixes and small changes that a
visitor would not notice, and those are left to the git history. Major zero says
the site is still finding its shape.

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
