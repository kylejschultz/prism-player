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


## macOS FLAC compatibility mode

A diagnostic capture and a corrected real-file reproduction confirmed that WebKit can hold currentTime at an early ended=true state for about14seconds, then jump to a longer duration before firing ended. Advancing on that premature flag could truncate music. The lossless preparation path fixes the supplied-file reproduction without depending on that flag.

Settings → FLAC compatibility → **Prepare FLAC tracks for accurate seeking** is available in the macOS desktop app and defaults off. Enabling it requests original FLAC bytes, downloads and decodes the whole track before playback, then supplies an ephemeral float32 PCM WAV Blob to the same local audio slots. OfflineAudioContext uses the file's own sample rate; decoded channel count/frame count/rate must match STREAMINFO. Supported mono/stereo FLAC up to24bit retains exact sample values in float32; no DSP or lossy transcode is introduced. Ordinary streaming, Radio playback and other platforms keep their existing engines. This feature is not a permanent download/offline library.

Preparation is serial. Only current and next are retained; during a crossfade the outgoing audio replaces the next preparation slot until fading completes. Switching selections aborts stale download/preparation waits, discards late results and revokes removed Blob URLs. Pause during preparation does not autoplay on completion. Toggling modes preserves the local position; pending resume/seeks are applied on metadata. Prepared-media errors fall back once to original streaming while preserving play intent; ordinary original-stream errors retain their existing server-stream fallback. Local prepared data is retained while Radio is active, with further next-track preparation deferred.

Preflight limits:64MiB compressed download,128MiB float32 WAV output, positive declared frame count,8–192kHz source rate, at most stereo/24bit,60second preparation wait. Both content length and streamed byte totals are bounded; STREAMINFO output size is checked before decoding. The decoded result is checked again before WAV allocation. Browser decoder/transient allocations add to retained payload memory; native decode already in flight cannot be physically cancelled, but aborted results cannot be used or retained. Files outside limits or failures use ordinary streaming with a visible **Compatibility unavailable · original stream** notice. That fallback can retain the original FLAC seek limitation; it is not represented as a successful fix.

The footer shows **Preparing lossless audio…** while starting. Settings explain the startup/memory tradeoff. The feature saves neither original audio nor PCM to persistent app storage. Diagnostics add only a preparedPcm boolean; raw URLs/Blob URLs remain excluded.

Automated checks cover sample/header/size integrity, cancellation, timeout, serial preparation/crossfade retention/cleanup, stale results, pause/resume, original fallback and rejected-play intent. Real six-second synthetic FLAC exercises the complete UI/player; the optional supplied-file WebKit test exercises the recorded105.759second seek against112.92second audio and requires next selection within11seconds. Native and actual-server acceptance remain explicit candidate checks.
