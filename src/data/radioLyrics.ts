export type RadioLyricLine = { text: string; startMs: number | null };
export type RadioLyricsResult =
  | { state: "ready"; lines: RadioLyricLine[]; offsetMs: number }
  | { state: "unsupported" | "disabled" | "locked" | "stale" }
  | { state: "unavailable"; retryAfterMs?: number };

/** Read-only listener API from Subwave #1316. No operator credentials or writes. */
export async function fetchRadioLyrics(stationUrl: string, songId: string, signal: AbortSignal): Promise<RadioLyricsResult> {
  const url = new URL("/api/lyrics/current", stationUrl);
  url.searchParams.set("songId", songId);
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal.addEventListener("abort", abort, { once: true });
  if (signal.aborted) abort();
  const timeout = globalThis.setTimeout(abort, 8_000);
  try {
    const response = await fetch(url, { signal: controller.signal, cache: "no-store" });
    if (response.status === 404 || response.status === 501) return { state: "unsupported" };
    if (response.status === 403) return { state: "disabled" };
    if (response.status === 401) return { state: "locked" };
    if (response.status === 409) return { state: "stale" };
    if (response.status === 503) {
      const header = response.headers.get("Retry-After");
      const seconds = header == null ? NaN : Number(header);
      const delay = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(header ?? "") - Date.now();
      return { state: "unavailable", retryAfterMs: Math.max(5_000, Number.isFinite(delay) ? delay : 10_000) };
    }
    if (!response.ok) return { state: "unavailable" };
    const payload = await response.json() as {
      songId?: unknown; synced?: unknown; offsetMs?: unknown; lines?: unknown;
    } | null;
    if (!payload || payload.songId !== songId) return { state: "stale" };
    if (typeof payload.synced !== "boolean" || typeof payload.offsetMs !== "number"
      || !Number.isFinite(payload.offsetMs) || Math.abs(payload.offsetMs) > 30_000 || !Array.isArray(payload.lines)) {
      return { state: "unavailable" };
    }
    const lines: RadioLyricLine[] = [];
    for (const line of payload.lines) {
      if (!line || typeof line.text !== "string" || (line.startMs !== null
        && (typeof line.startMs !== "number" || !Number.isFinite(line.startMs)))) return { state: "unavailable" };
      if (line.text.trim()) lines.push({ text: line.text.trim(), startMs: payload.synced ? line.startMs : null });
    }
    return { state: "ready", lines, offsetMs: payload.offsetMs };
  } catch {
    return { state: "unavailable" };
  } finally {
    globalThis.clearTimeout(timeout);
    signal.removeEventListener("abort", abort);
  }
}
