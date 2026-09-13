# Changelog

Feature releases only. The third segment carries fixes and small changes that a
visitor would not notice, and those are left to the git history. Major zero said
the site was still finding its shape; it has found it.

## 1.6.0 - notes that point at things

A day's note and a photograph's description are no longer plain text. They carry a
small markup of their own: a link with a name, an address pasted bare, and a
reference to a file of the page by its id. Pointing at a reference opens a card with
the picture, its title, its description and the time it was taken, and clicking it
brings that file into view and rings it, so it is clear which one was meant.

From there the file opens full screen and comes back. An arrow beside the close
button reverses the whole move, scrolling to the exact line it was followed from and
lighting it, and the browser's own Back does the same, because that step is recorded
in the history rather than in the address.

While writing, the same markup is highlighted inside the field itself and the field
opens at the height its text needs. The media button writes a reference whose id can
be filled in by clicking the file in the grid below instead of typing it.

- Notes and descriptions may refer to a file of the page by its id, with a card showing its picture, title, description and time
- An address in a note becomes a link, labelled by its site and the last part of its path
- A link can be given a name of its own
- Clicking a reference brings the file into view and singles it out
- Opening a referenced file records a step in history, so the browser's Back returns to the line it was followed from
- The viewer gains an arrow back to the text, beside the close button
- The editor highlights the markup inside the note and description fields
- The media button fills its reference's id from a click on a file in the grid
- Note and description fields open at the height their text needs

## 1.5.0 - a livelier search

The search page stopped drawing boxes around what it found. A framed photograph
reads as a control panel rather than a wall, so a matched file is now just a
photograph, and what matched is said by the remainder instead: the files pulled
in by "show the rest of this day" sit behind a dim that lifts on the one tile
the cursor is over. The dim follows the theme - lighter under a light scheme,
deeper under a dark one - because a photograph fades more against light paper.

The walls also move now. Tiles arrive one after another on the day page and in
each search-result group, the way they already did on the pending queue, and the
"show the rest" button is the last step of that cascade. Collapsing folds the
block shut rather than dropping it, so the button below is not jumped over. On a
day, the note is drawn downwards from the top as it arrives, without moving the
grid beneath it.

- Search results are no longer outlined; matched files render like any other photograph
- The rest of a day is dimmed behind what matched, and the dim lifts on the tile under the cursor
- The dim follows the theme scheme: 0.8 under light, 0.6 under dark
- Tiles arrive one after another on the day page and in each search-result group
- The "show the rest" button arrives as the last step of that cascade
- Collapsing the rest of a day folds the block shut instead of dropping it
- A day's note is drawn downwards from the top as it arrives, without moving the grid below

## 1.4.0 - a steadier viewer

The viewer's picture is no longer a single image that swaps, but a stack that
keeps every layer it has already shown. The blurred miniature stays as the base,
the preview settles over it and the full-size image over that, and none of them
steps down when something sharper arrives. So the layer on top always paints over
a real stand-in, never over the dark room - which matters in a long session, when
the browser evicts a full-size bitmap and has to re-decode it while the reader is
looking.

The opening flight is steadier too. A sharper image that finishes loading while
the picture is flying in now fades up over its stand-in instead of snapping in,
and a return flight follows the page if the reader scrolls before it lands, so it
comes to rest on the tile it left rather than beside it.

- Each image layer stays beneath the one above it, so the top layer always renders over a real stand-in
- A full-size image that finishes loading during the opening flight fades in over its stand-in instead of snapping
- A return flight follows the page if the reader scrolls before it lands, landing on the tile it left
- A layer the browser already holds settles at full sharpness from the first frame instead of fading up

## 1.3.0 - a lighter viewer

The viewer's open and close animations now run on a dedicated element instead of re-rendering
the image every frame. The filmstrip keys its images by file so a fast page turn does not paint
the file just left as the one coming next, video metadata that arrives after it was paged past
no longer leaves detached audio running, and gestures work in the space around a player while
presses on it go to its own controls.

The tag input in the editor stopped being a row of chips with a box at the end and became
one editable line, where the gaps between chips are real text and the caret can sit anywhere.
Typing in a gap filters the dictionary and inserts at that position; Backspace pulls the
previous chip back into text for re-editing. The editor keeps its place while open: the title
field takes focus when the dialog opens, after the model loads, and on un-minimise, and
coordinates pasted from Google Maps land in whichever field they belong to rather than only
one.

- The tag input is one editable line of chips; typing in a gap filters and inserts at that position
- Backspace pulls the previous chip back into text for re-editing
- The first dropdown option is auto-selected when typing starts in the tag input
- The title field takes focus on dialog open, after model load, and on un-minimise
- Coordinates pasted from Google Maps land in whichever field they belong to
- The deletion confirmation dialog autofocuses its confirmation button
- Multiple dots of selected media render above neighboring markers on the editor map
- Full-screen open and close animations run on a dedicated element instead of re-rendering the image every frame
- A fast page turn no longer paints the file just left as the one coming next in the filmstrip
- Video metadata that arrives after it was paged past no longer leaves detached audio running
- Gestures work in the space around a player while presses on it go to its own controls
- Long file names wrap onto two lines instead of truncating in full-screen mode
- The media edit dialog keeps a static size while its data loads, and the similar-photos panel folds away into a collapsible section with its own scrolling wall
- The editor's mark and control explanations moved from inline text to hover tooltips
- Tags show their proper names at once when first edited, instead of their slug for a moment
- The installed app's system bar takes the color of the theme chosen at install time

## 1.2.0 - faster filing

Everything here is about the screens used to put the archive in order. Filing a
morning's photographs is hundreds of small decisions, and this release is mostly
about the ones that were costing a detour: a form opened to answer a yes-or-no
question, a place looked up on Google Maps and then hunted for again here, a
queue that lost its place every time something left it.

Deleting is the exception, and it goes the other way. It is the one irreversible
thing on the site, so it now asks in the site's own voice, says how many files it
is about to take, and - finally - can be asked about a whole selection rather
than one file at a time.

- Hiding a file is a button on the thumbnail itself, beside the star, instead of
  a trip through the editor
- A selection can be deleted, from the same button on the edit card that deletes
  one file, and the confirmation says how many
- Confirmations are the site's own dialogs rather than the browser's - themed,
  readable on a phone, and able to name what they are about
- Coordinates copied from Google Maps can be pasted straight onto the editor
  map, which jumps to the spot
- Right-clicking the pin on the editor map takes it off
- Clicks near the edge of the editor map no longer move the pin, so missing the
  expand button by a few pixels stops costing a location
- The pending queue keeps everything it has revealed when a file is approved,
  instead of folding back to the first sixty
- Thumbnails now show the time under on hover
- A media opened full screen shows its title and description from response 
  rather than only its file name on pending page
- Coordinates can be set for a whole selection at once, and the editor's marks
  show a third state where the selection disagrees with itself
- The editor map names the two locations nearest the pin, and zooms with the
  wheel alone when full screen

## 1.1.0 - smoother editing and map

This release makes bulk editing feel a little less like fighting the 
interface. The editor behaves more consistently when opened from different 
places, the mobile layout makes better use of the screen, and tagging a group 
of photos no longer leaves the interface catching up afterwards.

The map gets some attention too: locations stay where they should when moving 
between views, paths connect them, and choosing a date range on the map is now 
clearer from the first click.

- The media editor opens consistently from the Day and Search views, loading the 
locations and editing data it needs 
- Mobile editing gets smoother transitions, proper safe-area handling, and a 
cleaner full-screen preview 
- Editing and favorite actions stay out of the way on mobile where they are not needed
- Multiple photos can be tagged directly from the selection actions, with the new 
tags appearing immediately 
- The editor keeps the Delete action available when opened from a day or search 
- Tagging starts ready for typing, without an extra tap on the input field 
- The map reliably zooms to selected locations and keeps the selected point centered
when switching between full-screen and regular views
- Paths between locations are shown on both the Day and editor maps
- The Map page now explains how to select a date range, with clear From and To
markers appearing as the range is chosen
- The editor sends only what was actually changed on a save, so a bulk edit to set
  coordinates no longer overwrites other files' text
- "Approved" in the editor reflects the file's real status, and the pending list
  updates when a file is saved
- The save button reads "Translate" when a translation is requested, and the UI
  locks while the automatic translation runs
- Files approved through bulk editing leave the pending queue immediately
- The editor map loads nearby photos' locations when editing several, gives the
  current photo's location priority, and zooms to the closest-in-date locations
- The map page's controls wrap instead of running off the screen edge on mobile,
  and the map opens on the trip's own date range
- Days inside a picked range on the calendar are marked with a bar under the number
  instead of a fill, so a finished day no longer looks the same as one merely
  inside the range
- Day editor drafts are persisted and restored, with a notice and a discard option
- Closing a dialog with the cross is now distinct from dismissing it by clicking
  the empty space or pressing Escape, so a form full of typing is not thrown away
  by a misplaced click

## 1.0.0 - similarity search

The first version without "pre-release" on it. Nothing about the site changes
with the number - it says only that the shape has settled and the parts are all
built.

What this release adds is for filing rather than for reading. The server keeps a
fingerprint of what each photograph shows and can compare across the whole
archive - other days, other places - which turns tagging into something done in
handfuls instead of one file at a time. Two screens use it: the photo editor
shows what a file resembles, and a screen of its own works the other way round,
taking a tag and proposing the rest of the archive that belongs with it.

Percentages sit beside every candidate because there is no single line between
alike and not alike: it depends on how narrow the subject is, so the whole list
comes back sorted and the person decides where it stopped being useful.

- Editing a photo shows what it resembles, and hands its tags to any of them in
  one go (only for admins)
- Choosing which tags to hand over narrows the list to the files that do not
  carry them yet (only for admins)
- A screen for collecting a tag across the archive, in rounds - each round is
  more accurate than the last (only for admins)
- A photo opens out of the thumbnail that was pressed rather than the first copy
  of it on the page - visible on the front page, where the wall is hung twice

## 0.12.0 - pre-release: tags and private files

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

## 0.11.0 - pre-release: animated transitions

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

## 0.10.0 - pre-release: favorites and links to a photo

The front page opens with a wall of photos picked out by hand, drifting past and
opening into the viewer as one album. And a photo is now something a link can
point at: shared, it arrives outlined among its neighbours, or already open.

- A right-click on a photo offers a link to it, and the viewer has a share
  button of its own
- A photo arrived at by link is outlined until the next click anywhere
- "Open the day" carries the photo with it, from the viewer and from the map
- The map opens full screen, where the wheel zooms without holding Ctrl
- Photos open at their true size at once, over a blurred stand-in rather than
  over black - and video stopped sliding under the viewer's bars
- Map popups show a wider picture again
- The theme menu no longer hides behind the map
- A star on each file marks it for the front page (only for admins)
- "Pending" page now shows dates on each media (only for admins)

## 0.9.0 - pre-release: an app with a face

The site can be installed on a phone and kept on the home screen, where it opens
without browser chrome around it. It also gained a logo - which in the Japanese
version stands in for the first character of the name and reads as part of it.

- Tapping the picture while it is still loading no longer closes the viewer
- On mobile, tapping beside the picture hides the interface instead of closing
- Nothing spins over a picture on mobile - the wait is short and the preview is
  already there
- A larger target for the handle that opens the tag list
- Map thumbnails are built the same way as everywhere else with blurred miniatures
- The day and map pages stay where they were opened rather than jumping to the
  calendar on refresh

## 0.8.0 - pre-release: zoom-based framing

The viewer stopped reserving room for its bars with padding and started framing
the picture with the zoom itself. Hiding the interface now opens the picture out
to the whole window, and paging on keeps that setting.

- A cached full-size picture replaces the preview outright, with no cross-fade
- Vertical images sit correctly on the first frame rather than settling into place
- Download links point at the file the backend offers for download

## 0.7.0 - pre-release: new image viewer

The viewer rewritten. Zoom, sideways swipes between files, a pull down to
dismiss, and an interface that can be taken away entirely.

- Chrome that carries the site's own theme rather than a fixed palette
- Descriptions and tags that open when they do not fit
- Cursor lands in the search field on mobile
- A loading indicator while a search runs

## 0.6.0 - pre-release: mobile gestures

Touch given its own vocabulary: swipes to page through files, a double tap and
the wheel to zoom, and gestures that no longer fight the page.

- Scrolling works from the previews on mobile
- Skeleton grid matches the layout it stands in for
- The editor dims the page behind it

## 0.5.0 - pre-release: display-aware resolution

Every request now says what it is being displayed on, and the backend answers
with a rendition to match - replacing the mobile/desktop split.

- Fullscreen video with playback on open
- Fullscreen images whatever their resolution
- Days titled in words rather than as a date

## 0.4.0 - pre-release: media served by the backend

The frontend stopped building storage URLs. Every file arrives with its links
ready-made, and with a tiny inline placeholder to show before anything loads.

- Buttons to download a file and to open the day it belongs to
- Video plays a stream rather than the original

## 0.3.0 - pre-release: language-aware sharing

A shared link carries the language it was shared in, and link previews are built
per language for crawlers that never run the site.

## 0.2.0 - pre-release: themes and shortcuts

Themes became a registry a new one can be added to, and the day page gained its
shortcuts.

- Pink theme
- Keyboard arrows step between days; the map can be folded away
- Tags navigate to their search and close the viewer behind them

## 0.1.0 - pre-release: first working site

The timeline, day albums, search, calendar and map, with the editor toolkit.
