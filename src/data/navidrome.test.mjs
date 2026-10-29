import assert from "node:assert/strict";
import test from "node:test";
import { navidromeClient, normalizeStructuredLyrics } from "./navidrome.ts";

const config = { serverUrl: "https://fixture.invalid", username: "fixture", password: "fixture-only" };

function clock(t) {
  let expire;
  let cleared = false;
  globalThis.window = {
    setTimeout(callback, delay) { assert.equal(delay, 10_000); expire = callback; return 1; },
    clearTimeout(id) { assert.equal(id, 1); cleared = true; },
  };
  t.after(() => { delete globalThis.window; });
  return { expire: () => expire(), cleared: () => cleared };
}

function untilAborted(signal) {
  return new Promise((_, reject) => {
    const abort = () => reject(new globalThis.DOMException("Aborted", "AbortError"));
    if (signal.aborted) abort();
    else signal.addEventListener("abort", abort, { once: true });
  });
}

test("profile name trims success and releases its timeout/caller listener", async (t) => {
  const timer = clock(t);
  const caller = new globalThis.AbortController();
  let requestSignal;
  t.mock.method(globalThis, "fetch", async (_, options) => {
    requestSignal = options.signal;
    return { ok: true, json: async () => ({ name: " Fixture Listener " }) };
  });
  assert.equal(await navidromeClient.profileName(config, caller.signal), "Fixture Listener");
  assert.ok(timer.cleared());
  caller.abort();
  assert.equal(requestSignal.aborted, false);
});

test("profile timeout also bounds a stalled response body", async (t) => {
  const timer = clock(t);
  t.mock.method(globalThis, "fetch", async (_, { signal }) => ({ ok: true, json: () => untilAborted(signal) }));
  const pending = navidromeClient.profileName(config);
  await Promise.resolve();
  timer.expire();
  await assert.rejects(pending, { name: "AbortError" });
  assert.ok(timer.cleared());
});

test("profile lookup cancels on caller abort, including an already-aborted caller", async (t) => {
  const timer = clock(t);
  t.mock.method(globalThis, "fetch", (_, { signal }) => untilAborted(signal));
  const caller = new globalThis.AbortController();
  const pending = navidromeClient.profileName(config, caller.signal);
  caller.abort();
  await assert.rejects(pending, { name: "AbortError" });
  await assert.rejects(navidromeClient.profileName(config, caller.signal), { name: "AbortError" });
  assert.ok(timer.cleared());
});

test("profile errors clean up and a response without a name is harmless", async (t) => {
  const timer = clock(t);
  const mock = t.mock.method(globalThis, "fetch", async () => ({ ok: false, status: 503 }));
  await assert.rejects(navidromeClient.profileName(config), /503/);
  assert.ok(timer.cleared());
  mock.mock.mockImplementation(async () => ({ ok: true, json: async () => ({}) }));
  assert.equal(await navidromeClient.profileName(config), "");
});

const song = { id: "track-id", title: "Fixture song", artist: "Fixture artist" };
const structured = (...entries) => ({ lyricsList: { structuredLyrics: entries } });
const timed = { synced: true, offset: 500, line: [{ start: 3001, value: "Second" }, { start: 100, value: " First " }] };

test("structured lyrics prefer a usable timed variant, sort milliseconds and apply positive offsets sooner", () => {
  assert.deepEqual(normalizeStructuredLyrics(structured(
    { synced: false, line: [{ value: "Plain alternative" }] },
    { synced: true, line: [] }, timed,
  )), [{ text: "First", startMs: 0 }, { text: "Second", startMs: 2501 }]);
});

test("negative offsets delay lyrics and fractional starts remain milliseconds", () => {
  assert.deepEqual(normalizeStructuredLyrics(structured({ synced: true, offset: -100, line: [{ start: 3001.5, value: "Delayed" }] })), [{ text: "Delayed", startMs: 3101.5 }]);
});

test("empty timed lines clear instrumental gaps; unsynced entries never gain fake timing", () => {
  assert.deepEqual(normalizeStructuredLyrics(structured({ synced: true, line: [{ start: 1000, value: "Sing" }, { start: 2000, value: "" }] })), [{ text: "Sing", startMs: 1000 }, { text: "", startMs: 2000 }]);
  assert.deepEqual(normalizeStructuredLyrics(structured({ synced: false, offset: 1000, line: [{ start: 5000, value: "Plain" }, { value: "" }] })), [{ text: "Plain", startMs: null }]);
});

test("malformed/empty structured payloads are harmless and invalid timings remain plain", () => {
  for (const payload of [null, {}, { lyricsList: null }, structured(null, {}, { line: [null, 4, { value: 6 }] })]) {
    assert.deepEqual(normalizeStructuredLyrics(payload), []);
  }
  assert.deepEqual(normalizeStructuredLyrics(structured({ synced: true, offset: Infinity, line: [{ start: null, value: "No timing" }, { start: -1, value: "Invalid" }] })), [{ text: "No timing", startMs: null }, { text: "Invalid", startMs: null }]);
});

test("library lyrics request exact song ID and skip legacy lookup when structured lyrics exist", async (t) => {
  clock(t);
  const requests = [];
  t.mock.method(globalThis, "fetch", async url => {
    requests.push(url);
    return { ok: true, json: async () => ({ "subsonic-response": { status: "ok", ...structured(timed) } }) };
  });
  assert.equal((await navidromeClient.lyrics(config, song))[1].startMs, 2501);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].pathname, "/rest/getLyricsBySongId.view");
  assert.equal(requests[0].searchParams.get("id"), song.id);
});

for (const failure of [404, 501, 503, "missing", "unsupported", "empty"]) {
  test(`library lyrics fall back to plain lyrics for ${failure}`, async (t) => {
    clock(t);
    const requests = [];
    t.mock.method(globalThis, "fetch", async url => {
      const endpoint = url.pathname.split("/").at(-1);
      requests.push(endpoint);
      if (endpoint === "getLyricsBySongId.view") {
        if (typeof failure === "number") return { ok: false, status: failure };
        return { ok: true, json: async () => ({ "subsonic-response": failure === "empty" ? { status: "ok", ...structured() } : { status: "failed", error: { code: failure === "missing" ? 70 : 0, message: "Fixture refusal" } } }) };
      }
      assert.equal(url.searchParams.get("artist"), song.artist);
      assert.equal(url.searchParams.get("title"), song.title);
      return { ok: true, json: async () => ({ "subsonic-response": { status: "ok", lyrics: { value: "First\n\nSecond" } } }) };
    });
    assert.deepEqual(await navidromeClient.lyrics(config, song), [{ text: "First", startMs: null }, { text: "Second", startMs: null }]);
    assert.deepEqual(requests, ["getLyricsBySongId.view", "getLyrics.view"]);
  });
}

test("lyric requests abort without starting fallback, and release their timeout/listener", async (t) => {
  const timer = clock(t);
  const caller = new globalThis.AbortController();
  let calls = 0;
  t.mock.method(globalThis, "fetch", (_, { signal }) => { calls++; return untilAborted(signal); });
  const pending = navidromeClient.lyrics(config, song, caller.signal);
  caller.abort();
  await assert.rejects(pending, { name: "AbortError" });
  assert.equal(calls, 1);
  assert.ok(timer.cleared());
});

test("lyric timeout bounds a stalled body, then safely tries the legacy endpoint", async (t) => {
  const timer = clock(t);
  t.mock.method(globalThis, "fetch", async (url, { signal }) => ({ ok: true, json: () => url.pathname.includes("BySongId") ? untilAborted(signal) : Promise.resolve({ "subsonic-response": { status: "ok", lyrics: "Fallback" } }) }));
  const pending = navidromeClient.lyrics(config, song);
  await Promise.resolve(); timer.expire();
  assert.deepEqual(await pending, [{ text: "Fallback", startMs: null }]);
});
