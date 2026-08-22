import type { RadioLikeStatus, RadioRequestResult, RadioSchedulePayload, RadioSessionPayload, RadioStationState } from "../App";

function stationOrigin(value: string) {
  const trimmed = value.trim();
  if (!trimmed) throw new Error("Enter a valid Subwave station URL.");
  return new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`).origin;
}

async function request<T>(stationUrl: string, endpoint: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(`${stationOrigin(stationUrl)}/api/${endpoint.replace(/^\/+/, "")}`, { cache: "no-store", ...init, signal: controller.signal });
    if (!response.ok) throw new Error("That address answered, but not like a Subwave station.");
    return (await response.json()) as T;
  } finally {
    window.clearTimeout(timeout);
  }
}

// Radio transport alignment and playback promotion are local timing concerns;
// this client owns requests but deliberately does not introduce a Query cache.
export const subwaveClient = {
  state: (stationUrl: string) => request<RadioStationState>(stationUrl, "state"),
  session: (stationUrl: string) => request<RadioSessionPayload>(stationUrl, "session"),
  schedule: (stationUrl: string) => request<RadioSchedulePayload>(stationUrl, "schedule"),
  likeStatus: (stationUrl: string) => request<RadioLikeStatus>(stationUrl, "like"),
  submitLike: (stationUrl: string, songId: string) => request<RadioLikeStatus>(stationUrl, "like", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ songId }) }),
  submitRequest: (stationUrl: string, text: string, name: string) => request<RadioRequestResult>(stationUrl, "request", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, name }) }),
};
