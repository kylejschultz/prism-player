# Synthetic playback fixture

`clock-24bit.flac` is six seconds of generated digital silence: stereo,24bit,44100Hz. It contains no library or account data and may be used freely for tests. Its decoded duration and sample count are exact.

Generated from a WAV containing6 ×44100 ×2 zero-valued24bit samples using macOS `afconvert -f flac -d flac input.wav clock-24bit.flac`. The fixture is committed so tests require no converter or network download.

The optional WebKit test accepts a separate local112.92second FLAC through `PRISM_FLAC_SAMPLE`. That real sample stays outside this repository and is never attached to test output.
