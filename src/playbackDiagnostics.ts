// Deliberately allowlisted: never serialize a Song, URL, config, Event or error message.
export const PLAYBACK_DIAGNOSTIC_EVENTS = [
  "loadstart", "loadedmetadata", "loadeddata", "durationchange", "canplay", "canplaythrough",
  "play", "playing", "pause", "waiting", "stalled", "suspend", "abort", "emptied",
  "seeking", "seeked", "timeupdate", "ended", "error", "ratechange",
  "sample", "capture-start", "capture-stop", "seek-request", "source-selected", "selection-changed", "server-fallback",
] as const;
export type PlaybackDiagnosticEvent = typeof PLAYBACK_DIAGNOSTIC_EVENTS[number];
export type PlaybackDiagnosticState = "idle" | "recording" | "stopped";
export type PlaybackDiagnosticContext = {
  slot: 0 | 1;
  active: boolean;
  localPlayback: boolean;
  queuePosition: number;
  catalogDuration: number;
  sourceFormat?: string;
  requestedStreamMode: "raw" | "server-selected" | "none";
  serverFallback: boolean;
  preparedPcm?: boolean;
  playIntent: boolean;
  transitioning: boolean;
  displayedPosition: number;
  displayedDuration: number;
  repeatMode: "off" | "all" | "one";
  crossfadeSeconds: number;
};
type MediaSnapshot = Pick<HTMLMediaElement, "currentTime" | "duration" | "paused" | "ended" | "seeking" | "readyState" | "networkState" | "playbackRate" | "error" | "seekable" | "buffered">;
const MAX_RECORDS = 2000;
const FORMATS = ["flac", "mp3", "m4a", "aac", "ogg", "opus", "wav", "aiff", "audio/flac", "audio/x-flac", "audio/mpeg", "audio/mp4", "audio/aac", "audio/ogg", "audio/opus", "audio/wav", "audio/x-wav", "audio/aiff"];
const finite = (value: number) => Number.isFinite(value) ? Math.round(value * 1000) / 1000 : null;
function ranges(value: TimeRanges) {
  const result: (number | null)[][] = [];
  // Ranges can change while metadata loads; diagnostics must never interrupt playback.
  try {
    for (let i = 0; i < Math.min(value.length, 4); i++) result.push([finite(value.start(i)), finite(value.end(i))]);
  } catch { /* Keep any ranges already read. */ }
  return result;
}
export class PlaybackDiagnostics {
  private now: () => number;
  private startedAt = 0;
  private state: PlaybackDiagnosticState = "idle";
  private records: object[] = [];
  private droppedRecords = 0;
  constructor(now = () => performance.now()) { this.now = now; }
  start() {
    this.clear();
    this.startedAt = this.now();
    this.state = "recording";
  }
  stop() { if (this.state === "recording") this.state = "stopped"; }
  clear() { this.records = []; this.droppedRecords = 0; this.state = "idle"; }
  record(event: PlaybackDiagnosticEvent, audio: MediaSnapshot, context: PlaybackDiagnosticContext, requestedTime?: number) {
    if (this.state !== "recording" || !PLAYBACK_DIAGNOSTIC_EVENTS.includes(event)) return;
    const format = context.sourceFormat?.toLowerCase().split(";")[0];
    this.records.push({
      elapsedMs: finite(this.now() - this.startedAt), event,
      slot: context.slot === 1 ? 1 : 0,
      active: Boolean(context.active), localPlayback: Boolean(context.localPlayback),
      queuePosition: finite(context.queuePosition), catalogDuration: finite(context.catalogDuration),
      sourceFormat: format && FORMATS.includes(format) ? format : "unknown",
      requestedStreamMode: context.requestedStreamMode === "raw" ? "raw" : context.requestedStreamMode === "server-selected" ? "server-selected" : "none",
      serverFallback: Boolean(context.serverFallback), preparedPcm: Boolean(context.preparedPcm), playIntent: Boolean(context.playIntent), transitioning: Boolean(context.transitioning),
      displayedPosition: finite(context.displayedPosition), displayedDuration: finite(context.displayedDuration),
      repeatMode: context.repeatMode === "one" ? "one" : context.repeatMode === "all" ? "all" : "off",
      crossfadeSeconds: finite(context.crossfadeSeconds),
      currentTime: finite(audio.currentTime), duration: finite(audio.duration),
      paused: Boolean(audio.paused), ended: Boolean(audio.ended), seeking: Boolean(audio.seeking),
      readyState: finite(audio.readyState), networkState: finite(audio.networkState), playbackRate: finite(audio.playbackRate),
      errorCode: finite(audio.error?.code ?? 0), seekable: ranges(audio.seekable), buffered: ranges(audio.buffered),
      ...(requestedTime === undefined ? {} : { requestedTime: finite(requestedTime) }),
    });
    if (this.records.length > MAX_RECORDS) { this.records.shift(); this.droppedRecords++; }
  }
  exportJSON() {
    return JSON.stringify({ schema: "prism-playback-diagnostics-v1", state: this.state, droppedRecords: this.droppedRecords, events: this.records }, null, 2);
  }
}
