# Combined playback sidebar

The single sidebar button to the right of volume opens or closes the playback sidebar. It retains the saved open state and width. The former Queue/Lyrics tab preference is ignored because both panes are now visible together.

The upper pane shows the local queue or radio timeline. The lower pane shows lyrics and starts larger by default. Drag the divider between the panes to adjust their split; the saved split survives reopening the sidebar and app. Focus the divider and use Up/Down arrows to adjust it, or Home/End to reach either limit. The split keeps at least 140px for the upper pane and 220px for lyrics when space permits, adapting within shorter windows. Both scroll independently, and the lyrics fill their allocated lower area down to the footer. Synced lines remain centered within that area, including first/final verses and wrapped lines; the existing emphasis and blur apply. Plain, loading and unavailable lyrics retain their existing states.

In the radio timeline, On air remains visible above one independently scrollable list, with Up next followed by Recently played. The list is keyboard-focusable; Home/End move to its start/end, and scrolling it does not move lyrics. With On air pinned, the radio timeline reserves at least 168px above the divider when available, keeping a complete next row reachable at the minimum split. Local queue allocations retain their existing 140px minimum.

For radio, schedule, requests and booth feed occupy the upper pane without replacing lyrics. The timeline button in the sidebar header returns to the timeline. Cancelling a request or selecting the same radio tool again also returns to the timeline. Stopping radio restores the local queue above lyrics.

Lyrics load while the sidebar is visible and cancel when it closes. Switching upper radio tools does not restart the lyric request. The old standalone Queue/Lyrics buttons are removed; Escape and the close control close the combined sidebar.

Search suggestions activate on completed clicks, not mouse-down. Focus can move from Search into suggestions without dismissing them. Album, artist and playlist suggestions open their detail views; song suggestions retain their explicit playback action. Selecting an album must not replace or start the current playback.

## Acceptance

- Open/close the sidebar with mouse and keyboard, resize the window/sidebar, and reopen the app to verify its saved open state.
- Drag the divider, adjust it with the keyboard, and reopen the app to verify the saved split. Resize between short and tall windows; neither pane may overlap the footer.
- Check queue selection, removal and reordering while lyrics remain in the lower pane. Scrolling the queue must not move the current lyric.
- Check synced first/middle/final verses at minimum, normal and tall window sizes; lyrics must fill the lower allocation without overlap or dead space.
- Check radio timeline, schedule, request cancellation and booth feed while lyrics stay loaded. Older/disabled/missing radio lyrics must remain non-blocking and fit the lower pane.
- Hold a mouse press on an album search suggestion: it must not navigate until release. Complete the click and activate a suggestion with Enter: the album opens in the main view and existing playback stays intact.

The separate Now Playing page redesign tracked in #226 remains deferred; this change combines the existing sidebar panes.
