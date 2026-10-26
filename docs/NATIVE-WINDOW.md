# Native window and workspace layout

On macOS, Prism extends its webview beneath an overlay title bar and hides the native title text. The operating system still owns close, minimize, zoom/full-screen, resizing and window accessibility. Windows and Linux retain their standard native frames; the macOS window options do not replace their controls.

Search stays in the existing 56px workspace header, now at the top of the macOS content area. Native controls have a reserved 96px area at the upper left. Navigation starts below their drag region. When navigation is hidden, the header reserves 104px on either side to keep Search and Back clear of the controls.

Only blank header space and the reserved upper-left region are marked as Tauri drag regions. Search, suggestions and Back remain interactive. Tauri handles native dragging and title-bar double clicks; Prism grants only the additional `core:window:allow-start-dragging` permission. Signing, app identity and stored window-placement behavior are unchanged.

The search header and Radio surface are transparent over the same artwork wash. Radio does not apply a second backdrop filter. Equal flexible rows center artwork and track details vertically in the Radio viewport when space permits, while station summaries stay at the bottom. In short windows, summaries retain their minimum height and the page can scroll rather than overlap the listening content.

## Acceptance checks

Automated fixtures cover Radio alignment and summary reachability with lyrics/timeline at 980×640, 1440×900 and 1920×1080; absence of the extra backdrop; native-button space with navigation expanded/collapsed; Search and Back; and the non-macOS layout.

Before publishing a macOS candidate, also check the actual packaged app:

1. Close/minimize/zoom/full-screen controls remain usable and clear of branding, Back and Search.
2. Drag blank header space and the upper-left region; double-click the header using the system's preferred behavior.
3. Type/select text in Search, choose a suggestion and use Back with navigation open and hidden.
4. Resize to the minimum size, zoom, enter/exit full screen, close/reopen and restore the window on the current monitor.
5. On Radio, check vertical centering and the uninterrupted artwork wash with playback panels open and closed. Station summaries must remain reachable in short windows.

Browser fixtures and an isolated native window fixture establish different evidence. A native fixture using the same window configuration does not establish functional acceptance of the complete packaged app or its saved account state.
