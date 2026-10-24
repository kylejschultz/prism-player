# Lyrics support

Open Lyrics from the player footer to show lyrics in the right sidebar.

## Library playback

Prism first requests OpenSubsonic `getLyricsBySongId` for the exact library song ID. When the server provides timed lyrics, the current line uses larger bold type and scrolls into view using the local audio playback position. The lyrics viewport fills the sidebar height, with compact spacing between surrounding lines. Pause holds the current line; seeking in either direction updates it immediately. Empty timed lines clear the previous highlight during instrumental gaps.

The adapter prefers the first usable synced variant over untimed variants. Start times are milliseconds. The entry offset is subtracted from each start time, clamped at zero: positive means earlier, negative means later. This matches the line-level timing used by Subwave. No radio cue trimming or station offset is applied to local files.

If only untimed structured lyrics exist, Prism displays them as plain text. If the structured endpoint is unavailable, fails, or has no usable lyrics, Prism tries the classic artist/title `getLyrics` endpoint. No lyrics or failed lookups show a message without interrupting playback. Requests are bounded and cancelled when changing tracks/modes or closing Lyrics.

Your Navidrome/OpenSubsonic server must supply timestamped lyrics for synchronization. Prism does not generate timestamps or fetch from a separate third-party lyrics provider. Plain lyrics remain plain.

## Radio playback

Subwave lyrics use the station's advertised capability and read-only listener API. Older or disabled stations make no lyrics request. Radio timing follows the heard track and station offset; local playback uses its own media clock.

## Verification

`npm test` covers structured payloads, variant selection, offsets, instrumental gaps, endpoint fallback, timeout and cancellation. `npm run test:browser` covers local playback/timeupdate, pause, seeking, scrolling, plain/missing lyrics and local/radio transitions with mocked services/media. Real server lyric availability and audible synchronization need a native manual check.

References: [OpenSubsonic endpoint](https://opensubsonic.netlify.app/docs/endpoints/getlyricsbysongid/), [structured lyrics fields](https://opensubsonic.netlify.app/docs/responses/structuredlyrics/), [Subwave merged lyrics PR](https://github.com/perminder-klair/subwave/pull/1316).
