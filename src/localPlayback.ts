import type { Song } from "./App";

// Direct files retain their duration metadata and HTTP byte-range seeking. Let the
// server choose a transcode for formats this engine cannot decode (or that fail).
export function canPlayOriginal(song: Pick<Song, "contentType" | "suffix">, canPlayType: (type: string) => string): boolean {
  const types: Record<string, string> = { flac: "audio/flac", mp3: "audio/mpeg", m4a: "audio/mp4", aac: "audio/aac", ogg: "audio/ogg", opus: 'audio/ogg; codecs="opus"', wav: "audio/wav", aiff: "audio/aiff" };
  const type = song.contentType || types[song.suffix?.toLowerCase() || ""];
  return Boolean(type && canPlayType(type));
}
