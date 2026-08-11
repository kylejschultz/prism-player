# Prism Player

Prism Player is a focused desktop music player for Navidrome and other Subsonic-compatible libraries. It gives your music server a fast, native-feeling home: an easy library browser, a proper queue, and a clean listening surface that never feels like another web tab.

Built for the way you actually listen, Prism brings your collection, playlists, and live Subwave radio into one polished desktop player. The app is currently in early active development, with macOS and Windows desktop builds.

## Get Prism

Download the appropriate installer from the [latest GitHub release](https://github.com/kylejschultz/prism-player/releases/latest). Only install builds from Prism's GitHub releases.

Prism is pre-1.0 software. The core Navidrome library and playback loop is in place, but signing, auto-update, and broader platform support are still being shaped.

### Important: unsigned builds

The current macOS and Windows builds are *not yet code-signed*. Your operating system may warn you before it opens them. This is expected for now; signing is planned for a future release.

- On macOS, if Prism is blocked, open it once, then go to *System Settings → Privacy & Security* and choose *Open Anyway* for Prism.
- On Windows, if Microsoft Defender SmartScreen shows “Windows protected your PC,” select *More info*, then *Run anyway*.

Only bypass these warnings for a Prism installer you downloaded from the official releases page above.

## First connection

1. Open Prism.
2. Enter the address of your Navidrome or other Subsonic-compatible server.
3. Sign in, then browse your library, build a queue, and start listening.

## Listen to Subwave Radio

Prism includes a built-in Subwave radio experience alongside your music library.

1. Open *Settings* and select *Radio*.
2. Under *Subwave channels*, add your station address, such as `https://subwave.example.com`.
3. Return to the *Radio* item in the sidebar, select the station, and choose *Tune In*.
4. While listening, use the radio controls to see the schedule and booth feed, request a song, like the current track, or stop the stream.

Prism validates the station before it connects, and you can save more than one Subwave channel to switch between them later.

## Status

Prism is pre-1.0 software. Feedback and bug reports are welcome through [GitHub Issues](https://github.com/kylejschultz/prism-player/issues).

## Contributing

Development setup, branches, commits, tests, and release workflow live in [CONTRIBUTING.md](CONTRIBUTING.md).

## Features at a glance

- Connect to Navidrome and other Subsonic-compatible music servers.
- Browse artists, albums, playlists, favorites, recently added, and recently played music in grid or list views.
- Play directly from your server with a persistent queue, shuffle, repeat, seeking, and volume controls.
- Search artists, albums, songs, and playlists, then explore rich album, artist, and playlist detail views.
- Create, edit, reorder, and manage playlists; star songs, albums, and artists.
- Tune into Subwave stations with live now-playing, schedules, requests, likes, and booth updates.
- Keep queue, now-playing details, lyrics, and listening preferences close at hand.


## Privacy

Prism stores your server connection and local playback preferences in browser/app local storage. Optional anonymous analytics are opt-in and limited to install-level app metadata such as app version, install ID, platform, channel, whether the build is a development or release build, and aggregate artist, album, and song counts. Account and playback data are not sent.

## License

License details are not set yet.
