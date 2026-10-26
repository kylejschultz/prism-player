# Library navigation and compact pinned headers

The sidebar **Library** button expands/collapses Artists, Albums, Songs and Playlists using a keyboard-accessible disclosure (`aria-expanded`, `aria-controls`). It defaults expanded and remembers the choice locally. Choosing a library destination from another control reveals the sidebar group. Collapsing the group does not change the active page or playback; there is no extra overview destination.

On those four collection pages, Library, the section switcher and relevant Art/List or New Playlist controls stay pinned inside the existing content scroller. The space below Search is reduced, and controls wrap within narrow workspaces. Album/artist detail pages retain their own composition. Section changes reset the collection scroller, and alphabet jumps account for the measured pinned header height.

**Recently added** replaces the former Discover label. Home's Keep It Going See all and the On Repeat/In Rotation album link open **Recently played albums**, using the server's recent-album list in its supplied order. This destination opens albums rather than individual listening-history rows. Existing local listening history remains preserved; it is still used for resume/context and has not been deleted or migrated.

Acceptance: keyboard toggle and collapse persistence; all four headers/controls remain visible after scrolling at 1440 and native-minimum980 widths with lyrics open; alphabet jumps land below the header; recently added retains its album destination; Home's recent-played link presents unique album rows that open/play albums. Check actual native artwork wash, navigation/back, large libraries, sidebar/window resizing and queued playback before accepting the local candidate.
