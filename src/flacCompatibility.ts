export const MAX_FLAC_DOWNLOAD_BYTES = 64 * 1024 * 1024;
export const MAX_PCM_BYTES = 128 * 1024 * 1024;
export type FlacInfo = { sampleRate: number; channels: number; samples: number };

export function isFlac(song: { contentType?: string; suffix?: string } | null) {
  return Boolean(song && (song.suffix?.toLowerCase() === "flac" || ["audio/flac", "audio/x-flac"].includes(song.contentType?.toLowerCase().split(";")[0] ?? "")));
}

export function readFlacInfo(bytes: Uint8Array): FlacInfo {
  if (bytes.length < 42 || String.fromCharCode(...bytes.subarray(0, 4)) !== "fLaC" || (bytes[4] & 127) !== 0 || bytes[5] !== 0 || bytes[6] !== 0 || bytes[7] !== 34) throw new Error("Unsupported FLAC header");
  const packed = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getBigUint64(18);
  const sampleRate = Number(packed >> 44n);
  const channels = Number((packed >> 41n) & 7n) + 1;
  const bits = Number((packed >> 36n) & 31n) + 1;
  const samples = Number(packed & ((1n << 36n) - 1n));
  if (!samples || sampleRate < 8000 || sampleRate > 192000 || channels > 2 || bits < 4 || bits > 24 || samples * channels * 4 + 44 > MAX_PCM_BYTES) throw new Error("Track exceeds lossless preparation limits");
  return { sampleRate, channels, samples };
}

export async function readFlacResponse(response: Response, signal: AbortSignal) {
  if (!response.ok || !response.body || Number(response.headers.get("Content-Length")) > MAX_FLAC_DOWNLOAD_BYTES) {
    await response.body?.cancel();
    throw new Error("FLAC download unavailable or too large");
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  const prefix = new Uint8Array(42);
  let length = 0;
  let prefixLength = 0;
  let checked = false;
  try {
    while (true) {
      signal.throwIfAborted();
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_FLAC_DOWNLOAD_BYTES) throw new Error("FLAC download too large");
      if (prefixLength < 42) {
        const part = value.subarray(0, 42 - prefixLength);
        prefix.set(part, prefixLength); prefixLength += part.length;
      }
      if (!checked && prefixLength === 42) { readFlacInfo(prefix); checked = true; }
      chunks.push(value);
    }
    signal.throwIfAborted();
    if (!checked) throw new Error("Incomplete FLAC header");
    const bytes = new Uint8Array(length);
    let at = 0;
    for (const chunk of chunks) { bytes.set(chunk, at); at += chunk.byteLength; }
    return bytes.buffer;
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally { reader.releaseLock(); }
}

export function pcmWave(decoded: Pick<AudioBuffer, "length" | "numberOfChannels" | "sampleRate" | "getChannelData">, info: FlacInfo) {
  if (decoded.length !== info.samples || decoded.numberOfChannels !== info.channels || decoded.sampleRate !== info.sampleRate || decoded.length * decoded.numberOfChannels * 4 + 44 > MAX_PCM_BYTES) throw new Error("Decoded format could not be preserved");
  const size = decoded.length * decoded.numberOfChannels * 4;
  const bytes = new ArrayBuffer(44 + size);
  const view = new DataView(bytes);
  function word(at: number, text: string) { for (let i = 0; i < text.length; i++) view.setUint8(at + i, text.charCodeAt(i)); }
  word(0, "RIFF"); view.setUint32(4, size + 36, true); word(8, "WAVEfmt ");
  view.setUint32(16, 16, true); view.setUint16(20, 3, true); view.setUint16(22, info.channels, true);
  view.setUint32(24, info.sampleRate, true); view.setUint32(28, info.sampleRate * info.channels * 4, true);
  view.setUint16(32, info.channels * 4, true); view.setUint16(34, 32, true); word(36, "data"); view.setUint32(40, size, true);
  // Float32 retains every value in supported <=24-bit FLAC; no resampling or DSP.
  for (let channel = 0; channel < info.channels; channel++) {
    const data = decoded.getChannelData(channel);
    for (let frame = 0; frame < decoded.length; frame++) view.setFloat32(44 + (frame * info.channels + channel) * 4, data[frame], true);
  }
  return new Blob([bytes], { type: "audio/wav" });
}

export async function prepareFlac(source: string, signal: AbortSignal) {
  const bytes = await readFlacResponse(await fetch(source, { signal, cache: "no-store" }), signal);
  const info = readFlacInfo(new Uint8Array(bytes));
  const context = new OfflineAudioContext(info.channels, 1, info.sampleRate);
  const decoded = await context.decodeAudioData(bytes);
  signal.throwIfAborted();
  const wav = pcmWave(decoded, info);
  signal.throwIfAborted();
  return URL.createObjectURL(wav);
}

type Entry = { state: "queued" | "preparing" | "ready" | "fallback"; url: string | null; failedUrl?: string; controller: AbortController };
// One preparation at a time; only the current/next (or outgoing crossfade) are retained.
export class FlacPreparationQueue {
  private entries = new Map<string, Entry>();
  private priority: string[] = [];
  private running = false;
  private notify: () => void = () => undefined;
  private prepare: typeof prepareFlac;
  private revoke: (url: string) => void;
  constructor(prepare = prepareFlac, revoke = (url: string) => URL.revokeObjectURL(url)) { this.prepare = prepare; this.revoke = revoke; }
  select(current: string | null, next: string | null, retainedUrl: string | null, notify: () => void) {
    this.notify = notify;
    const retained = retainedUrl ? [...this.entries].find(([, entry]) => entry.url === retainedUrl)?.[0] : undefined;
    this.priority = [...new Set([current, retained && retained !== current ? retained : next].filter((url): url is string => Boolean(url)))];
    for (const [source, entry] of this.entries) if (!this.priority.includes(source)) {
      entry.controller.abort(); if (entry.url) this.revoke(entry.url); this.entries.delete(source);
    }
    for (const source of this.priority) if (!this.entries.has(source)) this.entries.set(source, { state: "queued", url: null, controller: new AbortController() });
    this.notify();
    void this.pump();
  }
  resolve(source: string | null) {
    const entry = source ? this.entries.get(source) : undefined;
    return { url: entry?.state === "ready" ? entry.url : entry?.state === "fallback" ? source : null, preparing: Boolean(source && (!entry || entry.state === "queued" || entry.state === "preparing")), fallback: entry?.state === "fallback" };
  }
  reject(source: string, url: string) {
    const entry = this.entries.get(source);
    if (entry?.state === "fallback" && entry.failedUrl === url) return true;
    if (!entry || entry.state !== "ready" || entry.url !== url) return false;
    this.revoke(url); entry.failedUrl = url; entry.url = null; entry.state = "fallback"; this.notify(); return true;
  }
  clear() { this.select(null, null, null, () => undefined); }
  private async pump() {
    if (this.running) return;
    this.running = true;
    try {
      while (true) {
        const source = this.priority.find(key => this.entries.get(key)?.state === "queued");
        if (!source) break;
        const entry = this.entries.get(source)!;
        entry.state = "preparing"; this.notify();
        const timeout = setTimeout(() => entry.controller.abort(), 60_000);
        // Abort stops download immediately and bounds the wait for native decoding.
        let onAbort: () => void = () => undefined;
        const aborted = new Promise<never>((_, reject) => { onAbort = () => reject(new DOMException("Preparation cancelled", "AbortError")); entry.controller.signal.addEventListener("abort", onAbort, { once: true }); });
        const prepared = this.prepare(source, entry.controller.signal).then(url => {
          if (entry.controller.signal.aborted || this.entries.get(source) !== entry) { this.revoke(url); throw new DOMException("Stale preparation", "AbortError"); }
          return url;
        });
        try { entry.url = await Promise.race([prepared, aborted]); entry.state = "ready"; }
        catch { entry.state = "fallback"; }
        finally { clearTimeout(timeout); entry.controller.signal.removeEventListener("abort", onAbort); }
        if (this.entries.get(source) === entry) this.notify();
      }
    } finally { this.running = false; }
  }
}
