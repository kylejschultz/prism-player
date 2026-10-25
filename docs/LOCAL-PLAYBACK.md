# Library playback timing and seeking

Prism displays the active audio element's media clock. Radio retains its separate listener-aligned clock. Both local audio slots share the same time, metadata, duration and completed-seek handlers; standby events must not overwrite active timing.

For a library file whose MIME type (or suffix-derived MIME) this engine advertises as playable, Prism requests OpenSubsonic `stream` with `format=raw`. Original files retain duration metadata and HTTP byte-range seeking instead of implicitly inheriting a server transcode. Unknown/unsupported formats use the existing server-selected stream. A failed original stream falls back once per track for the session, preserving playback intent and resume position; a second failure surfaces the existing error. This may use more bandwidth for lossless tracks than server transcoding.

A seek writes `currentTime` but waits for the engine's confirmed position on `seeked`/`timeupdate`. While seeking, time updates do not publish an unconfirmed position or trigger a crossfade. Finite positive media duration remains authoritative, with catalog duration used until media metadata is available. Fractional seeking remains continuous. We do not rescale the media clock to catalog length or advance on an ordinary time update merely because a displayed estimate reaches its endpoint. An explicit completed seek to the exact media endpoint while playback is active skips the remaining tail; a paused seek stays paused. Repeat one restarts that track.

## Evidence and limits

The earlier precision-only change did not resolve Kyle's real-library report. Implicit transcoding is a plausible cause, not a confirmed diagnosis of his server. OpenSubsonic documents `format=raw` as disabling transcoding. Navidrome serves raw files with byte ranges, whereas uncached transcoded output can be non-seekable. Real media tests must honor HTTP Range/206 responses; returning an entire file as 200 for every request can silently seek to zero.

- [OpenSubsonic stream contract](https://opensubsonic.netlify.app/docs/endpoints/stream/)
- [Navidrome media streamer](https://github.com/navidrome/navidrome/blob/master/core/stream/media_streamer.go)

Maintained tests exercise engine-confirmed positions, wrong/clamped seek results, active/standby isolation, original-stream selection, bounded fallback and actual browser playback through seeking and next-track advancement. Separate generated 24-bit FLAC media exercises raw playback in Chrome and Playwright WebKit without library credentials. Playwright WebKit's terminal event behavior differs in this environment; that probe is not proof of Tauri/audio acceptance.

## Candidate manual check

1. Replay a library track that previously finished on the bar while audio continued. Compare the audible last 10–15 seconds, displayed elapsed/total and next-track transition.
2. Seek near the end, then back to the middle; check the audible position and synced lyric together. Repeat while paused and resume.
3. Check another lossless track and a compressed track. If the mismatch remains, capture the displayed elapsed/total, expected length and file format through the app; do not retrieve credentials or access Keychain from audit scripts.
4. Check next/previous, pause/resume, optional crossfade and relaunch resume. Do not change the radio timing path to fix a library-only issue.

Kyle's real Navidrome playback remains the acceptance gate. Automated success does not establish that the reported mismatch is resolved on his library.

## End-of-track destination and loading

The next selection and audio slot become current before awaiting `play()`. Network/decoder startup displays the incoming song with **Loading…**, cleared by its `playing` event. A cold next track follows the same visible selection path. Handoff completion re-arms standby preloading for the following track. Normal completion uses no crossfade after the outgoing audio has ended; an existing crossfade still ramps both volumes. Repeat one never preloads its way past the repeated track. Active-slot refs and transition generations prevent a late prior play promise from overriding or pausing a later selection.

Regression fixtures hold the next play promise, exercise preloaded/cold handoffs, seek-to-end/repeat one, and cancel with Next/Pause during a handoff/crossfade. Real browser audio still exercises seek/clock/next-track behavior. Native audio buffering and actual server latency remain manual acceptance checks.


## Opt-in playback diagnostics

Settings → Playback diagnostics → Start recording captures local playback timing in memory for up to five minutes. It remains active while navigating, including returning to Now Playing or an album. Stop recording freezes the data; Copy diagnostics copies JSON and reveals a selectable report (also usable if the clipboard is unavailable). Clear diagnostics discards it; restarting clears the previous capture; relaunching always starts disabled. Nothing is uploaded or written to persistent storage by the recorder. The bounded buffer retains the most recent2000 observations and reports how many earlier observations were dropped.

The schema deliberately copies only numeric/boolean clocks and state, known format labels, requested raw/server-selected mode, fallback flag, repeat/crossfade settings, media-event names, active/standby slot and queue position. It includes seek requests, duration/currentTime/displayed timing, seekable/buffered ranges, ready/network states, media error code (never message), play intent and transition state. One-second samples can expose ended=true without an ended callback. Queue positions correlate local transitions without retaining track IDs or names. It collects no credentials, URLs, account details, file paths, lyrics or library objects. Requested mode and catalog format do **not** establish the actual HTTP response codec; diagnostics issue no extra stream/metadata requests.

To investigate the affected FLAC: start capture, play the affected track, seek near the end and then to the end, allow the next-track handoff, stop and copy. Record a working-track comparison separately. Capturing observes playback and does not change decoding, seeking or end-of-track handling. Real server/native reproduction remains a manual check; the isolated original-file test did not reproduce the full reported overrun.
