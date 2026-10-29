# First-run Home and release notes

The Navidrome connection dialog has priority over automatic release notes. Release notes stay queued while setup is open and appear only after setup succeeds or is closed. Dismissing them records the current app version as before; returning users with unread notes still see those notes on startup. Test candidates retain the current package version until release-please prepares the next release.

When no local track or listening history exists, Home fills the listening slot with Start listening. Connected users can open Albums with Browse albums; disconnected users can open connection settings with Connect library. Radio remains alongside it, or below it in a narrow window. The normal listening/resume card replaces this prompt once a track is available. No synthetic listening history or automatic playback is added.

## Acceptance

- Start with no stored connection, playback or seen-release version: only setup is mounted and accessible. Completing or closing setup shows release notes alone.
- Dismiss release notes and reopen: they remain dismissed. An unconnected user can still complete setup; returning users with unread notes still see them.
- Open a connected library before playing anything: Start listening fills the former blank area, Browse albums opens the album library, and Radio stays reachable. Check normal and short/narrow windows for wrapping or overlap.
- Play a track and return Home: the existing listening/resume card takes the prompt's place. No local candidate is installed automatically or tested against real saved credentials.
