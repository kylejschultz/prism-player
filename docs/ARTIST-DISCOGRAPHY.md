# Artist discography playback

Artist pages offer Newest first (the default) and Oldest first in both Art and List views. The selection is remembered across artist navigation and relaunch. Releases sort by year, then album name and stable album ID. Unknown years remain last in either direction; library import or modification time does not affect chronology. Latest Release always uses newest-first chronology.

Artist Play, artist artwork and Shuffle prepare every release in Albums through the existing album query cache, four requests at a time, without the former 50-album limit. List-view track clicks prepare the same discography and select that exact release/track occurrence. Disc and track numbering determine order within each album. Next/Previous can cross release boundaries.

Albums contains releases with this artist’s album-level credit, including true jointly credited albums. Structured albumArtists takes precedence over legacy albumArtist and primary artist metadata. A featured-song credit never promotes its album into Albums. Main artist Play/Shuffle, album counts, years and Latest Release exclude those appearances.

Appears on is a separate section, available in Art and List modes, containing matching tracks on other artists’ releases. Its Play/Shuffle actions prepare only credited tracks, and a row selects the precise appearance occurrence. Album headings open the complete original release, whose explicit album playback remains available there. Discovery reuses the server artist response and existing catalog credits; if the server omits an appearance, it becomes discoverable when its track credits are available in the catalog. Navigation does not download every album to discover guests. Appearance rows load lazily from the existing query cache and do not display unrelated tracks. Each appearance is one compact 44px row with a 32px inline album cover, single-line title/artist, album/year link, duration and track actions. Album/disc headers and album-group spacing are omitted here. Hover/focus exposes playback over the cover and a per-release appearance shortcut; keyboard selection, favorites and context actions remain available.

Every track on an owned/jointly credited album remains included, so main artist Play and its List rows share the same set. Releases are unique by album ID; separate releases and repeated recordings on different releases are retained. Explicit album controls play just that album; Top Songs remains its separately labelled set.

Preparation leaves current playback intact. A visible Preparing playback message offers Cancel. Only a complete successful result replaces the queue. A failed request offers Retry and preserves the prior queue. Another playback choice, artist/navigation/server change, cancellation or a new sort selection invalidates pending preparation; shared query responses may still populate the cache but cannot start stale playback. Sorting never changes an already active queue.

## Candidate acceptance

- Switch directions in Art/List, reopen the app, and confirm the remembered order; Latest Release stays newest.
- Click a track near an album boundary and use Next/Previous. Confirm the queue follows the displayed releases and selects the intended occurrence when a recording appears on multiple releases.
- Check an artist with more than 50 releases and one with collaborations, missing years and multiple discs.
- Confirm album controls remain album-only and Top Songs remains separate.
- During slow preparation, try Cancel, another artist/track, and disconnecting. Existing/newer playback must remain in control.
- Retry after a failed album request; a partial queue must never replace current playback.

- Check a guest-only album with one credited and several unrelated tracks: it belongs only to Appears on; its unrelated tracks never enter appearance playback. Main Play/Shuffle and Latest Release exclude it in both directions.
- Confirm jointly credited albums remain in Albums; album-level IDs take precedence over contradictory contributor names. An artist with only appearances has no enabled main Play/Shuffle but can play appearances separately.

- Verify compact appearance rows at narrow and normal window sizes: inline artwork, single-line labels, keyboard playback, album navigation and both appearance playback scopes remain usable.
