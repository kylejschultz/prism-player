# Artist discography playback

Artist pages offer Newest first (the default) and Oldest first in both Art and List views. The selection is remembered across artist navigation and relaunch. Releases sort by year, then album name and stable album ID. Unknown years remain last in either direction; library import or modification time does not affect chronology. Latest Release always uses newest-first chronology.

Artist Play, artist artwork and Shuffle prepare every displayed release through the existing album query cache, four requests at a time, without the former 50-album limit. List-view track clicks prepare the same discography and select that exact release/track occurrence. Disc and track numbering determine order within each album. Next/Previous can cross release boundaries.

Album eligibility continues to use the artist detail plus existing artist/album/song collaboration credits. Every track shown within an eligible release is included, so artist Play and row playback share the displayed set. Releases are unique by album ID; separate releases and repeated recordings on different releases are retained. Explicit album controls play just that album; Top Songs remains its separately labelled set.

Preparation leaves current playback intact. A visible Preparing playback message offers Cancel. Only a complete successful result replaces the queue. A failed request offers Retry and preserves the prior queue. Another playback choice, artist/navigation/server change, cancellation or a new sort selection invalidates pending preparation; shared query responses may still populate the cache but cannot start stale playback. Sorting never changes an already active queue.

## Candidate acceptance

- Switch directions in Art/List, reopen the app, and confirm the remembered order; Latest Release stays newest.
- Click a track near an album boundary and use Next/Previous. Confirm the queue follows the displayed releases and selects the intended occurrence when a recording appears on multiple releases.
- Check an artist with more than 50 releases and one with collaborations, missing years and multiple discs.
- Confirm album controls remain album-only and Top Songs remains separate.
- During slow preparation, try Cancel, another artist/track, and disconnecting. Existing/newer playback must remain in control.
- Retry after a failed album request; a partial queue must never replace current playback.
