# Prism Player

Prism Player is a desktop music player for Navidrome and other Subsonic-compatible servers. It keeps your library, queue, playlists, and Subwave radio in one place without making you use a browser tab.

It is still early, but there are desktop builds for macOS and Windows.

## Get Prism

Grab the installer for your platform from the [latest GitHub release](https://github.com/kylejschultz/prism-player/releases/latest). Only use builds from Prism's GitHub releases.

Prism is pre-1.0 software. The main library and playback experience are in place, but app signing and auto-updates are not yet.

### Important: unsigned builds

The current macOS and Windows builds are *not yet code-signed*, so your operating system may warn you before opening them. That is expected for now.

- On macOS, if Prism is blocked, open it once, then go to *System Settings → Privacy & Security* and choose *Open Anyway* for Prism.
- On Windows, if Microsoft Defender SmartScreen shows “Windows protected your PC,” select *More info*, then *Run anyway*.

Only bypass these warnings if you downloaded Prism from the releases page above.

## First connection

1. Open Prism.
2. Enter the address of your Navidrome or other Subsonic-compatible server.
3. Sign in, then listen to your library.

![Prism's first-run Navidrome connection screen](docs/images/navidrome-first-run.png)

## Listen to Subwave Radio

Prism can tune into a Subwave station right alongside your library.

1. Open *Settings* and select *Radio*.
2. Under *Subwave channels*, add your station address, such as `https://subwave.example.com`.
3. Return to the *Radio* item in the sidebar, select the station, and choose *Tune In*.
4. While listening, you can check the schedule and booth feed, request a song, like the current track, or stop the stream.

Prism checks that the address is a Subwave station before connecting. You can save more than one station and switch between them later.

Once you're tuned in, Prism shows what's playing and gives you the radio controls without taking you away from the rest of your music.

![Subwave radio in Prism](docs/images/subwave-radio.png)

Use the request button when you want to send something to the station.

![Subwave song request in Prism](docs/images/subwave-request.png)

## Status

Prism is pre-1.0 software. If something is broken or you have an idea, open a [GitHub issue](https://github.com/kylejschultz/prism-player/issues).

## Contributing

Want to work on Prism? Development setup, branches, tests, and release notes are in [CONTRIBUTING.md](CONTRIBUTING.md).

## What’s in it

- Navidrome and Subsonic server support.
- Artists, albums, playlists, favorites, recently added, and recently played views.
- A proper queue, plus shuffle, repeat, seeking, and volume controls.
- Search for artists, albums, songs, and playlists.
- Playlist editing and favorites.
- Subwave radio with now-playing, schedules, requests, likes, and booth updates.
- Queue, now-playing details, and lyrics in the sidebar.


## Privacy

Prism stores your server connection and playback preferences locally. Optional anonymous analytics are opt-in. They only include app and install details, plus aggregate library counts; they do not include your account or playback data.

## License

License details are not set yet.
