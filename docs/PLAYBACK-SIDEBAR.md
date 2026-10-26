# Combined playback sidebar

The single sidebar button beside volume opens or closes the playback sidebar. It retains the saved open state and width. The former Queue/Lyrics tab preference is ignored because both panes are now visible together.

The upper pane shows the local queue or radio timeline. The larger lower pane shows lyrics. Both scroll independently, and the lyrics fill their allocated lower area down to the footer. Synced lines remain centered within that area, including first/final verses and wrapped lines; the existing emphasis and blur apply. Plain, loading and unavailable lyrics retain their existing states.

For radio, schedule, requests and booth feed occupy the upper pane without replacing lyrics. The timeline button in the sidebar header returns to the timeline. Cancelling a request or selecting the same radio tool again also returns to the timeline. Stopping radio restores the local queue above lyrics.

Lyrics load while the sidebar is visible and cancel when it closes. Switching upper radio tools does not restart the lyric request. The old standalone Queue/Lyrics buttons are removed; Escape and the close control close the combined sidebar.

Search suggestions activate on completed clicks, not mouse-down. Focus can move from Search into suggestions without dismissing them. Album, artist and playlist suggestions open their detail views; song suggestions retain their explicit playback action. Selecting an album must not replace or start the current playback.

## Acceptance

- Open/close the sidebar with mouse and keyboard, resize the window/sidebar, and reopen the app to verify its saved open state.
- Check queue selection, removal and reordering while lyrics remain in the lower pane. Scrolling the queue must not move the current lyric.
- Check synced first/middle/final verses at minimum, normal and tall window sizes; lyrics must fill the lower allocation without overlap or dead space.
- Check radio timeline, schedule, request cancellation and booth feed while lyrics stay loaded. Older/disabled/missing radio lyrics must remain non-blocking and fit the lower pane.
- Hold a mouse press on an album search suggestion: it must not navigate until release. Complete the click and activate a suggestion with Enter: the album opens in the main view and existing playback stays intact.

The separate Now Playing page redesign tracked in #226 remains deferred; this change combines the existing sidebar panes.
