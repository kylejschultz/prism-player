# Combined playback sidebar

The single sidebar button to the right of volume opens or closes the playback sidebar. It retains the saved open state and width. Both panes are visible by default; the former Queue/Lyrics tab preference is ignored. When both panes are visible, each pane heading has an edge-directed chevron: Queue/Timeline folds upward and Lyrics folds downward. Hidden Queue/Timeline restores with + Queue / + Timeline in the top header, and hidden Lyrics with + Lyrics at the bottom edge; the separate sidebar icon closes the whole sidebar. A single visible pane fills the available content height.

With one pane visible, its fold chevron is removed: the sidebar icon is the single close control. Closing with that icon, the footer toggle or Escape preserves the current one/two-pane layout; reopening restores the same panes. Closing returns focus to the footer sidebar toggle. Pane visibility survives relaunch and library/Radio switches. Hidden panes stay mounted to retain lyric position, queue scroll and Radio tool state. The divider is available only with both panes visible; restoring both restores its saved split.

The upper pane shows the local queue or radio timeline. The lower pane shows lyrics and starts larger by default. Drag the divider between the panes to adjust their split; the saved split survives reopening the sidebar and app. Focus the divider and use Up/Down arrows to adjust it, or Home/End to reach either limit. The compact split keeps at least 96px for the local queue and 112px for lyrics when space permits. Dragging within 48px of either edge previews collapse with a Release to hide cue; releasing collapses that pane. Restoring it returns the previous usable split, not the near-zero preview. Cancelling a drag leaves the saved split intact. Both headers have fixed 28px single-line geometry across resizing and one/two-pane states. Compact lyrics panes hide the repeated track metadata (still shown in the footer) to keep room for the active lyric. Both scroll independently, and the lyrics fill their allocated lower area down to the footer. Synced lines remain centered within that area, including first/final verses and wrapped lines; the existing emphasis and blur apply. Plain, loading and unavailable lyrics retain their existing states.

In the radio timeline, On air remains visible above one independently scrollable list, with a Recently played / Up next switch beneath it. Recently played is selected initially and shows the newest track first, directly beneath On air and the switch. Up next shows the station’s next eight tracks when supplied; Recently played retains the latest five. Switching lists returns the chosen list to its top without moving lyrics; an empty view explains when the station has no tracks to show. The list is keyboard-focusable; Home/End move to its start/end, and scrolling it does not move lyrics. With On air pinned, the radio timeline reserves at least 160px above the divider when available, keeping a complete next row reachable at the minimum split. Local queue allocations retain their compact 96px minimum.

For radio, schedule, requests and booth feed occupy the upper pane without replacing lyrics. The timeline button in the sidebar header returns to the timeline. Cancelling a request or selecting the same radio tool again also returns to the timeline. Stopping radio restores the local queue above lyrics.

Lyrics load while the sidebar is visible and cancel when it closes. Switching upper radio tools does not restart the lyric request. Pane layout controls do not restart lyric requests. Opening a Radio tool reveals the upper pane if it was hidden; its footer action is expanded only while that tool is visible. Escape and the sidebar-collapse icon close the entire sidebar.

Search suggestions activate on completed clicks, not mouse-down. Focus can move from Search into suggestions without dismissing them. Album, artist and playlist suggestions open their detail views; song suggestions retain their explicit playback action. Selecting an album must not replace or start the current playback.

## Acceptance

- Open/close the sidebar with mouse and keyboard, resize the window/sidebar, and reopen the app to verify its saved open state.
- Fold Queue, close the sidebar, reopen and verify Lyrics only. Repeat in reverse and verify Queue only; restoring the other pane works without closing the sidebar.
- Close the whole sidebar with both panes visible and verify both reopen. Check the same after relaunch, and verify focus returns to the footer toggle on close.
- Drag the divider, adjust it with the keyboard, and reopen the app to verify the saved split. Resize between short and tall windows; neither pane may overlap the footer.
- Check queue selection, removal and reordering while lyrics remain in the lower pane. Scrolling the queue must not move the current lyric.
- Check synced first/middle/final verses at minimum, normal and tall window sizes; lyrics must fill the lower allocation without overlap or dead space.
- Check Recently played starts newest-first below On air; switch to Up next and back with mouse/keyboard. On air stays pinned and lyric scrolling is unchanged, including at the minimum pane size.
- Check radio timeline, schedule, request cancellation and booth feed while lyrics stay loaded. Older/disabled/missing radio lyrics must remain non-blocking and fit the lower pane.
- Hold a mouse press on an album search suggestion: it must not navigate until release. Complete the click and activate a suggestion with Enter: the album opens in the main view and existing playback stays intact.

The separate Now Playing page redesign tracked in #226 remains deferred; this change controls the existing sidebar panes independently.

## Player bar surface

The bottom player bar uses a 50%-opaque charcoal surface over the shared artwork wash, with background blur and fully opaque content/controls. The artwork wash extends behind the footer; switching off artwork wash or visual effects retains the theme background instead. This changes the surface, not playback, layout or volume behavior.


## Library artwork

Library tracks with an album use that album's cover throughout Home, the player,
Now Playing, search, listening-history shelves and artwork washes. Track-embedded
artwork does not replace missing album artwork: those albums show a placeholder.
Tracks without an album retain their own artwork. Resolution uses album identity
and the shared album cache, including restored tracks outside the current catalog;
queue/history metadata is preserved. Radio and explicit playlist/artist artwork
retain their separate sources. Playlist artwork fallback uses the first track's
album cover.
